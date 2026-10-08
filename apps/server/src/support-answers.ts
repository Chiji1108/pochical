// An answer from Pochical's people in a user's support chat, written on
// the admin site or in its Slack thread (spec/admin.md).
import { textLimits } from "@pochical/design/limits";

import { characterCount } from "./text-limits";

/**
 * Keeps the answer and tells the user at once: their open chat over
 * their socket, their devices by notification. False, keeping nothing,
 * for no words or more than textLimits.chatMessage; an answer already
 * kept under `id` is kept once and told once.
 */
export const answerSupport = async (
  env: Env,
  userId: string,
  text: string,
  id: string = crypto.randomUUID()
): Promise<boolean> => {
  const words = text.trim();
  if (words === "" || characterCount(words) > textLimits.chatMessage) {
    return false;
  }
  const now = Date.now();
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      "insert into support_messages (id, user_id, from_support, text, created_at) values (?, ?, 1, ?, ?) on conflict (id) do nothing"
    ).bind(id, userId, words, now),
    env.DB.prepare(
      "insert into support_chats (user_id, last_at) values (?, ?) on conflict (user_id) do update set last_at = excluded.last_at"
    ).bind(userId, now),
  ]);
  if (inserted?.meta.changes === 0) {
    return true;
  }
  // The answer is kept: the user reads it as their chat next opens, even
  // when telling them now fails.
  try {
    await env.USERS.getByName(userId).supportAnswered(words);
  } catch {
    // Nothing more to do: saying it was not kept would only send it twice.
  }
  return true;
};
