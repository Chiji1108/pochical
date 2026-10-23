// Pochical's people's Slack channel (spec/admin.md): each user's support
// chat is a thread there, where a reply goes to the user as ポチカル, and
// new reports are posted with the way to the admin site. Without the
// secrets nothing is posted and no reply is taken; Slack failing never
// fails what the user did.
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { supportChats } from "./db/schema";
import { photoKey } from "./photos";
import { photoWords, supportPlace } from "./support-lines";
import type { SupportLine } from "./support-lines";

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

/** Whether this server posts to Slack: not on a computer without it. */
export const slackSetUp = (env: Env): boolean =>
  slackSecret(env.SLACK_BOT_TOKEN) !== "" &&
  slackSecret(env.SLACK_CHANNEL_ID) !== "";

/**
 * Why Slack did not take a call: Slack's own word for it (not_in_channel,
 * invalid_auth, ...; `http_{status}` or `network` when it gave none), and
 * whether it passes by itself (Slack busy, down or out of reach, with how
 * long it asked to be left alone, if it said) or lasts until someone puts
 * the app's setup right.
 */
export type SlackRefusal =
  | { kind: "passing"; why: string; afterMs: number | null }
  | { kind: "lasting"; why: string };

/** Slack's errors that are its own side failing for a while. */
const PASSING_ERRORS = new Set([
  "fatal_error",
  "internal_error",
  "ratelimited",
  "request_timeout",
  "service_unavailable",
]);

/**
 * A refusal from Slack's answer: its HTTP status, its Retry-After header
 * and the error its body names. Any other error Slack names lasts: a scope
 * or a channel missing, a token revoked, an argument it refuses.
 */
export const slackRefusal = (
  status: number,
  retryAfter: string | null,
  error: string | undefined
): SlackRefusal => {
  const why = error ?? `http_${status}`;
  if (status === 429 || status >= 500 || PASSING_ERRORS.has(why)) {
    const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
    return {
      afterMs: Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null,
      kind: "passing",
      why,
    };
  }
  return { kind: "lasting", why };
};

/** A refusal that passes by itself, Slack saying nothing of when. */
const passing = (why: string): SlackRefusal => ({
  afterMs: null,
  kind: "passing",
  why,
});

/** What Slack did not take, and why, for the relay to try again. */
export class SlackRefusedError extends Error {
  readonly refusal: SlackRefusal;

  constructor(what: string, refusal: SlackRefusal) {
    super(`Slack did not take ${what}: ${refusal.why}`);
    this.name = "SlackRefusedError";
    this.refusal = refusal;
  }
}

/** Slack's answer to a call: what it gave back, or why it refused. */
type SlackAnswer =
  | { taken: Record<string, unknown> }
  | { refused: SlackRefusal };

/**
 * One of Slack's Web API methods as the app, and Slack's answer: its
 * arguments as JSON, or in the URL for a method that only reads, as
 * Slack's conversations methods take them.
 */
const askSlack = async (
  env: Env,
  method: string,
  args: Record<string, unknown>,
  reads = false
): Promise<SlackAnswer> => {
  const token = slackSecret(env.SLACK_BOT_TOKEN);
  const all = { channel: slackSecret(env.SLACK_CHANNEL_ID), ...args };
  const url = new URL(`https://slack.com/api/${method}`);
  const headers = { Authorization: `Bearer ${token}` };
  let response: Response;
  try {
    if (reads) {
      for (const [name, value] of Object.entries(all)) {
        url.searchParams.set(
          name,
          typeof value === "string" ? value : JSON.stringify(value)
        );
      }
      response = await fetch(url, { headers });
    } else {
      response = await fetch(url, {
        body: JSON.stringify(all),
        headers: {
          ...headers,
          "Content-Type": "application/json; charset=utf-8",
        },
        method: "POST",
      });
    }
  } catch (error) {
    console.error(`Slack ${method} failed`, error);
    return { refused: passing("network") };
  }
  const result: unknown = await response.json().catch(() => null);
  if (isRecord(result) && result.ok === true) {
    return { taken: result };
  }
  const error = isRecord(result) ? stringOf(result.error) : undefined;
  const refused = slackRefusal(
    response.status,
    response.headers.get("Retry-After"),
    error
  );
  console.error(`Slack ${method} failed`, refused.why);
  return { refused };
};

/** One of Slack's Web API methods as the app; null when it did not take. */
export const slackCall = async (
  env: Env,
  method: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown> | null> => {
  if (!slackSetUp(env)) {
    return null;
  }
  const answer = await askSlack(env, method, args);
  return "taken" in answer ? answer.taken : null;
};

/**
 * One of Slack's Web API methods the relay needs taken (`reads` as
 * askSlack has it): what Slack gave back, or SlackRefusedError thrown,
 * saying why, for the relay to try again.
 */
const slackTake = async (
  env: Env,
  method: string,
  args: Record<string, unknown>,
  what: string,
  reads = false
): Promise<Record<string, unknown>> => {
  const answer = await askSlack(env, method, args, reads);
  if ("refused" in answer) {
    throw new SlackRefusedError(what, answer.refused);
  }
  return answer.taken;
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

/** The first words of a line, as a reply to it shows them. */
const QUOTE_LENGTH = 80;

/**
 * A chat's thread's first message: the user's first line, with the app
 * and device, the way to the admin site and how to answer.
 */
const threadHead = (line: SupportLine, words: string): string => {
  const page = `${ADMIN_SITE}/support/${encodeURIComponent(line.userId)}`;
  const from = line.device === null ? "" : `（${toSlackText(line.device)}）`;
  return `サポートに新しいメッセージ${from}\n${words}\n<${page}|管理サイトで開く>・このスレッドに書くと、ポチカルとして返信します`;
};

/**
 * The metadata each message the relay posts carries (Slack's message
 * metadata, read back with include_all_metadata): the line it is, by
 * which a retry finds it.
 */
const LINE_EVENT = "pochical_support_line";

const lineMetadata = (line: SupportLine) => ({
  event_payload: { seq: line.seq, user_id: line.userId },
  event_type: LINE_EVENT,
});

/** Whether a message in Slack is the one the relay posted for `line`. */
const isMessageOf =
  (line: SupportLine) =>
  (message: Record<string, unknown>): boolean => {
    const { metadata } = message;
    if (!isRecord(metadata) || metadata.event_type !== LINE_EVENT) {
      return false;
    }
    const payload = metadata.event_payload;
    return (
      isRecord(payload) &&
      // Slack may give a number in the payload back as a string.
      Number(payload.seq) === line.seq &&
      payload.user_id === line.userId
    );
  };

/**
 * The files a line's photos are uploaded as, the line and each photo's
 * place in it in their names, by which a retry finds its message: a
 * file's message carries no metadata.
 */
const photoName = (line: SupportLine, at: number): string =>
  `photo-${line.seq}-${at + 1}.jpg`;

const hasPhotoOf =
  (line: SupportLine) =>
  (message: Record<string, unknown>): boolean => {
    const names = new Set(line.photos.map((_, at) => photoName(line, at)));
    return (
      // Posted by an app, so not a file of the same name a person shared.
      typeof message.bot_id === "string" &&
      Array.isArray(message.files) &&
      message.files.some(
        (file: unknown) => isRecord(file) && names.has(String(file.name))
      )
    );
  };

/** How much earlier than this server's clock Slack's may say a post was. */
const CLOCK_SKEW_S = 60;

/** The most messages one look asks Slack for, as its references advise. */
const LOOK_PAGE = 200;

/**
 * The message `matches` finds in the channel (conversations.history) or in
 * `thread` (conversations.replies), posted since `since` or a little
 * before, and by `until` or a little after when given; undefined when
 * there is none. For a retry after Slack's answer to a post was lost,
 * which may have been taken all the same: reading needs channels:history
 * or groups:history, which the message event the app takes replies by
 * needs too.
 */
const findPosted = async (
  env: Env,
  since: Date,
  thread: string | null,
  matches: (message: Record<string, unknown>) => boolean,
  until?: Date
): Promise<string | undefined> => {
  const method =
    thread === null ? "conversations.history" : "conversations.replies";
  let cursor = "";
  do {
    // oxlint-disable-next-line no-await-in-loop -- page after page
    const page = await slackTake(
      env,
      method,
      {
        include_all_metadata: true,
        limit: LOOK_PAGE,
        oldest: (since.getTime() / 1000 - CLOCK_SKEW_S).toFixed(6),
        ...(until === undefined
          ? {}
          : { latest: (until.getTime() / 1000 + CLOCK_SKEW_S).toFixed(6) }),
        ...(thread === null ? {} : { ts: thread }),
        ...(cursor === "" ? {} : { cursor }),
      },
      "a look for a message",
      true
    );
    const messages: unknown[] = Array.isArray(page.messages)
      ? page.messages
      : [];
    const found = messages.find(
      (message) => isRecord(message) && matches(message)
    );
    const ts = isRecord(found) ? stringOf(found.ts) : undefined;
    if (ts !== undefined) {
      return ts;
    }
    const next = page.response_metadata;
    cursor = (isRecord(next) ? stringOf(next.next_cursor) : undefined) ?? "";
  } while (cursor !== "");
  return undefined;
};

/**
 * A line's message posted by the relay, with its metadata, and its ts;
 * SlackRefusedError thrown when Slack did not take it, or took it without
 * saying which message it is. Slack ignores metadata it finds wrong, with
 * a warning, so its warnings are logged.
 */
const postForRelay = async (
  env: Env,
  line: SupportLine,
  args: Record<string, unknown>,
  what: string
): Promise<string> => {
  const posted = await slackTake(
    env,
    "chat.postMessage",
    { ...args, metadata: lineMetadata(line) },
    what
  );
  const said = posted.response_metadata;
  const warnings = isRecord(said) ? said.warnings : undefined;
  if (Array.isArray(warnings) && warnings.length > 0) {
    console.warn("Slack warned of a relay post", warnings);
  }
  const ts = stringOf(posted.ts);
  if (ts === undefined) {
    throw new SlackRefusedError(what, passing("no_ts"));
  }
  return ts;
};

/**
 * A line's message, in `thread` or (null) in the channel: posted, or,
 * when a post of it since `unsureSince` may have been taken with Slack's
 * answer lost, found first and posted only when it is not there.
 */
const postOnce = async (
  env: Env,
  line: SupportLine,
  unsureSince: Date | null,
  thread: string | null,
  text: string,
  what: string
): Promise<string> => {
  const found =
    unsureSince === null
      ? undefined
      : await findPosted(env, unsureSince, thread, isMessageOf(line));
  return (
    found ??
    (await postForRelay(
      env,
      line,
      thread === null ? { text } : { text, thread_ts: thread },
      what
    ))
  );
};

/** The message that starts a user's chat's thread, kept as its thread. */
const keepThread = async (
  env: Env,
  userId: string,
  ts: string
): Promise<void> => {
  // Two first lines at once keep the thread the first kept.
  await drizzle(env.DB)
    .update(supportChats)
    .set({ slackThreadTs: ts })
    .where(
      and(eq(supportChats.userId, userId), isNull(supportChats.slackThreadTs))
    );
};

/** A chat's thread, started by the user's first line. */
const startThread = async (
  env: Env,
  line: SupportLine,
  words: string,
  unsureSince: Date | null
): Promise<string> => {
  const ts = await postOnce(
    env,
    line,
    unsureSince,
    null,
    threadHead(line, words),
    "a thread"
  );
  await keepThread(env, line.userId, ts);
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
 * A photo's bytes uploaded to Slack (files.getUploadURLExternal) as
 * `filename`, not yet shared: its file's id.
 */
const uploadPhoto = async (
  env: Env,
  bytes: ArrayBuffer,
  filename: string
): Promise<string> => {
  const slot = await slackTake(
    env,
    "files.getUploadURLExternal",
    { alt_txt: "写真", filename, length: bytes.byteLength },
    "a photo"
  );
  const url = stringOf(slot.upload_url);
  const fileId = stringOf(slot.file_id);
  if (url === undefined || fileId === undefined) {
    throw new SlackRefusedError("a photo", passing("no_upload_url"));
  }
  const uploaded = await fetch(url, { body: bytes, method: "POST" }).catch(
    () => null
  );
  if (uploaded === null) {
    throw new SlackRefusedError("a photo", passing("network"));
  }
  if (!uploaded.ok) {
    throw new SlackRefusedError(
      "a photo",
      slackRefusal(
        uploaded.status,
        uploaded.headers.get("Retry-After"),
        undefined
      )
    );
  }
  return fileId;
};

/**
 * A user's photo line, its photos uploaded into their chat's thread as
 * one message (files:write), a reply's quote over it; the message they
 * were shared in (files:read), for its reactions and its taking back.
 * Null when there is no photo to upload, or Slack shared them without
 * saying where: they are not uploaded again. When an upload since
 * `unsureSince` may have been shared with Slack's answer lost, its
 * message is looked for in the thread first.
 */
const postPhotos = async (
  env: Env,
  line: SupportLine,
  thread: string,
  quote: string,
  unsureSince: Date | null
): Promise<string | null> => {
  const found =
    unsureSince === null
      ? undefined
      : await findPosted(env, unsureSince, thread, hasPhotoOf(line));
  if (found !== undefined) {
    return found;
  }
  const fileIds: string[] = [];
  for (const [at, { id }] of line.photos.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- the photos go in order
    const photo = await env.PHOTOS.get(photoKey(supportPlace(line.userId), id));
    if (photo !== null) {
      fileIds.push(
        // oxlint-disable-next-line no-await-in-loop -- the photos go in order
        await uploadPhoto(env, await photo.arrayBuffer(), photoName(line, at))
      );
    }
  }
  const [first] = fileIds;
  if (first === undefined) {
    return null;
  }
  await slackTake(
    env,
    "files.completeUploadExternal",
    {
      channel_id: env.SLACK_CHANNEL_ID,
      files: fileIds.map((fileId) => ({ id: fileId, title: "写真" })),
      thread_ts: thread,
      ...(quote === "" ? {} : { initial_comment: quote.trim() }),
    },
    "a photo"
  );
  for (let tries = 0; tries < SHARE_TRIES; tries += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Slack shares it in a moment
    const info = await slackCall(env, "files.info", { file: first });
    const ts = sharedTs(info?.file, env.SLACK_CHANNEL_ID);
    if (ts !== undefined) {
      return ts;
    }
    // oxlint-disable-next-line no-await-in-loop -- waiting is the point
    await scheduler.wait(SHARE_WAIT_MS);
  }
  return null;
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
 * A user's new line: their first starts their chat's thread in the
 * channel, with the way to the admin site; each after it stays in the
 * thread, which Pochical's people follow. A reply
 * quotes what it is to. Its message, for its reactions and its taking
 * back, or null when there is none to keep (Slack not set up here, or a
 * photo line shared without its message); throws when Slack did not take it,
 * for the relay to try again. A try after one since `unsureSince` whose
 * answer was lost finds the line's message in Slack before posting it.
 */
export const tellStaffOfLine = async (
  env: Env,
  line: SupportLine,
  repliedTo: SupportLine | null,
  unsureSince: Date | null
): Promise<string | null> => {
  if (!slackSetUp(env)) {
    return null;
  }
  const quote =
    repliedTo === null
      ? ""
      : `> ${toSlackText(repliedTo.words.replaceAll("\n", " ").slice(0, QUOTE_LENGTH))}\n`;
  const words = `${quote}${toSlackText(line.words)}`;
  const thread = await threadOf(env, line.userId);
  if (line.photos.length > 0) {
    // Photos are shared in the thread, which a first line starts.
    const into = thread ?? (await startThread(env, line, words, unsureSince));
    return await postPhotos(env, line, into, quote, unsureSince);
  }
  if (thread === null) {
    return await startThread(env, line, words, unsureSince);
  }
  return await postOnce(env, line, unsureSince, thread, words, "a line");
};

/**
 * The message a try of a line's since `since` may have posted, Slack's
 * answer lost, now that the line is not to be posted (taken back
 * meanwhile, or past the user's limit): its photos', else its own, as a
 * post would have kept; one that started the chat's thread is kept as the
 * thread too. Null when Slack has none, or is not set up here.
 */
export const findStaffLine = async (
  env: Env,
  line: SupportLine,
  since: Date
): Promise<string | null> => {
  if (!slackSetUp(env)) {
    return null;
  }
  let thread = await threadOf(env, line.userId);
  if (thread === null) {
    const head = await findPosted(env, since, null, isMessageOf(line));
    if (head === undefined) {
      return null;
    }
    await keepThread(env, line.userId, head);
    thread = head;
  }
  return (
    (await findPosted(env, since, thread, hasPhotoOf(line))) ??
    (await findPosted(env, since, thread, isMessageOf(line))) ??
    null
  );
};

/**
 * An answer written on the admin site, in the chat's thread, as
 * tellStaffOfLine posts a line: null with no thread to post it in.
 */
export const tellStaffOfAnswer = async (
  env: Env,
  line: SupportLine,
  unsureSince: Date | null
): Promise<string | null> => {
  const thread = await threadOf(env, line.userId);
  if (!slackSetUp(env) || thread === null) {
    return null;
  }
  return await postOnce(
    env,
    line,
    unsureSince,
    thread,
    `管理サイトから返信しました：\n${toSlackText(line.words)}`,
    "an answer"
  );
};

/**
 * The user's reaction on a line, on its message in Slack (`slackTs`). One
 * Slack has no name for here is said in the thread instead, that notice's
 * message given back to be kept, and deleted (`notice`) as it comes off.
 */
export const tellStaffOfReaction = async (
  env: Env,
  line: SupportLine,
  slackTs: string,
  emoji: string,
  on: boolean,
  notice?: string
): Promise<string | undefined> => {
  const name = slackNameOf(emoji);
  if (name !== undefined) {
    await slackCall(env, on ? "reactions.add" : "reactions.remove", {
      name,
      timestamp: slackTs,
    });
    return undefined;
  }
  if (!on) {
    if (notice !== undefined) {
      await slackCall(env, "chat.delete", { ts: notice });
    }
    return undefined;
  }
  const thread = await threadOf(env, line.userId);
  if (thread === null) {
    return undefined;
  }
  const posted = await slackCall(env, "chat.postMessage", {
    text: `ユーザーが ${emoji} を付けました：「${toSlackText(line.words.slice(0, QUOTE_LENGTH))}」`,
    thread_ts: thread,
  });
  return stringOf(posted?.ts);
};

/** A line the user took back, so said in its place in Slack (`slackTs`). */
export const tellStaffOfUnsend = async (
  env: Env,
  line: SupportLine,
  slackTs: string
): Promise<void> => {
  const taken = "（ユーザーが送信を取り消しました）";
  // The thread's first message keeps the way to the admin site.
  const first = slackTs === (await threadOf(env, line.userId));
  await slackCall(env, "chat.update", {
    text: first ? threadHead(line, taken) : taken,
    ts: slackTs,
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
  } else if (Array.isArray(row.photos) && row.photos.length > 0) {
    words = photoWords(row.photos.length);
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
 * The metadata a report's message carries, as a relay post's does: the
 * report it is, by which the message is found again should Slack's answer
 * to the post be lost.
 */
const REPORT_EVENT = "pochical_report";

const isReportMessage =
  (id: string) =>
  (message: Record<string, unknown>): boolean => {
    const { metadata } = message;
    return (
      isRecord(metadata) &&
      metadata.event_type === REPORT_EVENT &&
      isRecord(metadata.event_payload) &&
      metadata.event_payload.report_id === id
    );
  };

/**
 * How long after a report is made its message may be posted: the post is
 * tried in the report's own request, which the runtime ends 30 seconds
 * after answering it (waitUntil).
 */
const REPORT_POST_WITHIN_MS = 30_000;

/**
 * A member's report `id`, as the admin site keeps it: why, the group, who
 * reported whom, and for a line, it and the few around it, the reported
 * one marked; with the way to the admin site. The message posted, if
 * Slack took it and said which.
 */
export const tellStaffOfReport = async (
  env: Env,
  id: string,
  report: {
    why: string;
    groupName: string;
    reporterName: string;
    targetName: string;
    context: string;
  }
): Promise<string | undefined> => {
  const lines = reportLinesOf(report.context);
  const what = lines.length === 0 ? "メンバーを通報" : "メッセージを通報";
  const posted = await slackCall(env, "chat.postMessage", {
    metadata: { event_payload: { report_id: id }, event_type: REPORT_EVENT },
    text: [
      `新しい通報：${REASON_WORDS[report.why] ?? report.why}（${what}）`,
      `グループ：${toSlackText(report.groupName)}`,
      `通報した人：${toSlackText(report.reporterName)}　通報された人：${toSlackText(report.targetName)}`,
      ...lines,
      `<${ADMIN_SITE}/reports|管理サイトで開く>`,
    ].join("\n"),
  });
  // Slack takes a post whose metadata it finds wrong without it, warning.
  const said = posted?.response_metadata;
  const warnings = isRecord(said) ? said.warnings : undefined;
  if (Array.isArray(warnings) && warnings.length > 0) {
    console.warn("Slack warned of a report post", warnings);
  }
  return stringOf(posted?.ts);
};

/**
 * Whether a report's message is gone from Slack, as the report goes:
 * deleted by the ts the report kept; else, for a report whose post was
 * tried, found first by its metadata among the messages posted while its
 * request ran, and deleted, a report with none found having none; and for
 * one never to be posted, none to begin with. False while Slack does not
 * answer or delete it, for the next sweep to try again.
 */
export const eraseReportPost = async (
  env: Env,
  report: {
    id: string;
    createdAt: Date;
    slackTried: boolean;
    slackTs: string | null;
  }
): Promise<boolean> => {
  if (!report.slackTried) {
    return true;
  }
  let ts = report.slackTs ?? undefined;
  if (ts === undefined) {
    try {
      ts = await findPosted(
        env,
        report.createdAt,
        null,
        isReportMessage(report.id),
        new Date(report.createdAt.getTime() + REPORT_POST_WITHIN_MS)
      );
    } catch (error) {
      if (error instanceof SlackRefusedError) {
        return false;
      }
      throw error;
    }
    if (ts === undefined) {
      return true;
    }
  }
  const answer = await askSlack(env, "chat.delete", { ts });
  return "taken" in answer || answer.refused.why === "message_not_found";
};

/**
 * What a deleted account's chat thread keeps of the app's posts: its
 * first message, in place of the user's words, saying the account was
 * deleted, for Pochical's people reading their own replies under it.
 */
const DELETED_EVENT = "pochical_account_deleted";

const DELETED_WORDS =
  "（このユーザーのアカウントは削除されました。ユーザーのメッセージと写真は、アプリ・管理サイト・Slackから削除されています）";

/**
 * A call to Slack that is done once Slack takes it or says that what it
 * acts on is already gone (`gone`); SlackRefusedError thrown otherwise.
 */
const settle = async (
  env: Env,
  method: string,
  args: Record<string, unknown>,
  gone: readonly string[]
): Promise<void> => {
  const answer = await askSlack(env, method, args);
  if ("refused" in answer && !gone.includes(answer.refused.why)) {
    throw new SlackRefusedError(method, answer.refused);
  }
};

/** Every message of `thread`, its first included (conversations.replies). */
const threadMessages = async (
  env: Env,
  thread: string
): Promise<Record<string, unknown>[]> => {
  const messages: Record<string, unknown>[] = [];
  let cursor = "";
  do {
    // oxlint-disable-next-line no-await-in-loop -- page after page
    const answer = await askSlack(
      env,
      "conversations.replies",
      {
        include_all_metadata: true,
        limit: LOOK_PAGE,
        ts: thread,
        ...(cursor === "" ? {} : { cursor }),
      },
      true
    );
    if ("refused" in answer) {
      if (answer.refused.why === "thread_not_found") {
        return messages;
      }
      throw new SlackRefusedError("a look at a thread", answer.refused);
    }
    const page = answer.taken;
    if (Array.isArray(page.messages)) {
      messages.push(...page.messages.filter(isRecord));
    }
    const next = page.response_metadata;
    cursor = (isRecord(next) ? stringOf(next.next_cursor) : undefined) ?? "";
  } while (cursor !== "");
  return messages;
};

/**
 * Whether the app's posts in a deleted account's chat thread are gone:
 * each message and file the app posted there deleted (chat.delete,
 * files.delete), the thread's first message said as deleted instead
 * (chat.update), its metadata naming no one; Pochical's people's own
 * replies stay, which the app's token cannot delete. False while Slack
 * does not take it, for the daily cron to try again. Run again, it finds
 * only what is left to do.
 */
export const eraseSupportThread = async (
  env: Env,
  thread: string
): Promise<boolean> => {
  try {
    const me = await slackTake(env, "auth.test", {}, "who the app is");
    const appUser = stringOf(me.user_id);
    const appBot = stringOf(me.bot_id);
    const byApp = (message: Record<string, unknown>): boolean =>
      (appUser !== undefined && message.user === appUser) ||
      (appBot !== undefined && message.bot_id === appBot);
    for (const message of await threadMessages(env, thread)) {
      const files: unknown[] = Array.isArray(message.files)
        ? message.files
        : [];
      for (const file of files) {
        if (isRecord(file) && appUser !== undefined && file.user === appUser) {
          // oxlint-disable-next-line no-await-in-loop -- Slack takes one at a time
          await settle(env, "files.delete", { file: file.id }, [
            "file_deleted",
            "file_not_found",
          ]);
        }
      }
      const { metadata, ts } = message;
      if (!byApp(message) || typeof ts !== "string") {
        continue;
      }
      if (ts !== thread) {
        // oxlint-disable-next-line no-await-in-loop -- as above
        await settle(env, "chat.delete", { ts }, ["message_not_found"]);
      } else if (!isRecord(metadata) || metadata.event_type !== DELETED_EVENT) {
        // oxlint-disable-next-line no-await-in-loop -- as above
        await settle(
          env,
          "chat.update",
          {
            blocks: [],
            metadata: { event_payload: {}, event_type: DELETED_EVENT },
            text: DELETED_WORDS,
            ts,
          },
          ["message_not_found"]
        );
      }
    }
    return true;
  } catch (error) {
    if (error instanceof SlackRefusedError) {
      return false;
    }
    throw error;
  }
};
