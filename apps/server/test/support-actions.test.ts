import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { answerSupport } from "../src/support-answers";
import { call, signInAnonymously, userIdOf } from "./helpers";

type Reaction = { emoji: string; mine: boolean; support: boolean };
type Line = {
  id: string;
  text: string;
  replyTo: string;
  unsent: boolean;
  reactions: Reaction[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const textOf = (value: unknown): string =>
  typeof value === "string" ? value : "";

// A line as Connect's JSON gives it, its defaults filled in.
const lineFrom = (value: unknown): Line => {
  const line = isRecord(value) ? value : {};
  const reactions = Array.isArray(line.reactions) ? line.reactions : [];
  return {
    id: textOf(line.id),
    reactions: reactions.filter(isRecord).map((reaction) => ({
      emoji: textOf(reaction.emoji),
      mine: reaction.mine === true,
      support: reaction.support === true,
    })),
    replyTo: textOf(line.replyTo),
    text: textOf(line.text),
    unsent: line.unsent === true,
  };
};

const chatOf = async (token: string): Promise<Line[]> => {
  const response = await call("SupportService/GetSupportChat", {}, token);
  const body: unknown = await response.json();
  const messages =
    isRecord(body) && Array.isArray(body.messages) ? body.messages : [];
  return messages.map(lineFrom);
};

const send = async (
  token: string,
  text: string,
  replyTo = ""
): Promise<Line> => {
  const response = await call(
    "SupportService/SendSupportMessage",
    { id: crypto.randomUUID(), replyTo, text },
    token
  );
  const body: unknown = await response.json();
  return lineFrom(isRecord(body) ? body.message : null);
};

/** The status of a reaction put on or taken off. */
const react = async (
  token: string,
  id: string,
  emoji: string,
  on: boolean
): Promise<number> => {
  const response = await call(
    "SupportService/ReactSupport",
    { emoji, id, on },
    token
  );
  return response.status;
};

/** The status of a line taken back. */
const unsend = async (token: string, id: string): Promise<number> => {
  const response = await call(
    "SupportService/UnsendSupportMessage",
    { id },
    token
  );
  return response.status;
};

const firstLine = async (token: string): Promise<Line | undefined> => {
  const lines = await chatOf(token);
  return lines.at(0);
};

describe("a line in the chat with Pochical's people", () => {
  it("may be a reply to one still in the chat", async () => {
    const token = await signInAnonymously();
    const first = await send(token, "色を変えたい");
    const reply = await send(token, "日勤の色です", first.id);
    const stray = await send(token, "ほか", crypto.randomUUID());
    expect([reply.replyTo, stray.replyTo]).toStrictEqual([first.id, ""]);
  });

  it("takes the user's emoji, one at a time, and takes it off", async () => {
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    const answer = await answerSupport(env, userId, "設定から変えられます");
    const id = answer ?? "";
    await react(token, id, "🙏", true);
    await react(token, id, "🙏", true);
    const reacted = await firstLine(token);
    expect(reacted?.reactions).toStrictEqual([
      { emoji: "🙏", mine: true, support: false },
    ]);
    const words = await react(token, id, "ありがとう", true);
    await react(token, id, "🙏", false);
    const taken = await firstLine(token);
    expect([words, taken?.reactions]).toStrictEqual([400, []]);
  });

  it("is taken back by its writer alone, its words and reactions gone", async () => {
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    const line = await send(token, "スクショに名前が写ってた");
    await react(token, line.id, "👀", true);
    const answer = (await answerSupport(env, userId, "消しておきます")) ?? "";
    const other = await signInAnonymously();
    const statuses = [
      await unsend(token, answer),
      await unsend(other, line.id),
      await unsend(token, line.id),
      await react(token, line.id, "👀", true),
    ];
    expect(statuses).toStrictEqual([404, 404, 200, 404]);
    await expect(firstLine(token)).resolves.toStrictEqual({
      id: line.id,
      reactions: [],
      replyTo: "",
      text: "",
      unsent: true,
    });
  });
});
