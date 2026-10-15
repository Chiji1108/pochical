// An answer from Pochical's people in a user's support chat, written on
// the admin site or in its Slack thread (spec/admin.md).
import { textLimits } from "@pochical/design/limits";

import { pageOfWords } from "./link-preview";
import { characterCount } from "./text-limits";

/** A photo in the chat: its id under the user's support photos, and size. */
export type SupportPhotoOf = { id: string; width: number; height: number };

/** How an answer that is a photo reads in its notification. */
export const PHOTO_WORDS = "📷 写真";

type AnswerOptions = {
  id?: string;
  photo?: SupportPhotoOf | null;
  slackTs?: string | null;
};

/**
 * Keeps the answer without telling anyone: null, keeping nothing, for no
 * words or more than textLimits.chatMessage; else its id, and whether it
 * is new, as one already kept under `id` is kept once. An answer may be a
 * photo already in the bucket instead, with no words. One written in
 * Slack keeps its message there (`slackTs`).
 */
export const keepSupportAnswer = async (
  env: Env,
  userId: string,
  text: string,
  { id = crypto.randomUUID(), photo = null, slackTs = null }: AnswerOptions = {}
): Promise<{ id: string; added: boolean } | null> => {
  const words = photo === null ? text.trim() : "";
  if (
    photo === null &&
    (words === "" || characterCount(words) > textLimits.chatMessage)
  ) {
    return null;
  }
  // The page of a link in the answer, as a group chat's line has it.
  const preview = words === "" ? null : await pageOfWords(env.PHOTOS, words);
  const now = Date.now();
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      "insert into support_messages (id, user_id, from_support, text, created_at, slack_ts, photo_id, photo_width, photo_height, preview) values (?, ?, 1, ?, ?, ?, ?, ?, ?, ?) on conflict (id) do nothing"
    ).bind(
      id,
      userId,
      words,
      now,
      slackTs,
      photo?.id ?? null,
      photo?.width ?? null,
      photo?.height ?? null,
      preview === null ? null : JSON.stringify(preview)
    ),
    env.DB.prepare(
      "insert into support_chats (user_id, last_at) values (?, ?) on conflict (user_id) do update set last_at = excluded.last_at"
    ).bind(userId, now),
  ]);
  return { added: inserted?.meta.changes !== 0, id };
};

/**
 * Tells the user of new answers at once: their open chat over their
 * socket, their devices by one notification reading `preview`. The
 * answers are kept already: the user reads them as their chat next opens,
 * even when telling them now fails.
 */
export const tellAnswered = async (
  env: Env,
  userId: string,
  preview: string
): Promise<void> => {
  try {
    await env.USERS.getByName(userId).supportAnswered(preview);
  } catch {
    // Nothing more to do: saying it was not kept would only send it twice.
  }
};

/**
 * Keeps the answer and tells the user at once (keepSupportAnswer,
 * tellAnswered): null for no words or too many, else the answer's id. An
 * answer already kept under `id` is kept once and told once.
 */
export const answerSupport = async (
  env: Env,
  userId: string,
  text: string,
  options: AnswerOptions = {}
): Promise<string | null> => {
  const kept = await keepSupportAnswer(env, userId, text, options);
  if (kept?.added === true) {
    await tellAnswered(env, userId, options.photo ? PHOTO_WORDS : text.trim());
  }
  return kept?.id ?? null;
};

/**
 * Pochical's people reacted in the user's chat or took an answer back: an
 * open chat reads itself again, with no notification.
 */
export const tellSupportChanged = async (
  env: Env,
  userId: string
): Promise<void> => {
  try {
    await env.USERS.getByName(userId).supportChanged();
  } catch {
    // The user sees it as their chat next opens.
  }
};
