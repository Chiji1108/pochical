// What Pochical's people do in their Slack channel (spec/admin.md), as
// Slack's Events API tells it at `/slack/events`: a reply in a chat's
// thread is an answer, an emoji on a user's line is their reaction, and
// an answer deleted there is taken back.
import { waitUntil } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { supportChats } from "./db/schema";
import {
  emojiOfSlackName,
  fromSlackText,
  isRecord,
  signedBySlack,
  slackCall,
  stringOf,
} from "./slack";
import type { SlackEnv } from "./slack";
import { answerSupport, tellSupportChanged } from "./support-answers";
import { lineWhere, reactTo, unsendLine } from "./support-chat";

/**
 * A reply in a chat's thread, by one of Pochical's people: sent to the
 * user as ポチカル and marked ✅, or answered with why not. Slack sends an
 * event again when unsure it arrived; its message id keeps it once.
 */
const answerFromSlack = async (
  env: SlackEnv,
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
  // Only words reach the user: a reply with a file is not half sent.
  if (Array.isArray(event.files) && event.files.length > 0) {
    await slackCall(env, "chat.postMessage", {
      text: "届けられませんでした：写真やファイルはまだ届けられません。文だけで返信してください。",
      thread_ts: thread,
    });
    return;
  }
  const kept = await answerSupport(
    env,
    chat.userId,
    fromSlackText(stringOf(event.text) ?? "", event.blocks),
    { id: stringOf(event.client_msg_id) ?? `slack-${ts}`, slackTs: ts }
  );
  await (kept === null
    ? slackCall(env, "chat.postMessage", {
        text: "届けられませんでした：空か、長すぎます。",
        thread_ts: thread,
      })
    : slackCall(env, "reactions.add", {
        name: "white_check_mark",
        timestamp: ts,
      }));
};

/** An answer deleted in Slack, taken back from the user's chat too. */
const unsendFromSlack = async (env: SlackEnv, ts: string): Promise<void> => {
  const line = await lineWhere(env, { slackTs: ts });
  if (line === undefined || !line.fromSupport || line.unsent) {
    return;
  }
  await unsendLine(env, line.id);
  await tellSupportChanged(env, line.userId);
};

/**
 * An emoji Pochical's people put on a user's line in Slack, or took off,
 * as their reaction in the user's chat; one with no emoji known here is
 * left in Slack alone.
 */
const reactFromSlack = async (
  env: SlackEnv,
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
  env: SlackEnv,
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
  env: SlackEnv
): Promise<Response> => {
  const body = await request.text();
  const signed = await signedBySlack(
    env.SLACK_SIGNING_SECRET ?? "",
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
