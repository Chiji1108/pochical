import { chatRules } from "@pochical/design/chat";
import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { supportPlace } from "../src/group-chat";
import { fromSlackText, signedBySlack, toSlackText } from "../src/slack";
import { call, ORIGIN, signInAnonymously } from "./helpers";
import { relayed, supportChat } from "./sync-helpers";

const SECRET = "slack-signing-secret";

// Each message Slack posts gets its own time, across the tests too.
let posts = 0;

/** Where Slack says a file uploaded by the app was shared. */
const SHARED_TS = "1700000300.000001";

/** What Slack answers each of its Web API methods with here. */
const slackAnswer = (method: string): Record<string, unknown> => {
  switch (method) {
    case "files.getUploadURLExternal": {
      return {
        file_id: "F-UP",
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
    default: {
      posts += method === "chat.postMessage" ? 1 : 0;
      return { ok: true, ts: `1700000000.${String(posts).padStart(6, "0")}` };
    }
  }
};

/**
 * What reached Slack's Web API, as each method and its arguments; Slack's
 * file host takes uploads and gives back a small PNG.
 */
const slackCalls = () => {
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.host === "files.slack.com") {
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        headers: { "Content-Type": "image/png" },
      });
    }
    const args: Record<string, unknown> = await request.json();
    const method = url.pathname.replace("/api/", "");
    calls.push({ args, method });
    return Response.json(slackAnswer(method));
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
  unsent: number;
  photo: string | null;
};

/** The chat's lines as its Group DO keeps them. */
const linesOf = async (userId: string): Promise<Kept[]> =>
  await runInDurableObject(
    env.GROUPS.getByName(supportPlace(userId)),
    (_, state) =>
      state.storage.sql
        .exec<Kept>(
          "select seq, author_id, text, unsent, photo from chat_lines order by seq"
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

  it("sends a reply's images as photos before its words, and says why not to other files", async () => {
    const calls = slackCalls();
    const { thread, userId } = await startedChat();
    await postEvent(
      replyIn(thread, {
        files: [slackImage("F1"), { id: "F2", mimetype: "application/pdf" }],
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
      answers.map(({ text, photo }) => [text, photo === null]),
      JSON.parse(answers[0]?.photo ?? "{}"),
      kept?.httpMetadata?.contentType,
    ]).toMatchObject([
      [
        ["", false],
        ["設定画面です", true],
      ],
      { height: 768, id: "slack-F1", width: 1024 },
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
    await exports.AdminEntrypoint.answerSupport(userId, "ほかにもありますか");
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

describe("a user's photo, in Slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is uploaded into their thread, its shared message kept with the line", async () => {
    const calls = slackCalls();
    const token = await signInAnonymously();
    const { edit, userId } = await supportChat(token);
    const photoId = crypto.randomUUID();
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const put = await exports.default.fetch(
      `${ORIGIN}/v1/support/photos/${photoId}`,
      {
        body: jpeg,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/jpeg",
        },
        method: "PUT",
      }
    );
    expect(put.status).toBe(204);
    await edit([
      {
        kind: {
          case: "send",
          value: {
            photo: { height: 3, id: photoId, width: 4 },
            text: "",
            threadId: "group",
          },
        },
        opId: crypto.randomUUID(),
      },
    ]);
    await expect(slackTsOf(userId, 1)).resolves.toBe(SHARED_TS);
    const thread = await threadOf(userId);
    expect(calls.map(({ method }) => method)).toStrictEqual([
      "chat.postMessage",
      "files.getUploadURLExternal",
      "files.completeUploadExternal",
      "files.info",
    ]);
    expect(calls[2]?.args.thread_ts).toBe(thread);
  });
});
