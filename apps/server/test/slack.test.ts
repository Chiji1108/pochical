import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fromSlackText, signedBySlack, toSlackText } from "../src/slack";
import { call, ORIGIN, signInAnonymously, userIdOf } from "./helpers";

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

const answersTo = async (userId: string): Promise<string[]> => {
  const { results } = await env.DB.prepare(
    "select text from support_messages where user_id = ? and from_support = 1 order by created_at"
  )
    .bind(userId)
    .all<{ text: string }>();
  return results.map((row) => row.text);
};

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
  const userId = await userIdOf(token);
  await call(
    "SupportService/SendSupportMessage",
    { id: crypto.randomUUID(), text: "質問です" },
    token
  );
  await vi.waitFor(async () => {
    await expect(threadOf(userId)).resolves.not.toBeNull();
  });
  return { thread: await threadOf(userId), token, userId };
};

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
    const userId = await userIdOf(token);
    const send = async (text: string) =>
      await call(
        "SupportService/SendSupportMessage",
        { device: "ポチカル 1.0・iPhone", id: crypto.randomUUID(), text },
        token
      );
    await send("色を変えたい");
    await vi.waitFor(async () => {
      await expect(threadOf(userId)).resolves.not.toBeNull();
    });
    const thread = await threadOf(userId);
    await send("あと<!channel>");
    await vi.waitFor(() => {
      expect(calls).toHaveLength(2);
    });
    expect(
      calls.map(({ args }) => [args.channel, args.thread_ts])
    ).toStrictEqual([
      ["C-SUPPORT", undefined],
      ["C-SUPPORT", thread],
    ]);
    expect(calls[1]?.args.text).toBe("あと&lt;!channel&gt;");

    const reply = {
      event: {
        channel: "C-SUPPORT",
        client_msg_id: crypto.randomUUID(),
        text: "設定から変えられます &amp; 試してね",
        thread_ts: thread,
        ts: "1700000100.000001",
        type: "message",
        user: "U-STAFF",
      },
      type: "event_callback",
    };
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
  });

  it("takes no reply from a bot, another channel or outside a thread", async () => {
    const calls = slackCalls();
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    await call(
      "SupportService/SendSupportMessage",
      { id: crypto.randomUUID(), text: "質問です" },
      token
    );
    await vi.waitFor(async () => {
      await expect(threadOf(userId)).resolves.not.toBeNull();
    });
    const thread = await threadOf(userId);
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
    const image = {
      id: "F1",
      mimetype: "image/png",
      thumb_1024: "https://files.slack.com/files-tmb/F1-1024.png",
      thumb_1024_h: 768,
      thumb_1024_w: 1024,
    };
    await postEvent(
      replyIn(thread, {
        files: [image, { id: "F2", mimetype: "application/pdf" }],
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
    const { results } = await env.DB.prepare(
      "select text, photo_id, photo_width, photo_height from support_messages where user_id = ? and from_support = 1 order by id"
    )
      .bind(userId)
      .all();
    const kept = await env.PHOTOS.get(`support/${userId}/photos/slack-F1`);
    expect([
      results,
      kept?.httpMetadata?.contentType,
      calls.some(({ args }) => String(args.text).includes("ファイル")),
    ]).toStrictEqual([
      [
        {
          photo_height: null,
          photo_id: null,
          photo_width: null,
          text: "設定画面です",
        },
        {
          photo_height: 768,
          photo_id: "slack-F1",
          photo_width: 1024,
          text: "",
        },
      ],
      "image/png",
      true,
    ]);
  });
});

/** A user's line in the chat, by its text. */
const lineOf = async (userId: string, text: string) =>
  await env.DB.prepare(
    "select id, slack_ts, unsent from support_messages where user_id = ? and text = ?"
  )
    .bind(userId, text)
    .first<{ id: string; slack_ts: string | null; unsent: number }>();

const supportReactions = async (id: string): Promise<string[]> => {
  const { results } = await env.DB.prepare(
    "select emoji from support_reactions where message_id = ? and from_support = 1"
  )
    .bind(id)
    .all<{ emoji: string }>();
  return results.map((row) => row.emoji);
};

describe("reactions and lines taken back, in Slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("show the user's on their lines' messages", async () => {
    const calls = slackCalls();
    const { thread, token, userId } = await startedChat();
    const line = await lineOf(userId, "質問です");
    expect(line?.slack_ts).toBe(thread);
    const id = line?.id ?? "";
    await call(
      "SupportService/ReactSupport",
      { emoji: "👍", id, on: true },
      token
    );
    await call(
      "SupportService/ReactSupport",
      { emoji: "🦄", id, on: true },
      token
    );
    await call("SupportService/UnsendSupportMessage", { id }, token);
    await vi.waitFor(() => {
      expect(calls.map(({ method }) => method)).toStrictEqual([
        "chat.postMessage",
        "reactions.add",
        "chat.postMessage",
        "chat.update",
      ]);
    });
    expect([
      calls[1]?.args.name,
      calls[1]?.args.timestamp,
      calls[3]?.args.ts,
      String(calls[3]?.args.text).includes("管理サイトで開く"),
    ]).toStrictEqual(["+1", thread, thread, true]);
  });

  it("take Pochical's people's emoji on a user's line, not the app's own", async () => {
    slackCalls();
    const { thread, userId } = await startedChat();
    const line = await lineOf(userId, "質問です");
    const id = line?.id ?? "";
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
    await postEvent(reactionEvent("reaction_added", "U-BOT", "+1"));
    await postEvent(reactionEvent("reaction_added", "U-STAFF", "eyes"));
    await postEvent(
      reactionEvent("reaction_added", "U-STAFF", "+1::skin-tone-3")
    );
    await vi.waitFor(async () => {
      await expect(supportReactions(id)).resolves.toStrictEqual(["👀", "👍🏼"]);
    });
    await postEvent(reactionEvent("reaction_removed", "U-STAFF", "eyes"));
    await vi.waitFor(async () => {
      await expect(supportReactions(id)).resolves.toStrictEqual(["👍🏼"]);
    });
  });

  it("take back an answer deleted there", async () => {
    slackCalls();
    const { thread, userId } = await startedChat();
    await postEvent(
      replyIn(thread, { text: "消す答え", ts: "1700000200.000001" })
    );
    await vi.waitFor(async () => {
      await expect(answersTo(userId)).resolves.toStrictEqual(["消す答え"]);
    });
    const answer = await lineOf(userId, "消す答え");
    await postEvent({
      event: {
        channel: "C-SUPPORT",
        deleted_ts: answer?.slack_ts,
        subtype: "message_deleted",
        type: "message",
      },
      type: "event_callback",
    });
    await vi.waitFor(async () => {
      await expect(answersTo(userId)).resolves.toStrictEqual([""]);
    });
  });
});

describe("a user's photo, in Slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is uploaded into their thread, its shared message kept with the line", async () => {
    const calls = slackCalls();
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
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
    const sent = await call(
      "SupportService/SendSupportMessage",
      { id: crypto.randomUUID(), photo: { height: 3, id: photoId, width: 4 } },
      token
    );
    expect([put.status, sent.status]).toStrictEqual([204, 200]);
    await vi.waitFor(async () => {
      const line = await env.DB.prepare(
        "select slack_ts from support_messages where user_id = ?"
      )
        .bind(userId)
        .first<string>("slack_ts");
      expect(line).toBe(SHARED_TS);
    });
    const thread = await threadOf(userId);
    expect(calls.map(({ method }) => method)).toStrictEqual([
      "chat.postMessage",
      "files.getUploadURLExternal",
      "files.completeUploadExternal",
      "files.info",
    ]);
    expect(calls[2]?.args.thread_ts).toBe(thread);
  });

  it("goes only once uploaded, alone, and goes from the bucket when taken back", async () => {
    slackCalls();
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    const photoId = crypto.randomUUID();
    const send = async (more: Record<string, unknown>) => {
      const response = await call(
        "SupportService/SendSupportMessage",
        {
          id: crypto.randomUUID(),
          photo: { height: 3, id: photoId, width: 4 },
          ...more,
        },
        token
      );
      return response.status;
    };
    const early = await send({});
    await env.PHOTOS.put(`support/${userId}/photos/${photoId}`, "jpeg");
    const withWords = await send({ text: "これです" });
    const id = crypto.randomUUID();
    const kept = await send({ id });
    const again = await send({ id });
    const twice = await send({});
    await call("SupportService/UnsendSupportMessage", { id }, token);
    const gone = await env.PHOTOS.head(`support/${userId}/photos/${photoId}`);
    expect([early, withWords, kept, again, twice, gone]).toStrictEqual([
      400,
      400,
      200,
      200,
      409,
      null,
    ]);
  });
});
