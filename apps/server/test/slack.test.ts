import { chatRules } from "@pochical/design/chat";
import { createScheduledController, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import {
  fromSlackText,
  isRecord,
  signedBySlack,
  slackRefusal,
  toSlackText,
} from "../src/slack";
import { supportPlace } from "../src/support-lines";
import { call, ORIGIN, signInAnonymously } from "./helpers";
import {
  alarmsSettled,
  watchAlarms,
  relayed,
  sendFrame,
  supportChat,
  tryNow,
  untilAcked,
} from "./sync-helpers";

watchAlarms();

const SECRET = "slack-signing-secret";

// Each message Slack posts gets its own time, across the tests too.
let posts = 0;

/** Where Slack says a file uploaded by the app was shared. */
const SHARED_TS = "1700000300.000001";

/** How the messages a photo is shared in begin, as conversations.* say. */
const SHARED_PREFIX = "1700000400.";

/** The app's bot and its user, as Slack names them (auth.test). */
const APP_BOT = "B0";
const APP_USER = "U-APP";

/** A message in the channel as Slack keeps it, for conversations.* here. */
type SlackMessage = Record<string, unknown> & { ts: string };

/** What Slack answers each of its Web API methods with here. */
const slackAnswer = (
  method: string,
  args: Record<string, unknown>,
  messages: SlackMessage[]
): Record<string, unknown> => {
  switch (method) {
    case "files.getUploadURLExternal": {
      return {
        file_id: `F-UP-${String(args.filename)}`,
        ok: true,
        upload_url: "https://files.slack.com/upload/v1/up",
      };
    }
    case "files.info": {
      return {
        file: { shares: { private: { "C-SUPPORT": [{ ts: SHARED_TS }] } } },
        ok: true,
      };
    }
    case "conversations.history": {
      return {
        messages: messages.filter(
          (message) =>
            message.thread_ts === undefined || message.thread_ts === message.ts
        ),
        ok: true,
      };
    }
    case "auth.test": {
      return { bot_id: APP_BOT, ok: true, user_id: APP_USER };
    }
    case "chat.delete": {
      const at = messages.findIndex((message) => message.ts === args.ts);
      if (at === -1) {
        return { error: "message_not_found", ok: false };
      }
      messages.splice(at, 1);
      return { ok: true };
    }
    case "chat.update": {
      const message = messages.find((each) => each.ts === args.ts);
      if (message === undefined) {
        return { error: "message_not_found", ok: false };
      }
      Object.assign(message, { metadata: args.metadata, text: args.text });
      return { ok: true };
    }
    case "files.delete": {
      const holding = messages.find(
        (message) =>
          Array.isArray(message.files) &&
          message.files.some((file) => isRecord(file) && file.id === args.file)
      );
      if (holding === undefined || !Array.isArray(holding.files)) {
        return { error: "file_deleted", ok: false };
      }
      holding.files = holding.files.filter(
        (file) => !isRecord(file) || file.id !== args.file
      );
      return { ok: true };
    }
    case "conversations.replies": {
      return {
        messages: messages.filter(
          (message) => message.ts === args.ts || message.thread_ts === args.ts
        ),
        ok: true,
      };
    }
    default: {
      posts += method === "chat.postMessage" ? 1 : 0;
      return { ok: true, ts: `1700000000.${String(posts).padStart(6, "0")}` };
    }
  }
};

/**
 * How Slack refuses a call: its error, HTTP status and Retry-After; and
 * whether it did it all the same, its answer lost.
 */
type Refusal = {
  error: string;
  status?: number;
  retryAfterS?: number;
  taken?: boolean;
};

/** Slack's answer refusing a call, ratelimited unless said otherwise. */
const refusalAnswer = (refusal: true | Refusal): Response => {
  const { error, retryAfterS, status } =
    refusal === true ? { error: "ratelimited" } : refusal;
  return Response.json(
    { error, ok: false },
    {
      headers:
        retryAfterS === undefined ? {} : { "Retry-After": String(retryAfterS) },
      status: status ?? 200,
    }
  );
};

/** A call's arguments: its JSON body, or its URL's query for a GET. */
const argsOf = async (
  request: Request,
  url: URL
): Promise<Record<string, unknown>> =>
  request.method === "GET"
    ? Object.fromEntries(url.searchParams)
    : await request.json();

/**
 * What reached Slack's Web API, as each method and its arguments; Slack's
 * file host takes uploads and gives back a small PNG. Slack refuses the
 * calls `refused` says to, by the method and how many came before, and
 * keeps the messages posted and photos shared in `messages`, for
 * conversations.* to give back.
 */
const slackCalls = (
  refused: (method: string, before: number) => boolean | Refusal = () => false,
  messages: SlackMessage[] = []
) => {
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  // Each file uploaded, by its id, its name.
  const uploaded = new Map<string, string>();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.host === "files.slack.com") {
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        headers: { "Content-Type": "image/png" },
      });
    }
    const args = await argsOf(request, url);
    const method = url.pathname.replace("/api/", "");
    const before = calls.filter((each) => each.method === method).length;
    calls.push({ args, method });
    const refusal = refused(method, before);
    const taken =
      refusal === false || (refusal !== true && refusal.taken === true);
    const answer = taken ? slackAnswer(method, args, messages) : {};
    if (taken && method === "chat.postMessage") {
      messages.push({
        ...args,
        bot_id: APP_BOT,
        ts: String(answer.ts),
        user: APP_USER,
      });
    }
    if (taken && method === "files.getUploadURLExternal") {
      uploaded.set(String(answer.file_id), String(args.filename));
    }
    if (taken && method === "files.completeUploadExternal") {
      posts += 1;
      const files: unknown[] = Array.isArray(args.files) ? args.files : [];
      messages.push({
        // As Slack gives the files the app shared at once.
        bot_id: APP_BOT,
        files: files.map((file) => ({
          id: isRecord(file) ? file.id : undefined,
          name: isRecord(file) ? uploaded.get(String(file.id)) : undefined,
          user: APP_USER,
        })),
        thread_ts: args.thread_ts,
        ts: `${SHARED_PREFIX}${String(posts).padStart(6, "0")}`,
        user: APP_USER,
      });
    }
    return refusal === false ? Response.json(answer) : refusalAnswer(refusal);
  });
  return calls;
};

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/** Headers as Slack signs a request: v0, HMAC-SHA256 of when and what. */
const signed = async (
  body: string,
  secret = SECRET,
  atS = Math.floor(Date.now() / 1000)
): Promise<Headers> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`v0:${atS}:${body}`)
  );
  return new Headers({
    "Content-Type": "application/json",
    "X-Slack-Request-Timestamp": String(atS),
    "X-Slack-Signature": `v0=${hex(signature)}`,
  });
};

const postEvent = async (payload: unknown): Promise<Response> => {
  const body = JSON.stringify(payload);
  return await exports.default.fetch(`${ORIGIN}/slack/events`, {
    body,
    headers: await signed(body),
    method: "POST",
  });
};

/** How many messages were posted among Slack's calls. */
const postsIn = (calls: { method: string }[]): number =>
  calls.filter(({ method }) => method === "chat.postMessage").length;

const threadOf = async (userId: string): Promise<string | null> =>
  await env.DB.prepare(
    "select slack_thread_ts from support_chats where user_id = ?"
  )
    .bind(userId)
    .first<string>("slack_thread_ts");

type Kept = {
  seq: number;
  author_id: string;
  text: string;
  photos: string | null;
};

/** The chat's lines as its Group DO keeps them. */
const linesOf = async (userId: string): Promise<Kept[]> =>
  await runInDurableObject(
    env.GROUPS.getByName(supportPlace(userId)),
    (_, state) =>
      state.storage.sql
        .exec<Kept>(
          "select seq, author_id, coalesce(content ->> '$.text', '') as text, content ->> '$.photos' as photos from chat_lines order by seq"
        )
        .toArray()
  );

/** Pochical's people's lines' words, oldest first. */
const answersTo = async (userId: string): Promise<string[]> => {
  const lines = await linesOf(userId);
  return lines
    .filter((line) => line.author_id === chatRules.pochicalMember)
    .map((line) => line.text);
};

/** Who reacted with what on the line at `seq`. */
const reactionsOn = async (userId: string, seq: number) =>
  await runInDurableObject(
    env.GROUPS.getByName(supportPlace(userId)),
    (_, state) =>
      state.storage.sql
        .exec<{ user_id: string; emoji: string }>(
          "select user_id, emoji from chat_reactions where seq = ? order by made_cursor",
          seq
        )
        .toArray()
  );

/** The Slack message kept for the line at `seq`, if any. */
const slackTsOf = async (userId: string, seq: number) =>
  await env.DB.prepare(
    "select ts from support_slack where user_id = ? and seq = ?"
  )
    .bind(userId, seq)
    .first<string>("ts");

describe("Slack's words", () => {
  it("go to Slack as written, never a mention or a link", () => {
    expect(toSlackText("<!channel> a & b > c")).toBe(
      "&lt;!channel&gt; a &amp; b &gt; c"
    );
  });

  it("come back as the user reads them", () => {
    expect(
      fromSlackText(
        "見てね <https://pochical.app|pochical.app> &lt;3 &amp; <mailto:a@b.jp|a@b.jp> <#C1|general> <@U1>"
      )
    ).toBe("見てね https://pochical.app <3 & a@b.jp #general ");
  });
});

describe("a Slack message's emoji", () => {
  it("come to the user as characters, a workspace's own as written", () => {
    const blocks = [
      {
        elements: [
          {
            elements: [
              { text: "ありがとう ", type: "text" },
              { name: "pray", type: "emoji", unicode: "1f64f" },
              {
                name: "+1",
                skin_tone: 2,
                type: "emoji",
                unicode: "1f44d-1f3fb",
              },
              { name: "+1", type: "emoji", unicode: "1f44d" },
              { name: "party_parrot", type: "emoji" },
            ],
            type: "rich_text_section",
          },
        ],
        type: "rich_text",
      },
    ];
    expect(
      fromSlackText(
        "ありがとう :pray::+1::skin-tone-2::+1::party_parrot:",
        blocks
      )
    ).toBe("ありがとう 🙏👍🏻👍:party_parrot:");
  });
});

describe("a request from Slack", () => {
  it("is taken when signed with the secret, lately", async () => {
    const body = '{"type":"event_callback"}';
    const now = Date.now();
    const checks = await Promise.all([
      signedBySlack(SECRET, await signed(body), body, now),
      signedBySlack(SECRET, await signed(body, "other"), body, now),
      signedBySlack(SECRET, await signed(`${body} `), body, now),
      signedBySlack(
        SECRET,
        await signed(body, SECRET, Math.floor(now / 1000) - 600),
        body,
        now
      ),
      signedBySlack("", await signed(body), body, now),
    ]);
    expect(checks).toStrictEqual([true, false, false, false, false]);
  });

  it("answers Slack's check of the address, and refuses one unsigned", async () => {
    const response = await postEvent({
      challenge: "abc",
      type: "url_verification",
    });
    await expect(response.json()).resolves.toStrictEqual({ challenge: "abc" });
    const unsigned = await exports.default.fetch(`${ORIGIN}/slack/events`, {
      body: "{}",
      method: "POST",
    });
    expect(unsigned.status).toBe(401);
  });
});

/** A user who wrote once, and their chat's thread in Slack. */
const startedChat = async () => {
  const token = await signInAnonymously();
  const chat = await supportChat(token);
  await chat.say("質問です", "ポチカル 1.0・iPhone");
  return { ...chat, thread: await threadOf(chat.userId), token };
};

/** An image file in a Slack message, with its 1024 pixel picture. */
const slackImage = (id: string) => ({
  id,
  mimetype: "image/png",
  thumb_1024: `https://files.slack.com/files-tmb/${id}-1024.png`,
  thumb_1024_h: 768,
  thumb_1024_w: 1024,
});

const replyIn = (thread: string | null, more: Record<string, unknown>) => ({
  event: {
    channel: "C-SUPPORT",
    client_msg_id: crypto.randomUUID(),
    thread_ts: thread,
    ts: "1700000100.000002",
    type: "message",
    user: "U-STAFF",
    ...more,
  },
  type: "event_callback",
});

describe("a support chat in Slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is a thread of the user's lines, a reply in it sent to the user once", async () => {
    const calls = slackCalls();
    const token = await signInAnonymously();
    const { say, userId } = await supportChat(token);
    await say("色を変えたい", "ポチカル 1.0・iPhone");
    const thread = await threadOf(userId);
    await say("あと<!channel>");
    expect(
      calls.map(({ args }) => [args.channel, args.thread_ts])
    ).toStrictEqual([
      ["C-SUPPORT", undefined],
      ["C-SUPPORT", thread],
    ]);
    // Later lines stay in the thread, not sent to the channel too.
    expect([
      String(calls[0]?.args.text).includes("ポチカル 1.0・iPhone"),
      calls[1]?.args.text,
      calls[1]?.args.reply_broadcast,
    ]).toStrictEqual([true, "あと&lt;!channel&gt;", undefined]);

    const reply = replyIn(thread, {
      text: "設定から変えられます &amp; 試してね",
      ts: "1700000100.000001",
    });
    const taken = await postEvent(reply);
    expect(taken.status).toBe(200);
    await vi.waitFor(() => {
      expect(calls.at(-1)?.method).toBe("reactions.add");
    });
    // Slack sending it again keeps it once.
    await postEvent(reply);
    await vi.waitFor(() => {
      expect(
        calls.filter(({ method }) => method === "reactions.add")
      ).toHaveLength(2);
    });
    await expect(answersTo(userId)).resolves.toStrictEqual([
      "設定から変えられます & 試してね",
    ]);
    // An answer written in Slack is not posted there again.
    await relayed(userId);
    expect(
      calls.filter(({ method }) => method === "chat.postMessage")
    ).toHaveLength(2);
  });

  it("posts the longest line, escaped, whole within Slack's 40,000 characters", async () => {
    const { textLimits } = await import("@pochical/design/limits");
    // chat.postMessage truncates text past this many characters.
    const slackTextMost = 40_000;
    const calls = slackCalls();
    const token = await signInAnonymously();
    const { edit, say, userId } = await supportChat(token);
    // As large as a line may be: each character an "&", the longest
    // escaped, stacked with marks up to its most code units.
    const longest = `&${"́".repeat(31)}`.repeat(textLimits.chatMessage);
    await say(longest, "&".repeat(200));
    await edit([
      {
        kind: {
          case: "send",
          value: {
            content: { kind: { case: "words", value: { text: longest } } },
            replyTo: 1n,
            threadId: "group",
          },
        },
        opId: crypto.randomUUID(),
      },
    ]);
    const texts = calls.map(({ args }) => String(args.text));
    expect(texts).toHaveLength(2);
    for (const text of texts) {
      expect([
        text.length <= slackTextMost,
        text.includes(toSlackText(longest)),
      ]).toStrictEqual([true, true]);
    }
    await expect(linesOf(userId)).resolves.toHaveLength(2);
  });

  it("posts a line again while Slack does not take it, once taken", async () => {
    const calls = slackCalls(
      (method, before) => method === "chat.postMessage" && before < 2
    );
    const token = await signInAnonymously();
    const { say, userId } = await supportChat(token);
    await say("届いてますか");
    const thread = await threadOf(userId);
    expect(thread).not.toBeNull();
    await expect(slackTsOf(userId, 1)).resolves.toBe(thread);
    // Two refused, the third kept; none after it.
    await say("もう一つ");
    expect(
      calls
        .filter(({ method }) => method === "chat.postMessage")
        .map(({ args }) => args.thread_ts)
    ).toStrictEqual([undefined, undefined, undefined, thread]);
  });

  it("takes no reply from a bot, another channel or outside a thread", async () => {
    const calls = slackCalls();
    const { thread, userId } = await startedChat();
    const base = {
      channel: "C-SUPPORT",
      text: "x",
      thread_ts: thread,
      ts: "1.2",
      type: "message",
    };
    await Promise.all(
      [
        { ...base, bot_id: "B1" },
        { ...base, channel: "C-ELSE" },
        { ...base, thread_ts: undefined },
        { ...base, subtype: "message_changed" },
      ].map(async (event) => await postEvent({ event, type: "event_callback" }))
    );
    await expect(answersTo(userId)).resolves.toStrictEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("answers a reply also sent to the channel", async () => {
    slackCalls();
    const { thread, userId } = await startedChat();
    await postEvent(
      replyIn(thread, { subtype: "thread_broadcast", text: "チャンネルにも" })
    );
    await vi.waitFor(async () => {
      await expect(answersTo(userId)).resolves.toStrictEqual([
        "チャンネルにも",
      ]);
    });
  });

  it("sends a reply's images as one photo line before its words, and says why not to other files", async () => {
    const calls = slackCalls();
    const { thread, userId } = await startedChat();
    await postEvent(
      replyIn(thread, {
        files: [
          slackImage("F1"),
          { id: "F2", mimetype: "application/pdf" },
          slackImage("F3"),
        ],
        subtype: "file_share",
        text: "設定画面です",
      })
    );
    await vi.waitFor(() => {
      expect(
        calls.some(({ args }) =>
          String(args.text).startsWith("届けられなかった")
        )
      ).toBeTruthy();
    });
    const lines = await linesOf(userId);
    const answers = lines.filter(
      (line) => line.author_id === chatRules.pochicalMember
    );
    const kept = await env.PHOTOS.get(
      `groups/${supportPlace(userId)}/photos/slack-F1`
    );
    expect([
      answers.map(({ text, photos }) => [text, photos === null]),
      JSON.parse(answers[0]?.photos ?? "[]"),
      kept?.httpMetadata?.contentType,
    ]).toMatchObject([
      [
        ["", false],
        ["設定画面です", true],
      ],
      [
        { height: 768, id: "slack-F1", width: 1024 },
        { height: 768, id: "slack-F3", width: 1024 },
      ],
      "image/png",
    ]);
  });
});

/** The user's reaction on their first line, put on or taken off. */
const react = (emoji: string, on: boolean) => ({
  kind: {
    case: "react" as const,
    value: { emoji, on, seq: 1n, threadId: "group" },
  },
  opId: crypto.randomUUID(),
});

describe("an answer from Pochical's people", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("notifies the user's devices, from Slack and from the admin site, titled with the chat", async () => {
    const calls = slackCalls();
    const { thread, token, userId } = await startedChat();
    await call(
      "UserService/RegisterPushToken",
      { sandbox: true, token: "b2".repeat(32) },
      token
    );
    const alerts = () =>
      calls.filter(({ method }) => method.startsWith("/3/device"));
    await postEvent(
      replyIn(thread, { text: "設定から変えられます", ts: "1700000400.000001" })
    );
    await vi.waitFor(() => {
      expect(alerts()).toHaveLength(1);
    });
    await exports.AdminEntrypoint.answerSupport(
      userId,
      "ほかにもありますか",
      crypto.randomUUID(),
      "staff@pochical.app"
    );
    await vi.waitFor(() => {
      expect(alerts()).toHaveLength(2);
    });
    expect(alerts().map(({ args }) => args)).toMatchObject([
      {
        // Titled with the chat, as 設定's row names it: no writer.
        aps: {
          alert: {
            "loc-args": ["設定から変えられます"],
            "loc-key": "CHAT_TEXT",
            "title-loc-args": [],
            "title-loc-key": "SUPPORT_TITLE",
          },
          category: "CHAT_LINE",
        },
        groupId: chatRules.supportPlace,
        threadId: "group",
      },
      {
        aps: { alert: { "loc-args": ["ほかにもありますか"] } },
        groupId: chatRules.supportPlace,
      },
    ]);
  });
});

describe("reactions and lines taken back, in Slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("show the user's on their lines' messages, and a line taken back", async () => {
    const calls = slackCalls();
    const { edit, thread, userId } = await startedChat();
    await expect(slackTsOf(userId, 1)).resolves.toBe(thread);
    await edit([react("👍", true)]);
    await edit([react("🦄", true)]);
    await edit([react("🦄", false)]);
    await edit([
      {
        kind: { case: "unsend", value: { seq: 1n, threadId: "group" } },
        opId: crypto.randomUUID(),
      },
    ]);
    expect(calls.map(({ method }) => method)).toStrictEqual([
      "chat.postMessage",
      "reactions.add",
      "chat.postMessage",
      "chat.delete",
      // Taking it back takes its reactions off too.
      "chat.update",
      "reactions.remove",
    ]);
    expect([
      calls[1]?.args.name,
      calls[1]?.args.timestamp,
      String(calls[2]?.args.text).includes("🦄"),
      calls[4]?.args.ts,
      String(calls[4]?.args.text).includes("管理サイトで開く"),
    ]).toStrictEqual(["+1", thread, true, thread, true]);
  });

  it("take Pochical's people's emoji on a user's line, not the app's own", async () => {
    slackCalls();
    const { thread, userId } = await startedChat();
    const reactionEvent = (type: string, user: string, name: string) => ({
      authorizations: [{ is_bot: true, user_id: "U-BOT" }],
      event: {
        item: { channel: "C-SUPPORT", ts: thread, type: "message" },
        reaction: name,
        type,
        user,
      },
      type: "event_callback",
    });
    const theirs = async () => {
      const reactions = await reactionsOn(userId, 1);
      return reactions
        .filter((each) => each.user_id === chatRules.pochicalMember)
        .map((each) => each.emoji);
    };
    await postEvent(reactionEvent("reaction_added", "U-BOT", "+1"));
    await postEvent(reactionEvent("reaction_added", "U-STAFF", "eyes"));
    await postEvent(
      reactionEvent("reaction_added", "U-STAFF", "+1::skin-tone-3")
    );
    await vi.waitFor(async () => {
      await expect(theirs()).resolves.toStrictEqual(["👀", "👍🏼"]);
    });
    await postEvent(reactionEvent("reaction_removed", "U-STAFF", "eyes"));
    await vi.waitFor(async () => {
      await expect(theirs()).resolves.toStrictEqual(["👍🏼"]);
    });
  });

  it("take back an answer deleted there", async () => {
    slackCalls();
    const { thread, userId } = await startedChat();
    const ts = "1700000200.000001";
    await postEvent(replyIn(thread, { text: "消す答え", ts }));
    await vi.waitFor(async () => {
      await expect(answersTo(userId)).resolves.toStrictEqual(["消す答え"]);
    });
    await relayed(userId);
    // An emoji on an answer stays in Slack.
    await postEvent({
      event: {
        item: { channel: "C-SUPPORT", ts, type: "message" },
        reaction: "eyes",
        type: "reaction_added",
        user: "U-STAFF",
      },
      type: "event_callback",
    });
    await postEvent({
      event: {
        channel: "C-SUPPORT",
        deleted_ts: ts,
        subtype: "message_deleted",
        type: "message",
      },
      type: "event_callback",
    });
    await vi.waitFor(async () => {
      await expect(answersTo(userId)).resolves.toStrictEqual([""]);
    });
    await expect(reactionsOn(userId, 2)).resolves.toStrictEqual([]);
  });
});

/**
 * A line of `count` photos the user sends in their chat, each uploaded
 * first as the app does.
 */
const sendPhoto = async (
  token: string,
  edit: Awaited<ReturnType<typeof supportChat>>["edit"],
  count = 1
): Promise<void> => {
  const photoIds = Array.from({ length: count }, () => crypto.randomUUID());
  for (const photoId of photoIds) {
    // oxlint-disable-next-line no-await-in-loop -- one after another
    const put = await exports.default.fetch(
      `${ORIGIN}/v1/support/photos/${photoId}`,
      {
        body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/jpeg",
        },
        method: "PUT",
      }
    );
    if (!put.ok) {
      throw new Error(`The photo was not uploaded: ${put.status}`);
    }
  }
  await edit([
    {
      kind: {
        case: "send",
        value: {
          content: {
            kind: {
              case: "photos",
              value: {
                photos: photoIds.map((id) => ({ height: 3, id, width: 4 })),
              },
            },
          },
          threadId: "group",
        },
      },
      opId: crypto.randomUUID(),
    },
  ]);
};

describe("a user's photo, in Slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is uploaded into their thread, its shared message kept with the line", async () => {
    const calls = slackCalls();
    const token = await signInAnonymously();
    const { edit, userId } = await supportChat(token);
    await sendPhoto(token, edit);
    await expect(slackTsOf(userId, 1)).resolves.toBe(SHARED_TS);
    const thread = await threadOf(userId);
    expect(calls.map(({ method }) => method)).toStrictEqual([
      "chat.postMessage",
      "files.getUploadURLExternal",
      "files.completeUploadExternal",
      "files.info",
    ]);
    expect(calls[2]?.args.thread_ts).toBe(thread);
    // The thread starts with the line in words, as the apps word it.
    expect(String(calls[0]?.args.text).split("\n")[1]).toBe("📷 写真");
  });

  it("of several is one message holding them all, in the line's order, worded with how many", async () => {
    const calls = slackCalls();
    const token = await signInAnonymously();
    const { edit } = await supportChat(token);
    await sendPhoto(token, edit, 3);
    const shared = calls.filter(
      ({ method }) => method === "files.completeUploadExternal"
    );
    expect([
      String(calls[0]?.args.text).split("\n")[1],
      calls
        .filter(({ method }) => method === "files.getUploadURLExternal")
        .map(({ args }) => args.filename),
      shared.map(({ args }) => args.files),
    ]).toStrictEqual([
      "📷 写真3枚",
      ["photo-1-1.jpg", "photo-1-2.jpg", "photo-1-3.jpg"],
      [
        [
          { id: "F-UP-photo-1-1.jpg", title: "写真" },
          { id: "F-UP-photo-1-2.jpg", title: "写真" },
          { id: "F-UP-photo-1-3.jpg", title: "写真" },
        ],
      ],
    ]);
  });

  it("is looked for and uploaded again while Slack does not take it, but not once shared", async () => {
    const calls = slackCalls(
      (method, before) =>
        (method === "files.getUploadURLExternal" && before === 0) ||
        method === "files.info"
    );
    // Not waiting between asking Slack where it shared the photo.
    vi.spyOn(scheduler, "wait").mockResolvedValue();
    const token = await signInAnonymously();
    const { edit, userId } = await supportChat(token);
    await sendPhoto(token, edit);
    // Shared, though Slack never says where: not shared again.
    await relayed(userId);
    expect(
      calls
        .map(({ method }) => method)
        .filter((method) => method !== "files.info")
    ).toStrictEqual([
      "chat.postMessage",
      "files.getUploadURLExternal",
      "conversations.replies",
      "files.getUploadURLExternal",
      "files.completeUploadExternal",
    ]);
    await expect(slackTsOf(userId, 1)).resolves.toBeNull();
  });

  it("is looked for again after its upload is refused, an earlier try having maybe shared it", async () => {
    const calls = slackCalls((method, before) => {
      if (method === "files.completeUploadExternal" && before === 0) {
        // Its answer lost: Slack may have shared it.
        return { error: "internal_error", status: 500 };
      }
      return method === "files.getUploadURLExternal" && before === 1;
    });
    const token = await signInAnonymously();
    const { edit } = await supportChat(token);
    await sendPhoto(token, edit);
    // Each try after the first looks for it before readying an upload.
    expect(
      calls
        .map(({ method }) => method)
        .filter((method) => method !== "files.info")
    ).toStrictEqual([
      "chat.postMessage",
      "files.getUploadURLExternal",
      "files.completeUploadExternal",
      "conversations.replies",
      "files.getUploadURLExternal",
      "conversations.replies",
      "files.getUploadURLExternal",
      "files.completeUploadExternal",
    ]);
  });
});

/**
 * When the chat's relay comes back, in seconds from now; null for never.
 * Whole seconds while the test holds the clock still.
 */
const nextTry = async (userId: string): Promise<number | null> => {
  const at = await runInDurableObject(
    env.GROUPS.getByName(supportPlace(userId)),
    async (_, state) => await state.storage.getAlarm()
  );
  return at === null ? null : (at - Date.now()) / 1000;
};

/**
 * The relay's next try run now, and when it comes back. The held clock is
 * moved to now first, so each try is at a time of its own.
 */
const relayOnce = async (userId: string): Promise<number | null> => {
  vi.setSystemTime(vi.getRealSystemTime());
  await tryNow(userId);
  return await nextTry(userId);
};

/** When the relay comes back after the try a change asked for. */
const triedAtOnce = async (userId: string): Promise<number | null> => {
  await alarmsSettled(userId);
  return await nextTry(userId);
};

describe("a line Slack took with its answer lost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Slack's answer to a call it did all the same, lost to an error. */
  const lost: Refusal = { error: "internal_error", status: 500, taken: true };

  it("is found in its thread on the next try, not posted again", async () => {
    const calls = slackCalls(
      (method, before) => method === "chat.postMessage" && before === 1 && lost
    );
    const token = await signInAnonymously();
    const { say, userId } = await supportChat(token);
    await say("はじめまして");
    const thread = await threadOf(userId);
    await say("二つ目です");
    expect(calls.map(({ method }) => method)).toStrictEqual([
      "chat.postMessage",
      "chat.postMessage",
      "conversations.replies",
    ]);
    expect(calls[2]?.args.ts).toBe(thread);
    const ts = await slackTsOf(userId, 2);
    expect([ts === null, ts === thread]).toStrictEqual([false, false]);
  });

  it("starting its thread, is found in the channel and kept as the thread", async () => {
    const calls = slackCalls(
      (method, before) =>
        method === "chat.postMessage" &&
        before === 0 && { ...lost, status: 200 }
    );
    const token = await signInAnonymously();
    const { say, userId } = await supportChat(token);
    await say("はじめまして");
    expect(calls.map(({ method }) => method)).toStrictEqual([
      "chat.postMessage",
      "conversations.history",
    ]);
    // Found by the line it is, which Slack keeps with the message.
    expect(calls[0]?.args.metadata).toStrictEqual({
      event_payload: { seq: 1, user_id: userId },
      event_type: "pochical_support_line",
    });
    const thread = await threadOf(userId);
    expect(thread).not.toBeNull();
    await expect(slackTsOf(userId, 1)).resolves.toBe(thread);
  });

  it("as a photo, is found by its file's name, not uploaded again", async () => {
    const calls = slackCalls(
      (method, before) =>
        method === "files.completeUploadExternal" && before === 0 && lost
    );
    const token = await signInAnonymously();
    const { edit, userId } = await supportChat(token);
    await sendPhoto(token, edit);
    expect(calls.map(({ method }) => method)).toStrictEqual([
      "chat.postMessage",
      "files.getUploadURLExternal",
      "files.completeUploadExternal",
      "conversations.replies",
    ]);
    expect(calls[1]?.args.filename).toBe("photo-1-1.jpg");
    const ts = await slackTsOf(userId, 1);
    expect(ts?.slice(0, SHARED_PREFIX.length)).toBe(SHARED_PREFIX);
  });

  it("is posted again when Slack, its answer lost, did not take it", async () => {
    const calls = slackCalls(
      (method, before) =>
        method === "chat.postMessage" &&
        before === 1 && { ...lost, taken: false }
    );
    const token = await signInAnonymously();
    const { say, userId } = await supportChat(token);
    await say("はじめまして");
    await say("二つ目です");
    expect(calls.map(({ method }) => method)).toStrictEqual([
      "chat.postMessage",
      "chat.postMessage",
      "conversations.replies",
      "chat.postMessage",
    ]);
    await expect(slackTsOf(userId, 2)).resolves.not.toBeNull();
  });

  it("taken back before the next try, is found and said to be taken back", async () => {
    const calls = slackCalls(
      (method, before) => method === "chat.postMessage" && before === 1 && lost
    );
    const token = await signInAnonymously();
    const { frames, say, socket, userId } = await supportChat(token);
    await say("はじめまして");
    const thread = await threadOf(userId);
    const edit = async (kind: Parameters<typeof sendFrame>[1]) => {
      sendFrame(socket, kind);
      await untilAcked(frames);
    };
    await edit({
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: {
              case: "send",
              value: {
                content: {
                  kind: { case: "words", value: { text: "まちがい" } },
                },
                threadId: "group",
              },
            },
            opId: crypto.randomUUID(),
          },
        ],
      },
    });
    // Posted, its answer lost: the relay waits to try again.
    await expect(triedAtOnce(userId)).resolves.toBeGreaterThan(0);
    await edit({
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: { case: "unsend", value: { seq: 2n, threadId: "group" } },
            opId: crypto.randomUUID(),
          },
        ],
      },
    });
    await relayed(userId);
    const posted = calls.find(
      ({ method, args }) =>
        method === "chat.postMessage" && args.text === "まちがい"
    );
    expect(posted).toBeDefined();
    expect(
      calls.slice(-2).map(({ method, args }) => [method, args.text])
    ).toStrictEqual([
      ["conversations.replies", undefined],
      ["chat.update", "（ユーザーが送信を取り消しました）"],
    ]);
    expect(calls.at(-2)?.args.ts).toBe(thread);
    const ts = await slackTsOf(userId, 2);
    expect([ts === null, calls.at(-1)?.args.ts === ts]).toStrictEqual([
      false,
      true,
    ]);
  });
});

describe("Slack's refusals", () => {
  it("pass by themselves when Slack is busy, down or out of reach, and last otherwise", () => {
    expect([
      slackRefusal(429, "30", "ratelimited"),
      slackRefusal(200, null, "ratelimited"),
      slackRefusal(503, null, undefined),
      slackRefusal(200, null, "not_in_channel"),
      slackRefusal(200, null, "invalid_auth"),
      slackRefusal(404, null, undefined),
    ]).toStrictEqual([
      { afterMs: 30_000, kind: "passing", why: "ratelimited" },
      { afterMs: null, kind: "passing", why: "ratelimited" },
      { afterMs: null, kind: "passing", why: "http_503" },
      { kind: "lasting", why: "not_in_channel" },
      { kind: "lasting", why: "invalid_auth" },
      { kind: "lasting", why: "http_404" },
    ]);
  });
});

const MINUTE_S = 60;

/** What the admin pages say of the chat's lines not reaching Slack. */
const failureOf = async (userId: string) => {
  const chats = await exports.AdminEntrypoint.supportChats();
  return chats.find((chat) => chat.userId === userId)?.slackFailure;
};

/**
 * The user's chat open, a line sent and taken, and Slack's first refusal
 * of it: the relay waiting to try again, its first wait in seconds.
 */
const refusedOnce = async (token: string) => {
  const { frames, socket, userId } = await supportChat(token);
  const send = async (text: string): Promise<void> => {
    sendFrame(socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: {
              case: "send",
              value: {
                content: { kind: { case: "words", value: { text } } },
                threadId: "group",
              },
            },
            opId: crypto.randomUUID(),
          },
        ],
      },
    });
    await untilAcked(frames);
  };
  await send("届いてますか");
  return { firstWait: await triedAtOnce(userId), send, userId };
};

describe("a support chat Slack does not take", () => {
  // Each wait is read off the alarm the try set: with the clock still, it
  // is what the try waits, however long the test takes to read it.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits twice as long each time while its setup is wrong, said on the admin pages, and posts once put right", async () => {
    let broken = true;
    const calls = slackCalls(
      (method) =>
        broken && method === "chat.postMessage" && { error: "not_in_channel" }
    );
    const token = await signInAnonymously();
    const { firstWait, userId } = await refusedOnce(token);

    const waits: (number | null)[] = [firstWait];
    const first = await failureOf(userId);
    for (let tries = 1; tries < 7; tries += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one try after another
      waits.push(await relayOnce(userId));
    }
    expect(waits).toStrictEqual(
      [1, 2, 4, 8, 16, 32, 60].map((minutes) => minutes * MINUTE_S)
    );
    // Failing since the first try, not the latest.
    await expect(failureOf(userId)).resolves.toStrictEqual({
      sinceMs: first?.sinceMs,
      why: "not_in_channel",
    });

    broken = false;
    const nextAfterTaken = await relayOnce(userId);
    // No more tries, nothing said on the admin pages, and each try posted
    // the line once, Slack keeping the last.
    expect([
      nextAfterTaken,
      await failureOf(userId),
      postsIn(calls),
    ]).toStrictEqual([null, null, 8]);
    const thread = await threadOf(userId);
    await expect(slackTsOf(userId, 1)).resolves.toBe(thread ?? "a thread");
  });

  it("waits as long as Slack asks while it limits the rate, and no more than ten minutes while Slack is down", async () => {
    let refusal: Refusal = {
      error: "ratelimited",
      retryAfterS: 300,
      status: 429,
    };
    slackCalls(() => refusal);
    const token = await signInAnonymously();
    const { firstWait, userId } = await refusedOnce(token);
    expect(firstWait).toBe(300);
    await expect(failureOf(userId)).resolves.toMatchObject({
      why: "ratelimited",
    });

    refusal = { error: "internal_error", status: 500 };
    const waits = [];
    for (let tries = 0; tries < 4; tries += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one try after another
      waits.push(await relayOnce(userId));
    }
    expect(waits).toStrictEqual(
      [2, 4, 8, 10].map((minutes) => minutes * MINUTE_S)
    );
  });

  it("tries again at once for a new line, without waiting out its wait", async () => {
    const calls = slackCalls(
      (method) => method === "chat.postMessage" && { error: "invalid_auth" }
    );
    const token = await signInAnonymously();
    const { firstWait, send, userId } = await refusedOnce(token);
    expect(firstWait).toBe(MINUTE_S);
    await send("まだですか");
    // Tried again now, the line before it first, then waiting longer.
    await expect(triedAtOnce(userId)).resolves.toBe(2 * MINUTE_S);
    expect(postsIn(calls)).toBe(2);
  });
});

/** The Worker's daily cron, run as if at `at`. */
const sweep = async (at: number): Promise<void> => {
  await worker.scheduled(
    createScheduledController({ cron: "0 18 * * *", scheduledTime: at }),
    env
  );
};

describe("a deleted account's support chat, in Slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loses the app's posts and files there, its first saying the account was deleted, Pochical's people's replies kept", async () => {
    const messages: SlackMessage[] = [];
    let slackDown = false;
    const calls = slackCalls(
      (method) => slackDown && method !== "chat.postMessage",
      messages
    );
    const token = await signInAnonymously();
    const { edit, say, socket, userId } = await supportChat(token);
    await say("色を変えたい");
    await sendPhoto(token, edit);
    await say("お願いします");
    const thread = await threadOf(userId);
    const staff = {
      files: [{ id: "F-STAFF", user: "U-STAFF" }],
      text: "設定から変えられます",
      thread_ts: thread,
      ts: "1700000100.000001",
      user: "U-STAFF",
    };
    messages.push(staff);
    socket.close();

    // Slack down as the account goes: the deletion is done all the same,
    // and the app's posts wait for the cron.
    slackDown = true;
    const deleted = await call(
      "UserService/DeleteAccount",
      { appleAuthorizationCode: "" },
      token
    );
    await vi.waitFor(() => {
      expect(calls.at(-1)?.method).toBe("auth.test");
    });
    const waiting = messages.length;

    slackDown = false;
    const now = Date.now();
    await sweep(now);
    const erased = structuredClone(messages);
    const tried = calls.length;
    // Looked at again a day on, as a late post may land, with nothing
    // left to delete; then no more.
    await sweep(now + 2 * 24 * 60 * 60 * 1000);
    const again = calls.slice(tried).map(({ method }) => method);
    const looked = calls.length;
    await sweep(now + 3 * 24 * 60 * 60 * 1000);
    expect({
      again,
      deleted: deleted.status,
      erased,
      later: calls.length - looked,
      waiting,
    }).toStrictEqual({
      again: ["auth.test", "conversations.replies"],
      deleted: 200,
      erased: [
        {
          bot_id: APP_BOT,
          channel: "C-SUPPORT",
          metadata: {
            event_payload: {},
            event_type: "pochical_account_deleted",
          },
          text: "（このユーザーのアカウントは削除されました。ユーザーのメッセージと写真は、アプリ・管理サイト・Slackから削除されています）",
          ts: thread,
          user: APP_USER,
        },
        staff,
      ],
      later: 0,
      waiting: 4,
    });
  });
});
