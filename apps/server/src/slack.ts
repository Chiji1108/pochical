// Pochical's people's Slack channel (spec/admin.md): each user's support
// chat is a thread there, where a reply goes to the user as ポチカル, and
// new reports are posted with the way to the admin site. Without the
// secrets nothing is posted and no reply is taken; Slack failing never
// fails what the user did.
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { supportChats } from "./db/schema";
import { supportPhotoKey } from "./photos";
import { keepSlackTs } from "./support-chat";
import type { SupportLineOf } from "./support-chat";

/**
 * A Slack secret, or "" where this server has none: Env says they are
 * there, as production has them, but a local server may not.
 */
export const slackSecret = (value: string | undefined): string => value ?? "";

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
  env: Env,
  method: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown> | null> => {
  const token = slackSecret(env.SLACK_BOT_TOKEN);
  const channel = slackSecret(env.SLACK_CHANNEL_ID);
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
  env: Env,
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

/** A line's words, or what a photo is called. */
const wordsOf = (line: SupportLineOf): string =>
  line.photoId === null ? line.text : "📷 写真";

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
 * A chat's thread, started by the user's first line; null when Slack did
 * not take it.
 */
const startThread = async (
  env: Env,
  line: SupportLineOf,
  words: string
): Promise<string | null> => {
  const posted = await slackCall(env, "chat.postMessage", {
    text: threadHead(line, words),
  });
  const ts = stringOf(posted?.ts);
  if (ts === undefined) {
    return null;
  }
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
  return ts;
};

/** How often, and how far apart, a shared file's message is looked for. */
const SHARE_TRIES = 3;
const SHARE_WAIT_MS = 1000;

/** The message a file was shared in, in the channel, once Slack says. */
const sharedTs = (file: unknown, channel: string): string | undefined => {
  const shares = isRecord(file) && isRecord(file.shares) ? file.shares : {};
  for (const kind of [shares.private, shares.public]) {
    const inChannel = isRecord(kind) ? kind[channel] : undefined;
    const first: unknown = Array.isArray(inChannel)
      ? inChannel.at(0)
      : undefined;
    const ts = isRecord(first) ? stringOf(first.ts) : undefined;
    if (ts !== undefined) {
      return ts;
    }
  }
  return undefined;
};

/**
 * A user's photo, uploaded into their chat's thread (files:write), a
 * reply's quote over it; the message it was shared in (files:read), for
 * its reactions and its taking back.
 */
const postPhoto = async (
  env: Env,
  line: SupportLineOf,
  thread: string,
  quote: string
): Promise<string | undefined> => {
  const photo = await env.PHOTOS.get(
    supportPhotoKey(line.userId, line.photoId ?? "")
  );
  if (photo === null) {
    return undefined;
  }
  const bytes = await photo.arrayBuffer();
  const slot = await slackCall(env, "files.getUploadURLExternal", {
    alt_txt: "写真",
    filename: "photo.jpg",
    length: bytes.byteLength,
  });
  const url = stringOf(slot?.upload_url);
  const fileId = stringOf(slot?.file_id);
  if (url === undefined || fileId === undefined) {
    return undefined;
  }
  const uploaded = await fetch(url, { body: bytes, method: "POST" });
  const shared =
    uploaded.ok &&
    (await slackCall(env, "files.completeUploadExternal", {
      channel_id: env.SLACK_CHANNEL_ID,
      files: [{ id: fileId, title: "写真" }],
      thread_ts: thread,
      ...(quote === "" ? {} : { initial_comment: quote.trim() }),
    })) !== null;
  if (!shared) {
    return undefined;
  }
  for (let tries = 0; tries < SHARE_TRIES; tries += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Slack shares it in a moment
    const info = await slackCall(env, "files.info", { file: fileId });
    const ts = sharedTs(info?.file, env.SLACK_CHANNEL_ID);
    if (ts !== undefined) {
      return ts;
    }
    // oxlint-disable-next-line no-await-in-loop -- waiting is the point
    await scheduler.wait(SHARE_WAIT_MS);
  }
  return undefined;
};

/**
 * A file Pochical's people shared in Slack, read with the app's token
 * (files:read); null past `most` bytes or when Slack does not give it.
 */
export const slackFile = async (
  env: Env,
  url: string,
  most: number
): Promise<{ bytes: ArrayBuffer; type: string } | null> => {
  const token = slackSecret(env.SLACK_BOT_TOKEN);
  if (token === "" || !url.startsWith("https://files.slack.com/")) {
    return null;
  }
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const type = response.headers.get("Content-Type") ?? "";
    if (!response.ok || !type.startsWith("image/")) {
      return null;
    }
    const bytes = await response.arrayBuffer();
    return bytes.byteLength > most ? null : { bytes, type };
  } catch {
    return null;
  }
};

/**
 * A user's new line, in their chat's thread, shown in the channel too;
 * their first starts the thread, with the way to the admin site. A reply
 * quotes what it is to. Its message is kept with the line, for its
 * reactions and its taking back.
 */
export const tellStaffOfLine = async (
  env: Env,
  line: SupportLineOf,
  repliedTo: SupportLineOf | null
): Promise<void> => {
  const quote =
    repliedTo === null
      ? ""
      : `> ${toSlackText(wordsOf(repliedTo).replaceAll("\n", " ").slice(0, QUOTE_LENGTH))}\n`;
  const words = `${quote}${toSlackText(wordsOf(line))}`;
  const thread = await threadOf(env, line.userId);
  if (line.photoId !== null) {
    // A photo is shared in the thread, which a first line starts.
    const into = thread ?? (await startThread(env, line, words));
    const ts =
      into === null ? undefined : await postPhoto(env, line, into, quote);
    if (ts !== undefined) {
      await keepSlackTs(env, line.id, ts);
    }
    return;
  }
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
  const ts = await startThread(env, line, words);
  if (ts !== null) {
    await keepSlackTs(env, line.id, ts);
  }
};

/** An answer written on the admin site, in the chat's thread. */
export const tellStaffOfAnswer = async (
  env: Env,
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
  env: Env,
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
      text: `ユーザーが ${emoji} を付けました：「${toSlackText(wordsOf(line).slice(0, QUOTE_LENGTH))}」`,
      thread_ts: thread,
    });
  }
};

/** A line the user took back, so said in its place in Slack. */
export const tellStaffOfUnsend = async (
  env: Env,
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

/** Each reason as the app's report sheet words it. */
const REASON_WORDS: Record<string, string> = {
  explicit: "性的・暴力的な内容",
  harassment: "嫌がらせ・いじめ",
  impersonation: "なりすまし",
  other: "その他",
  spam: "迷惑・スパム",
};

/** The most of each reported line's words a report shows. */
const REPORT_LINE_LENGTH = 200;

/** A line around a reported one, as a report's context keeps it. */
const reportLineOf = (row: unknown): string | undefined => {
  if (!isRecord(row)) {
    return undefined;
  }
  let words = toSlackText(
    (stringOf(row.text) ?? "")
      .replaceAll("\n", " ")
      .slice(0, REPORT_LINE_LENGTH)
  );
  if (row.unsent === true) {
    words = "（取り消されたメッセージ）";
  } else if (stringOf(row.photo) !== undefined) {
    words = "📷 写真";
  } else if (Array.isArray(row.days) && row.days.length > 0 && words === "") {
    words = "📅 日にち";
  }
  const mark = row.reported === true ? "▶" : "・";
  return `${mark} ${toSlackText(stringOf(row.name) ?? "メンバー")}：${words}`;
};

/** What a report's context says: the lines around the reported one. */
const reportLinesOf = (context: string): string[] => {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(context);
  } catch {
    return [];
  }
  return Array.isArray(parsed)
    ? parsed.flatMap((row) => reportLineOf(row) ?? [])
    : [];
};

/**
 * A member's report, as the admin site keeps it: why, the group, who
 * reported whom, and for a line, it and the few around it, the reported
 * one marked; with the way to the admin site.
 */
export const tellStaffOfReport = async (
  env: Env,
  report: {
    why: string;
    groupName: string;
    reporterName: string;
    targetName: string;
    context: string;
  }
): Promise<void> => {
  const lines = reportLinesOf(report.context);
  const what = lines.length === 0 ? "メンバーを通報" : "メッセージを通報";
  await slackCall(env, "chat.postMessage", {
    text: [
      `新しい通報：${REASON_WORDS[report.why] ?? report.why}（${what}）`,
      `グループ：${toSlackText(report.groupName)}`,
      `通報した人：${toSlackText(report.reporterName)}　通報された人：${toSlackText(report.targetName)}`,
      ...lines,
      `<${ADMIN_SITE}/reports|管理サイトで開く>`,
    ].join("\n"),
  });
};
