// What Pochical's people's admin site (apps/admin, admin.pochical.app)
// asks of the server, as Workers RPC through its service binding to this
// named entrypoint (spec/admin.md). Nothing here has a public address: the
// apps and the internet reach only the default entrypoint's fetch.
import { textLimits } from "@pochical/design/limits";
import { WorkerEntrypoint } from "cloudflare:workers";

import { characterCount } from "./text-limits";

/** A user's chat as the list shows it: its latest line, and whose. */
export type SupportChatSummary = {
  userId: string;
  lastAtMs: number;
  text: string;
  fromSupport: boolean;
};

/** A line of a user's chat, with the app and device it came from. */
export type SupportChatLine = {
  id: string;
  atMs: number;
  fromSupport: boolean;
  text: string;
  device: string | null;
};

/** What a member reported, with what they saw. */
export type ReportSummary = {
  atMs: number;
  reason: string;
  groupId: string;
  reporterId: string;
  targetId: string;
  context: string;
};

/** The most a list gives at once. */
const PAGE = 200;

export class AdminEntrypoint extends WorkerEntrypoint<Env> {
  /** Every user's chat, the latest first. */
  async supportChats(): Promise<SupportChatSummary[]> {
    const { results } = await this.env.DB.prepare(
      `select c.user_id, c.last_at, m.text, m.from_support
       from support_chats c join support_messages m on m.user_id = c.user_id
       and m.id = (select id from support_messages where user_id = c.user_id
         order by created_at desc, id desc limit 1)
       order by c.last_at desc limit ?`
    )
      .bind(PAGE)
      .all<{
        user_id: string;
        last_at: number;
        text: string;
        from_support: number;
      }>();
    return results.map((row) => ({
      fromSupport: row.from_support === 1,
      lastAtMs: row.last_at,
      text: row.text,
      userId: row.user_id,
    }));
  }

  /** One user's chat, oldest first. */
  async supportChat(userId: string): Promise<SupportChatLine[]> {
    const { results } = await this.env.DB.prepare(
      "select id, created_at, from_support, text, device from support_messages where user_id = ? order by created_at, id"
    )
      .bind(userId)
      .all<{
        id: string;
        created_at: number;
        from_support: number;
        text: string;
        device: string | null;
      }>();
    return results.map((row) => ({
      atMs: row.created_at,
      device: row.device,
      fromSupport: row.from_support === 1,
      id: row.id,
      text: row.text,
    }));
  }

  /**
   * An answer from Pochical's people, kept and told to the user at once:
   * their open chat over their socket, their devices by notification.
   * False, keeping nothing, for no words or more than
   * textLimits.chatMessage.
   */
  async answerSupport(userId: string, text: string): Promise<boolean> {
    const words = text.trim();
    if (words === "" || characterCount(words) > textLimits.chatMessage) {
      return false;
    }
    const now = Date.now();
    await this.env.DB.batch([
      this.env.DB.prepare(
        "insert into support_messages (id, user_id, from_support, text, created_at) values (?, ?, 1, ?, ?)"
      ).bind(crypto.randomUUID(), userId, words, now),
      this.env.DB.prepare(
        "insert into support_chats (user_id, last_at) values (?, ?) on conflict (user_id) do update set last_at = excluded.last_at"
      ).bind(userId, now),
    ]);
    // The answer is kept: the user reads it as their chat next opens, even
    // when telling them now fails.
    try {
      await this.env.USERS.getByName(userId).supportAnswered(words);
    } catch {
      // Nothing more to do: saying it was not kept would only send it twice.
    }
    return true;
  }

  /** What members reported, the latest first. */
  async reports(): Promise<ReportSummary[]> {
    const { results } = await this.env.DB.prepare(
      "select created_at, reason, group_id, reporter_id, target_id, context from reports order by created_at desc limit ?"
    )
      .bind(PAGE)
      .all<{
        created_at: number;
        reason: string;
        group_id: string;
        reporter_id: string;
        target_id: string;
        context: string;
      }>();
    return results.map((row) => ({
      atMs: row.created_at,
      context: row.context,
      groupId: row.group_id,
      reason: row.reason,
      reporterId: row.reporter_id,
      targetId: row.target_id,
    }));
  }
}
