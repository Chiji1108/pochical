// The D1 database's tables. Change them here and run `mise run db:generate`
// for the migration; never edit the files in migrations/ by hand.
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// Which group each live invite code opens. The Group DO owns the group
// itself; this index exists because a link carries only the code. A group
// has one live code: remaking the link replaces its row, so the old code
// stops working at once.
export const invites = sqliteTable("invites", {
  code: text().primaryKey(),
  groupId: text("group_id").notNull().unique(),
});

// What members have reported to Pochical (spec/chat.md, Reporting and
// blocking), kept with what they saw, so a line taken back since can still
// be looked at. Nobody in the group is told.
export const reports = sqliteTable("reports", {
  // A line's reported, the few lines around it as they were, as JSON
  // ({ seq, authorId, text }[]); a member's, their name in the group.
  context: text().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  groupId: text("group_id").notNull(),
  id: text().primaryKey(),
  // spam, harassment, explicit, impersonation or other.
  reason: text().notNull(),
  reporterId: text("reporter_id").notNull(),
  // The line reported, when it is one: its place in its chat.
  seq: integer(),
  // Who is reported: the member, or the line's writer.
  targetId: text("target_id").notNull(),
  // The line reported's chat, when it is one.
  threadId: text("thread_id"),
});

// An index of every user's chat with Pochical's people, whose lines are
// kept in its own Group DO (support:{userId}, spec/chat.md, The chat with
// Pochical's people): one row a chat, which the DO keeps up to date as it
// tells its changes (support_relay), so the admin pages list every chat at
// once, and a reply in Slack finds whose chat its thread is.
export const supportChats = sqliteTable(
  "support_chats",
  {
    // The latest line's time, and the list's order.
    lastAt: integer("last_at", { mode: "timestamp_ms" }).notNull(),
    // The latest line is Pochical's people's.
    lastFromPochical: integer("last_from_pochical", { mode: "boolean" })
      .notNull()
      .default(false),
    // The latest line's words, 📷 写真 for a photo, empty once taken back.
    lastText: text("last_text").notNull().default(""),
    // The latest line was taken back.
    lastUnsent: integer("last_unsent", { mode: "boolean" })
      .notNull()
      .default(false),
    // Since when, and why (Slack's word for it), the chat's Group DO has
    // not told Slack its lines; none while it tells them.
    slackFailingSince: integer("slack_failing_since", { mode: "timestamp_ms" }),
    slackFailure: text("slack_failure"),
    // The Slack thread Pochical's people read and answer the chat in.
    slackThreadTs: text("slack_thread_ts"),
    // The user's lines after Pochical's people last wrote: waiting for an
    // answer (未返信) while more than none.
    unanswered: integer().notNull().default(0),
    userId: text("user_id").primaryKey(),
  },
  (table) => [index("support_chats_slack_thread").on(table.slackThreadTs)]
);

// Which line of whose chat each Slack message is (a line's, or the notice
// said for a reaction Slack has no name for), for what Pochical's people
// do there: Slack's reactions and deletions name only the message.
export const supportSlack = sqliteTable(
  "support_slack",
  {
    seq: integer().notNull(),
    ts: text().notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ts, table.seq] })]
);
