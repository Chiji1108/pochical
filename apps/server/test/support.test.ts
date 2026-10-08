import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { call, signInAnonymously, userIdOf } from "./helpers";

type Message = { fromSupport: boolean; text: string };
type Chat = { messages: Message[]; unread: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// The chat as GetSupportChat answers it in JSON, its defaults filled in
// where Connect leaves them out.
const chatFrom = (body: unknown): Chat => {
  const messages =
    isRecord(body) && Array.isArray(body.messages) ? body.messages : [];
  return {
    messages: messages.filter(isRecord).map((message) => ({
      fromSupport: message.fromSupport === true,
      text: typeof message.text === "string" ? message.text : "",
    })),
    unread: isRecord(body) && typeof body.unread === "number" ? body.unread : 0,
  };
};

const chatOf = async (token: string): Promise<Chat> => {
  const response = await call("SupportService/GetSupportChat", {}, token);
  return chatFrom(await response.json());
};

/** The status of a line sent to Pochical's people. */
const sent = async (token: string, text: string, id = crypto.randomUUID()) => {
  const response = await call(
    "SupportService/SendSupportMessage",
    { id, text },
    token
  );
  return response.status;
};

describe("the chat with Pochical's people", () => {
  it("keeps a user's lines for them alone, once each", async () => {
    const token = await signInAnonymously();
    const id = crypto.randomUUID();
    // Tried again, the line is kept once.
    expect([
      await sent(token, "日勤の色を変えたい", id),
      await sent(token, "日勤の色を変えたい", id),
    ]).toStrictEqual([200, 200]);
    const chat = await chatOf(token);
    expect(chat.messages.map((message) => message.text)).toStrictEqual([
      "日勤の色を変えたい",
    ]);
    // Someone else sees none of it, and cannot take the id.
    const other = await signInAnonymously();
    const theirs = await chatOf(other);
    expect([theirs.messages, await sent(other, "x", id)]).toStrictEqual([
      [],
      409,
    ]);
  });

  it("takes no empty line, nor one past the limit", async () => {
    const token = await signInAnonymously();
    expect([
      await sent(token, "  "),
      await sent(token, "あ".repeat(1001)),
      await sent(token, "あ".repeat(1000)),
    ]).toStrictEqual([400, 400, 200]);
  });

  it("counts the answers not read until the chat is read", async () => {
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    await sent(token, "質問");
    await env.DB.prepare(
      "insert into support_messages (id, user_id, from_support, text, created_at) values (?, ?, 1, ?, ?)"
    )
      .bind(crypto.randomUUID(), userId, "お答えします", Date.now() + 1)
      .run();
    const before = await chatOf(token);
    expect([before.unread, before.messages.at(-1)?.fromSupport]).toStrictEqual([
      1,
      true,
    ]);
    await call("SupportService/MarkSupportRead", {}, token);
    const after = await chatOf(token);
    expect(after.unread).toBe(0);
  });

  it("is for signed-in users only", async () => {
    const response = await call("SupportService/GetSupportChat", {});
    expect(response.status).toBe(401);
  });
});
