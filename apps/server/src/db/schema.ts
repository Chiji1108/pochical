// The D1 database's tables. Change them here and run `mise run db:generate`
// for the migration; never edit the files in migrations/ by hand.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

// Each user's chat with Pochical's people (proto/pochical/v1/support.proto):
// its lines, in D1 rather than the User DO so Pochical's people can see
// every user's in one place.
export const supportMessages = sqliteTable(
  "support_messages",
  {
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    // The app's version and the device a user's line came from.
    device: text(),
    // Written by Pochical's people, not the user.
    fromSupport: integer("from_support", { mode: "boolean" }).notNull(),
    // The app's own id for a user's line, so a send tried again is kept
    // once.
    id: text().primaryKey(),
    text: text().notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [index("support_messages_user").on(table.userId, table.createdAt)]
);

// Where each user's chat stands: its latest line, and when the user last
// read Pochical's people's answers.
export const supportChats = sqliteTable("support_chats", {
  lastAt: integer("last_at", { mode: "timestamp_ms" }).notNull(),
  userId: text("user_id").primaryKey(),
  userReadAt: integer("user_read_at", { mode: "timestamp_ms" }),
});
