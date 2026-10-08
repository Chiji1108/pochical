// Pochical's people's Slack channel (spec/admin.md): each user's support
// chat is a thread there, where a reply goes to the user as ポチカル, and
// new reports are posted with the way to the admin site. Without the
// secrets nothing is posted and no reply is taken; Slack failing never
// fails what the user did.
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { supportChats } from "./db/schema";
import { keepSlackTs } from "./support-chat";
import type { SupportLineOf } from "./support-chat";

export type SlackEnv = Env & {
  SLACK_BOT_TOKEN?: string;
  SLACK_CHANNEL_ID?: string;
  SLACK_SIGNING_SECRET?: string;
};

/** Pochical's people's admin site (apps/admin). */
export const ADMIN_SITE = "https://admin.pochical.app";

/** How long a signed request from Slack stays good, against replays. */
const SIGNATURE_AGE_S = 300;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const stringOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** Words as Slack shows them as written: no mention, link or markup. */
export const toSlackText = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const SLACK_LINK = /<(?<target>[^<>|]*)(?:\|(?<label>[^<>]*))?>/gu;

/**
 * Each emoji in a message's rich text blocks, as its text writes it
 * (`:+1::skin-tone-2:`) and as the character it stands for. A workspace's
 * own emoji have no character, and stay as written.
 */
const emojiIn = (blocks: unknown, found = new Map<string, string>()) => {
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      emojiIn(block, found);
    }
  } else if (isRecord(blocks)) {
    const { name, skin_tone: tone, type, unicode } = blocks;
    if (
      type === "emoji" &&
      typeof name === "string" &&
      typeof unicode === "string"
    ) {
      const skin = typeof tone === "number" ? `:skin-tone-${tone}:` : "";
      const points = unicode
        .split("-")
        .map((point) => Number.parseInt(point, 16));
      if (
        points.every(
          (point) =>
            Number.isInteger(point) && point >= 0 && point <= 0x10_ff_ff
        )
      ) {
        found.set(`:${name}:${skin}`, String.fromCodePoint(...points));
      }
    }
    emojiIn(blocks.elements, found);
  }
  return found;
};

/** `text` with each emoji's name as its character. */
const withEmoji = (text: string, blocks: unknown): string => {
  let words = text;
  // The names with a skin tone first, as each starts with the name alone.
  const names = [...emojiIn(blocks)].toSorted(
    ([a], [b]) => b.length - a.length
  );
  for (const [name, emoji] of names) {
    words = words.replaceAll(name, emoji);
  }
  return words;
};

/**
 * A Slack message's words as the user reads them in the app: its links,
 * mentions and escapes as plain words, and its emoji, which Slack's text
 * writes by name, as the characters its blocks give.
 */
export const fromSlackText = (text: string, blocks?: unknown): string =>
  withEmoji(text, blocks)
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
export const slackCall = async (
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

export const threadOf = async (
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
 * Each reaction the app offers first (Reactions.swift's reactionChoices)
 * and others Pochical's people often use, by their Slack names: Slack
 * names an emoji where the app writes it.
 */
const SLACK_EMOJI: Record<string, string> = {
  "+1": "👍",
  "-1": "👎",
  "100": "💯",
  bow: "🙇",
  clap: "👏",
  cry: "😢",
  eyes: "👀",
  fire: "🔥",
  heart: "❤️",
  heart_eyes: "😍",
  joy: "😂",
  muscle: "💪",
  ok_hand: "👌",
  pray: "🙏",
  raised_hands: "🙌",
  slightly_smiling_face: "🙂",
  smile: "😄",
  sob: "😭",
  sparkles: "✨",
  sweat_smile: "😅",
  tada: "🎉",
  thinking_face: "🤔",
  white_check_mark: "✅",
};

/** A reaction's Slack name as the emoji, its skin tone too, if known. */
export const emojiOfSlackName = (name: string): string | undefined => {
  const [base = "", tone] = name.split("::skin-tone-");
  const emoji = SLACK_EMOJI[base];
  const shade = Number(tone);
  if (emoji === undefined || tone === undefined) {
    return emoji;
  }
  // Skin tones 2 to 6 are the five modifiers, U+1F3FB on.
  return Number.isInteger(shade) && shade >= 2 && shade <= 6
    ? emoji + String.fromCodePoint(0x1_f3_fb + shade - 2)
    : emoji;
};

const slackNameOf = (emoji: string): string | undefined =>
  Object.entries(SLACK_EMOJI).find(([, each]) => each === emoji)?.[0];

/** The first words of a line, as a reply to it shows them. */
const QUOTE_LENGTH = 80;

/**
 * A chat's thread's first message: the user's first line, with the app
 * and device, the way to the admin site and how to answer.
 */
const threadHead = (line: SupportLineOf, words: string): string => {
  const page = `${ADMIN_SITE}/support/${encodeURIComponent(line.userId)}`;
  const from = line.device === null ? "" : `（${toSlackText(line.device)}）`;
  return `サポートに新しいメッセージ${from}\n${words}\n<${page}|管理サイトで開く>・このスレッドに書くと、ポチカルとして返信します`;
};

/**
 * A user's new line, in their chat's thread, shown in the channel too;
 * their first starts the thread, with the way to the admin site. A reply
 * quotes what it is to. Its message is kept with the line, for its
 * reactions and its taking back.
 */
export const tellStaffOfLine = async (
  env: SlackEnv,
  line: SupportLineOf,
  repliedTo: SupportLineOf | null
): Promise<void> => {
  const thread = await threadOf(env, line.userId);
  const quote =
    repliedTo === null
      ? ""
      : `> ${toSlackText(repliedTo.text.replaceAll("\n", " ").slice(0, QUOTE_LENGTH))}\n`;
  const words = `${quote}${toSlackText(line.text)}`;
  if (thread !== null) {
    const posted = await slackCall(env, "chat.postMessage", {
      reply_broadcast: true,
      text: words,
      thread_ts: thread,
    });
    const ts = stringOf(posted?.ts);
    if (ts !== undefined) {
      await keepSlackTs(env, line.id, ts);
    }
    return;
  }
  const posted = await slackCall(env, "chat.postMessage", {
    text: threadHead(line, words),
  });
  const ts = stringOf(posted?.ts);
  if (ts === undefined) {
    return;
  }
  await keepSlackTs(env, line.id, ts);
  // Two first lines at once keep the thread the first kept.
  await drizzle(env.DB)
    .update(supportChats)
    .set({ slackThreadTs: ts })
    .where(
      and(
        eq(supportChats.userId, line.userId),
        isNull(supportChats.slackThreadTs)
      )
    );
};

/** An answer written on the admin site, in the chat's thread. */
export const tellStaffOfAnswer = async (
  env: SlackEnv,
  userId: string,
  messageId: string,
  words: string
): Promise<void> => {
  const thread = await threadOf(env, userId);
  if (thread === null) {
    return;
  }
  const posted = await slackCall(env, "chat.postMessage", {
    text: `管理サイトから返信しました：\n${toSlackText(words)}`,
    thread_ts: thread,
  });
  const ts = stringOf(posted?.ts);
  if (ts !== undefined) {
    await keepSlackTs(env, messageId, ts);
  }
};

/**
 * The user's reaction on a line, on its message in Slack; one Slack has
 * no name for here is said in the thread instead.
 */
export const tellStaffOfReaction = async (
  env: SlackEnv,
  line: SupportLineOf,
  emoji: string,
  on: boolean
): Promise<void> => {
  if (line.slackTs === null) {
    return;
  }
  const name = slackNameOf(emoji);
  if (name !== undefined) {
    await slackCall(env, on ? "reactions.add" : "reactions.remove", {
      name,
      timestamp: line.slackTs,
    });
    return;
  }
  const thread = await threadOf(env, line.userId);
  if (on && thread !== null) {
    await slackCall(env, "chat.postMessage", {
      text: `ユーザーが ${emoji} を付けました：「${toSlackText(line.text.slice(0, QUOTE_LENGTH))}」`,
      thread_ts: thread,
    });
  }
};

/** A line the user took back, so said in its place in Slack. */
export const tellStaffOfUnsend = async (
  env: SlackEnv,
  line: SupportLineOf
): Promise<void> => {
  if (line.slackTs === null) {
    return;
  }
  const taken = "（ユーザーが送信を取り消しました）";
  // The thread's first message keeps the way to the admin site.
  const first = line.slackTs === (await threadOf(env, line.userId));
  await slackCall(env, "chat.update", {
    text: first ? threadHead(line, taken) : taken,
    ts: line.slackTs,
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
