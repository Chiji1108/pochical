import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fromSlackText, signedBySlack, toSlackText } from "../src/slack";
import { call, ORIGIN, signInAnonymously, userIdOf } from "./helpers";

const SECRET = "slack-signing-secret";

// Each message Slack posts gets its own time, across the tests too.
let posts = 0;

/** What reached Slack's Web API, as each method and its arguments. */
const slackCalls = () => {
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const args: Record<string, unknown> = await request.json();
    const method = new URL(request.url).pathname.replace("/api/", "");
    calls.push({ args, method });
    posts += method === "chat.postMessage" ? 1 : 0;
    return Response.json({
      ok: true,
      ts: `1700000000.${String(posts).padStart(6, "0")}`,
    });
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
  return { thread: await threadOf(userId), userId };
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

  it("answers a reply also sent to the channel, and says why not to one with a file", async () => {
    const calls = slackCalls();
    const { thread, userId } = await startedChat();
    await postEvent(
      replyIn(thread, { subtype: "thread_broadcast", text: "チャンネルにも" })
    );
    await vi.waitFor(async () => {
      await expect(answersTo(userId)).resolves.toStrictEqual([
        "チャンネルにも",
      ]);
    });
    const before = calls.length;
    await postEvent(
      replyIn(thread, {
        files: [{ id: "F1" }],
        subtype: "file_share",
        text: "スクショです",
      })
    );
    await vi.waitFor(() => {
      expect(calls).toHaveLength(before + 1);
    });
    expect(String(calls.at(-1)?.args.text)).toContain("写真やファイル");
    await expect(answersTo(userId)).resolves.toStrictEqual(["チャンネルにも"]);
  });
});
