// What Pochical's people do in their Slack channel (spec/admin.md), as
// Slack's Events API tells it at `/slack/events`: a reply in a chat's
// thread is an answer, an emoji on a user's line is their reaction, and
// an answer deleted there is taken back.
import { create } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { chatRules } from "@pochical/design/chat";
import { textLimits } from "@pochical/design/limits";
import { waitUntil } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { supportChats } from "./db/schema";
import { ChatEditSchema } from "./gen/pochical/v1/sync_pb";
import { GROUP_THREAD } from "./group-chat";
import { CREATE_ONLY, photoKey } from "./photos";
import {
  emojiOfSlackName,
  fromSlackText,
  isRecord,
  signedBySlack,
  slackCall,
  slackFile,
  slackSecret,
  stringOf,
} from "./slack";
import { supportPlace } from "./support-lines";
import { linesOfSlackTs } from "./support-place";
import { withinLimit } from "./text-limits";

type EditKind = MessageInitShape<typeof ChatEditSchema>["kind"];

/** One of Pochical's people's edits of the chat, as a member's outbox sends one. */
const editOf = (opId: string, kind: EditKind) =>
  create(ChatEditSchema, { kind, opId });

/**
 * An image Pochical's people shared, kept with the chat's photos at a size
 * the chat shows (Slack's 1024 pixel picture of it, or the image itself
 * when it has none and fits chatRules.photoMaxBytes) and noted as theirs,
 * so their line may send it.
 */
const keepSlackPhoto = async (
  env: Env,
  userId: string,
  file: Record<string, unknown>
): Promise<{ id: string; width: number; height: number } | null> => {
  const fileId = stringOf(file.id);
  const thumb = stringOf(file.thumb_1024);
  const url = thumb ?? stringOf(file.url_private_download);
  const width = thumb === undefined ? file.original_w : file.thumb_1024_w;
  const height = thumb === undefined ? file.original_h : file.thumb_1024_h;
  if (
    fileId === undefined ||
    url === undefined ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return null;
  }
  const image = await slackFile(env, url, chatRules.photoMaxBytes);
  if (image === null) {
    return null;
  }
  const id = `slack-${fileId}`;
  const place = env.GROUPS.getByName(supportPlace(userId));
  const note = await place.notePhoto(id, chatRules.pochicalMember);
  if (note === "refused") {
    return null;
  }
  // Sent already, as Slack tells an event again: its line, by the same
  // op_id, is dropped as sent.
  if (note === "noted") {
    await env.PHOTOS.put(photoKey(supportPlace(userId), id), image.bytes, {
      httpMetadata: { contentType: image.type },
      onlyIf: CREATE_ONLY,
    });
  }
  return { height, id, width };
};

/**
 * A reply in a chat's thread, by one of Pochical's people: each image in
 * it, then its words, sent to the user as ポチカル, each line keeping the
 * reply's message, and marked ✅, or answered with what did not go. Slack
 * sends an event again when unsure it arrived; its message's id keeps
 * each line once.
 */
const answerFromSlack = async (
  env: Env,
  event: Record<string, unknown>
): Promise<void> => {
  const thread = stringOf(event.thread_ts);
  const ts = stringOf(event.ts);
  if (thread === undefined || ts === undefined) {
    return;
  }
  const [chat] = await drizzle(env.DB)
    .select({ userId: supportChats.userId })
    .from(supportChats)
    .where(eq(supportChats.slackThreadTs, thread));
  if (chat === undefined) {
    return;
  }
  const place = env.GROUPS.getByName(supportPlace(chat.userId));
  const base = stringOf(event.client_msg_id) ?? `slack-${ts}`;
  const files = Array.isArray(event.files) ? event.files.filter(isRecord) : [];
  const images = files
    .filter((file) => stringOf(file.mimetype)?.startsWith("image/") === true)
    .slice(0, chatRules.photosPerSend);
  const missed: string[] = [];
  if (images.length < files.length) {
    missed.push("写真のほかのファイルや、一度に送れる枚数を超えた写真");
  }
  const edits: ReturnType<typeof editOf>[] = [];
  for (const [index, image] of images.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- the photos go in order
    const photo = await keepSlackPhoto(env, chat.userId, image);
    if (photo === null) {
      missed.push("読めなかった写真");
    } else {
      edits.push(
        editOf(`${base}-photo-${index}`, {
          case: "send",
          value: {
            // Photos posted at once are one album, as the app sends them.
            album: images.length > 1 ? base : "",
            photo,
            text: "",
            threadId: GROUP_THREAD,
          },
        })
      );
    }
  }
  const words = fromSlackText(stringOf(event.text) ?? "", event.blocks).trim();
  if (words !== "" || images.length === 0) {
    if (words === "" || !withinLimit(words, textLimits.chatMessage)) {
      missed.push("空か、長すぎる文");
    } else {
      edits.push(
        editOf(base, {
          case: "send",
          value: { text: words, threadId: GROUP_THREAD },
        })
      );
    }
  }
  // The chat's relay keeps which lines the message is (support_slack).
  await place.answerAsPochical(edits, ts);
  await (missed.length === 0
    ? slackCall(env, "reactions.add", {
        name: "white_check_mark",
        timestamp: ts,
      })
    : slackCall(env, "chat.postMessage", {
        text: `届けられなかったもの：${[...new Set(missed)].join("、")}`,
        thread_ts: thread,
      }));
};

/**
 * An answer deleted in Slack, taken back from the user's chat too: each
 * line it was, its photos and its words.
 */
const unsendFromSlack = async (env: Env, ts: string): Promise<void> => {
  const lines = await linesOfSlackTs(env, ts);
  const [first] = lines;
  if (first === undefined) {
    return;
  }
  await env.GROUPS.getByName(supportPlace(first.userId)).answerAsPochical(
    lines.map(({ seq }) =>
      editOf(`slack-unsend-${ts}-${seq}`, {
        case: "unsend",
        value: { seq: BigInt(seq), threadId: GROUP_THREAD },
      })
    )
  );
};

/**
 * An emoji Pochical's people put on a user's line in Slack, or took off,
 * as their reaction in the user's chat; one with no emoji known here is
 * left in Slack alone.
 */
const reactFromSlack = async (
  env: Env,
  event: Record<string, unknown>,
  on: boolean
): Promise<void> => {
  const ts = isRecord(event.item) ? stringOf(event.item.ts) : undefined;
  const emoji = emojiOfSlackName(stringOf(event.reaction) ?? "");
  if (ts === undefined || emoji === undefined) {
    return;
  }
  const [line] = await linesOfSlackTs(env, ts);
  if (line === undefined) {
    return;
  }
  const place = env.GROUPS.getByName(supportPlace(line.userId));
  // Only the user's lines: an emoji on an answer stays in Slack.
  if (!(await place.isUsersLine(line.seq))) {
    return;
  }
  await place.answerAsPochical([
    editOf(crypto.randomUUID(), {
      case: "react",
      value: { emoji, on, seq: BigInt(line.seq), threadId: GROUP_THREAD },
    }),
  ]);
};

/**
 * The kinds of message a person's reply comes as: plain, also sent to the
 * channel, or with a file.
 */
const REPLY_SUBTYPES = new Set([undefined, "thread_broadcast", "file_share"]);

/** Whether an event is a person's new reply in a thread of the channel. */
const isStaffReply = (event: Record<string, unknown>): boolean =>
  event.type === "message" &&
  REPLY_SUBTYPES.has(stringOf(event.subtype)) &&
  event.bot_id === undefined &&
  typeof event.thread_ts === "string" &&
  event.thread_ts !== event.ts;

/** The app's own bot, whose reactions are the app's, not a person's. */
const botOf = (payload: Record<string, unknown>): string | undefined => {
  const { authorizations } = payload;
  const first: unknown = Array.isArray(authorizations)
    ? authorizations.at(0)
    : undefined;
  return isRecord(first) ? stringOf(first.user_id) : undefined;
};

/** The work an event in the channel asks for, if any. */
const workOf = (
  env: Env,
  payload: Record<string, unknown>,
  event: Record<string, unknown>
): Promise<void> | undefined => {
  const channel = isRecord(event.item) ? event.item.channel : event.channel;
  if (channel !== slackSecret(env.SLACK_CHANNEL_ID)) {
    return undefined;
  }
  if (event.type === "reaction_added" || event.type === "reaction_removed") {
    return event.user === botOf(payload)
      ? undefined
      : reactFromSlack(env, event, event.type === "reaction_added");
  }
  const deleted = stringOf(event.deleted_ts);
  if (event.subtype === "message_deleted" && deleted !== undefined) {
    return unsendFromSlack(env, deleted);
  }
  return isStaffReply(event) ? answerFromSlack(env, event) : undefined;
};

/**
 * Slack's Events API (`/slack/events`): Slack's check of the address, and
 * what is done in the channel, taken after Slack is answered, within the
 * three seconds it waits.
 */
export const slackEvents = async (
  request: Request,
  env: Env
): Promise<Response> => {
  const body = await request.text();
  const signed = await signedBySlack(
    slackSecret(env.SLACK_SIGNING_SECRET),
    request.headers,
    body,
    Date.now()
  );
  if (!signed) {
    return new Response("Not from Slack", { status: 401 });
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Not JSON", { status: 400 });
  }
  if (!isRecord(payload)) {
    return new Response("Not an event", { status: 400 });
  }
  if (payload.type === "url_verification") {
    return Response.json({ challenge: payload.challenge });
  }
  const { event } = payload;
  const work = isRecord(event) ? workOf(env, payload, event) : undefined;
  if (work !== undefined) {
    waitUntil(work);
  }
  return new Response(null, { status: 200 });
};
