// Pochical's people's Slack channel (spec/admin.md): each user's support
// chat is a thread there, where a reply goes to the user as ポチカル, and
// new reports are posted with the way to the admin site. Without the
// secrets nothing is posted and no reply is taken; Slack failing never
// fails what the user did.
import { waitUntil } from "cloudflare:workers";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { supportChats } from "./db/schema";
import { answerSupport } from "./support-answers";

type SlackEnv = Env & {
  SLACK_BOT_TOKEN?: string;
  SLACK_CHANNEL_ID?: string;
  SLACK_SIGNING_SECRET?: string;
};

/** Pochical's people's admin site (apps/admin). */
export const ADMIN_SITE = "https://admin.pochical.app";

/** How long a signed request from Slack stays good, against replays. */
const SIGNATURE_AGE_S = 300;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** Words as Slack shows them as written: no mention, link or markup. */
export const toSlackText = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const SLACK_LINK = /<(?<target>[^<>|]*)(?:\|(?<label>[^<>]*))?>/gu;

/** A Slack message's words as the user reads them in the app. */
export const fromSlackText = (text: string): string =>
  text
    .replaceAll(SLACK_LINK, (_, target: string, label?: string) => {
      if (target.startsWith("@") || target.startsWith("!")) {
        return label === undefined ? "" : `@${label}`;
      }
      if (target.startsWith("#")) {
        return `#${label ?? ""}`;
      }
      if (target.startsWith("mailto:")) {
        return label ?? target.slice("mailto:".length);
      }
      return target;
    })
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const bytesOfHex = (hex: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^(?:[0-9a-f]{2})+$/u.test(hex)) {
    return null;
  }
  return new Uint8Array(
    hex.match(/../gu)?.map((pair) => Number.parseInt(pair, 16)) ?? []
  );
};

/**
 * Whether `body` came from Slack: signed with the app's signing secret
 * (v0, HMAC-SHA256 of the timestamp and the body), and lately.
 */
export const signedBySlack = async (
  secret: string,
  headers: Headers,
  body: string,
  nowMs: number
): Promise<boolean> => {
  const timestamp = headers.get("X-Slack-Request-Timestamp") ?? "";
  const signature = bytesOfHex(
    (headers.get("X-Slack-Signature") ?? "").replace(/^v0=/u, "")
  );
  const sentS = Number(timestamp);
  if (
    secret === "" ||
    signature === null ||
    !Number.isInteger(sentS) ||
    Math.abs(nowMs / 1000 - sentS) > SIGNATURE_AGE_S
  ) {
    return false;
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["verify"]
  );
  return await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(`v0:${timestamp}:${body}`)
  );
};

/** One of Slack's Web API methods as the app; null when it did not take. */
const slackCall = async (
  env: SlackEnv,
  method: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown> | null> => {
  const token = env.SLACK_BOT_TOKEN ?? "";
  const channel = env.SLACK_CHANNEL_ID ?? "";
  if (token === "" || channel === "") {
    return null;
  }
  try {
    const response = await fetch(`https://slack.com/api/${method}`, {
      body: JSON.stringify({ channel, ...args }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      method: "POST",
    });
    const result: unknown = await response.json();
    if (isRecord(result) && result.ok === true) {
      return result;
    }
    // Slack's own word for why (not_in_channel, missing_scope, ...), for
    // the Worker's logs.
    console.error(
      `Slack ${method} failed`,
      isRecord(result) ? result.error : response.status
    );
    return null;
  } catch (error) {
    console.error(`Slack ${method} failed`, error);
    return null;
  }
};

const threadOf = async (
  env: SlackEnv,
  userId: string
): Promise<string | null> => {
  const [chat] = await drizzle(env.DB)
    .select({ thread: supportChats.slackThreadTs })
    .from(supportChats)
    .where(eq(supportChats.userId, userId));
  return chat?.thread ?? null;
};

/**
 * A user's new line, in their chat's thread, shown in the channel too;
 * their first starts the thread, with the way to the admin site.
 */
export const tellStaffOfLine = async (
  env: SlackEnv,
  userId: string,
  words: string,
  device: string | null
): Promise<void> => {
  const thread = await threadOf(env, userId);
  const quoted = toSlackText(words);
  if (thread !== null) {
    await slackCall(env, "chat.postMessage", {
      reply_broadcast: true,
      text: quoted,
      thread_ts: thread,
    });
    return;
  }
  const page = `${ADMIN_SITE}/support/${encodeURIComponent(userId)}`;
  const from = device === null ? "" : `（${toSlackText(device)}）`;
  const posted = await slackCall(env, "chat.postMessage", {
    text: `サポートに新しいメッセージ${from}\n${quoted}\n<${page}|管理サイトで開く>・このスレッドに書くと、ポチカルとして返信します`,
  });
  const ts = stringOf(posted?.ts);
  if (ts === undefined) {
    return;
  }
  // Two first lines at once keep the thread the first kept.
  await drizzle(env.DB)
    .update(supportChats)
    .set({ slackThreadTs: ts })
    .where(
      and(eq(supportChats.userId, userId), isNull(supportChats.slackThreadTs))
    );
};

/** An answer written on the admin site, in the chat's thread. */
export const tellStaffOfAnswer = async (
  env: SlackEnv,
  userId: string,
  words: string
): Promise<void> => {
  const thread = await threadOf(env, userId);
  if (thread === null) {
    return;
  }
  await slackCall(env, "chat.postMessage", {
    text: `管理サイトから返信しました：\n${toSlackText(words)}`,
    thread_ts: thread,
  });
};

/** A member's report, with the way to the admin site. */
export const tellStaffOfReport = async (
  env: SlackEnv,
  why: string
): Promise<void> => {
  await slackCall(env, "chat.postMessage", {
    text: `新しい通報（${why}）\n<${ADMIN_SITE}/reports|管理サイトで開く>`,
  });
};

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
    fromSlackText(stringOf(event.text) ?? ""),
    stringOf(event.client_msg_id) ?? `slack-${ts}`
  );
  await (kept
    ? slackCall(env, "reactions.add", {
        name: "white_check_mark",
        timestamp: ts,
      })
    : slackCall(env, "chat.postMessage", {
        text: "届けられませんでした：空か、長すぎます。",
        thread_ts: thread,
      }));
};

/**
 * The kinds of message a person's reply comes as: plain, also sent to the
 * channel, or with a file.
 */
const REPLY_SUBTYPES = new Set([undefined, "thread_broadcast", "file_share"]);

/** Whether an event is a person's new reply in a thread of the channel. */
const isStaffReply = (env: SlackEnv, event: Record<string, unknown>): boolean =>
  event.type === "message" &&
  REPLY_SUBTYPES.has(stringOf(event.subtype)) &&
  event.bot_id === undefined &&
  event.channel === env.SLACK_CHANNEL_ID &&
  typeof event.thread_ts === "string" &&
  event.thread_ts !== event.ts;

/**
 * Slack's Events API (`/slack/events`): Slack's check of the address, and
 * replies in the channel's threads, taken after Slack is answered, within
 * the three seconds it waits.
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
  if (isRecord(event) && isStaffReply(env, event)) {
    waitUntil(answerFromSlack(env, event));
  }
  return new Response(null, { status: 200 });
};
