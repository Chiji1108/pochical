"use server";

import { textLimits } from "@pochical/design/limits";
import { characterCount, withinLimit } from "@pochical/design/text";
import { env } from "cloudflare:workers";

/** The answer form's words and the draft they belong to. */
export type Draft = { id: string; text: string; error?: string };

export type Answered =
  | { kept: true }
  | { kept: false; status: 400 | 502; draft: Draft };

/**
 * An answer's op id: the form's draft id with its words as the chat keeps
 * them, so the same words sent again from the same draft are one line,
 * with or without JavaScript, and other words are an answer of their own.
 */
const opIdOf = async (draftId: string, words: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${draftId}\n${words}`)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

/**
 * Answers a user's support chat as ポチカル, from the form's own POST
 * without JavaScript or as a server function with it.
 */
export async function answer(
  userId: string,
  form: FormData
): Promise<Answered> {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const text = field("text");
  // The words and the draft go back with the error, so sending them again
  // is the same answer.
  const refuse = (status: 400 | 502, error: string): Answered => ({
    draft: { error, id: field("draftId"), text },
    kept: false,
    status,
  });
  // The server keeps the words trimmed, and holds them to the limit so.
  const words = text.trim();
  if (words === "") {
    return refuse(400, "返信を書いてください。");
  }
  if (!withinLimit(words, textLimits.chatMessage)) {
    return refuse(
      400,
      `返信が長すぎます（${characterCount(words)}/${textLimits.chatMessage}文字）。`
    );
  }
  const kept = await env.SERVER.answerSupport(
    userId,
    text,
    await opIdOf(field("draftId"), words)
  ).catch(() => false);
  return kept ? { kept: true } : refuse(502, "返信できませんでした。");
}
