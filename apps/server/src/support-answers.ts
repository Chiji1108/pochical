// An answer from Pochical's people in a user's support chat, written on
// the admin site or in its Slack thread (spec/admin.md).
import { textLimits } from "@pochical/design/limits";

import { characterCount } from "./text-limits";

/**
 * Keeps the answer and tells the user at once: their open chat over
 * their socket, their devices by notification. Null, keeping nothing,
 * for no words or more than textLimits.chatMessage; else the answer's id.
 * An answer already kept under `id` is kept once and told once. One
 * written in Slack keeps its message there (`slackTs`).
 */
export const answerSupport = async (
  env: Env,
  userId: string,
  text: string,
  {
    id = crypto.randomUUID(),
    slackTs = null,
  }: { id?: string; slackTs?: string | null } = {}
): Promise<string | null> => {
  const words = text.trim();
  if (words === "" || characterCount(words) > textLimits.chatMessage) {
    return null;
  }
  const now = Date.now();
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      "insert into support_messages (id, user_id, from_support, text, created_at, slack_ts) values (?, ?, 1, ?, ?, ?) on conflict (id) do nothing"
    ).bind(id, userId, words, now, slackTs),
    env.DB.prepare(
      "insert into support_chats (user_id, last_at) values (?, ?) on conflict (user_id) do update set last_at = excluded.last_at"
    ).bind(userId, now),
  ]);
  if (inserted?.meta.changes === 0) {
    return id;
  }
  // The answer is kept: the user reads it as their chat next opens, even
  // when telling them now fails.
  try {
    await env.USERS.getByName(userId).supportAnswered(words);
  } catch {
    // Nothing more to do: saying it was not kept would only send it twice.
  }
  return id;
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
