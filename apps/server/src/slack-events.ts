// What Pochical's people do in their Slack channel (spec/admin.md), as
// Slack's Events API tells it at `/slack/events`: a reply in a chat's
// thread is an answer, an emoji on a user's line is their reaction, and
// an answer deleted there is taken back.
import { chatRules } from "@pochical/design/chat";
import { waitUntil } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { supportChats } from "./db/schema";
import { supportPhotoKey } from "./photos";
import {
  emojiOfSlackName,
  fromSlackText,
  isRecord,
  signedBySlack,
  slackCall,
  slackFile,
  stringOf,
} from "./slack";
import { answerSupport, tellSupportChanged } from "./support-answers";
import type { SupportPhotoOf } from "./support-answers";
import {
  lineWhere,
  linesWithSlackTs,
  reactTo,
  unsendLine,
} from "./support-chat";

/**
 * An image Pochical's people shared, kept under the user's support photos
 * at a size the chat shows: Slack's 1024 pixel picture of it, or the
 * image itself when it has none and fits chatRules.photoMaxBytes.
 */
const keepSlackPhoto = async (
  env: Env,
  userId: string,
  file: Record<string, unknown>
): Promise<SupportPhotoOf | null> => {
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
  await env.PHOTOS.put(supportPhotoKey(userId, id), image.bytes, {
    httpMetadata: { contentType: image.type },
  });
  return { height, id, width };
};

/**
 * A reply in a chat's thread, by one of Pochical's people: each image in
 * it, then its words, sent to the user as ポチカル and marked ✅, or
 * answered with what did not go. Slack sends an event again when unsure it
 * arrived; its message and files' ids keep each once.
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
  const base = stringOf(event.client_msg_id) ?? `slack-${ts}`;
  const files = Array.isArray(event.files) ? event.files.filter(isRecord) : [];
  const images = files
    .filter((file) => stringOf(file.mimetype)?.startsWith("image/") === true)
    .slice(0, chatRules.photosPerSend);
  const missed: string[] = [];
  if (images.length < files.length) {
    missed.push("写真のほかのファイルや、一度に送れる枚数を超えた写真");
  }
  for (const [index, image] of images.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- the photos go in order
    const photo = await keepSlackPhoto(env, chat.userId, image);
    const kept =
      photo !== null &&
      // oxlint-disable-next-line no-await-in-loop -- as above
      (await answerSupport(env, chat.userId, "", {
        id: `${base}-photo-${index}`,
        photo,
        slackTs: ts,
      })) !== null;
    if (!kept) {
      missed.push("読めなかった写真");
    }
  }
  const words = fromSlackText(stringOf(event.text) ?? "", event.blocks);
  if (words.trim() !== "" || images.length === 0) {
    const kept = await answerSupport(env, chat.userId, words, {
      id: base,
      slackTs: ts,
    });
    if (kept === null) {
      missed.push("空か、長すぎる文");
    }
  }
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
  const withTs = await linesWithSlackTs(env, ts);
  const lines = withTs.filter((line) => line.fromSupport && !line.unsent);
  for (const line of lines) {
    // oxlint-disable-next-line no-await-in-loop -- a few at most
    await unsendLine(env, line);
  }
  const [first] = lines;
  if (first !== undefined) {
    await tellSupportChanged(env, first.userId);
  }
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
  const line = await lineWhere(env, { slackTs: ts });
  if (line === undefined || line.fromSupport || line.unsent) {
    return;
  }
  await reactTo(env, line.id, true, emoji, on);
  await tellSupportChanged(env, line.userId);
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
  if (channel !== env.SLACK_CHANNEL_ID) {
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
    env.SLACK_SIGNING_SECRET,
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
