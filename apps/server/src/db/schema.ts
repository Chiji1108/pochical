// The D1 database's tables. Change them here and run `mise run db:generate`
// for the migration; never edit the files in migrations/ by hand.
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import { session } from "./auth-schema";

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
// be looked at. Nobody in the group is told. A report goes, with its post
// in Slack, a year after the account of whoever made it or is reported
// was deleted (report-retention.ts).
export const reports = sqliteTable(
  "reports",
  {
    // A line's reported, the few lines around it as they were, as JSON
    // ({ seq, authorId, text }[]); a member's, their name in the group.
    context: text().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    groupId: text("group_id").notNull(),
    // When Pochical's people last set its state, and who (their address on
    // Cloudflare Access); none while it waits (spec/admin.md, 通報).
    handledAt: integer("handled_at", { mode: "timestamp_ms" }),
    handledBy: text("handled_by"),
    id: text().primaryKey(),
    // What Pochical's people noted of it.
    note: text().notNull().default(""),
    // spam, harassment, explicit, impersonation or other.
    reason: text().notNull(),
    reporterId: text("reporter_id").notNull(),
    // The line reported, when it is one: its place in its chat.
    seq: integer(),
    // Whether it was to be posted in Pochical's people's Slack channel, as
    // it is when Slack is set up, noted with the report before the post is
    // tried: a message of it may then be in Slack, which goes with it
    // (slack.ts, eraseReportPost). A row that does not say counts as
    // tried, the side on which its message is looked for.
    slackTried: integer("slack_tried", { mode: "boolean" })
      .notNull()
      .default(true),
    // That message, once Slack said which it is: none until then, so one
    // whose answer was lost is found by its metadata instead.
    slackTs: text("slack_ts"),
    // open while it waits for Pochical's people; acted once they acted on
    // it, dismissed once they found nothing to act on.
    status: text().notNull().default("open"),
    // Who is reported: the member, or the line's writer.
    targetId: text("target_id").notNull(),
    // The line reported's chat, when it is one.
    threadId: text("thread_id"),
  },
  (table) => [index("reports_status").on(table.status, table.createdAt)]
);

// The accounts deleted whose reports, made by or about them, are still
// kept (spec/sync-protocol.md, Deleting an account): when each was
// deleted, for those reports to go a year after, and it with them.
export const deletedAccounts = sqliteTable("deleted_accounts", {
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }).notNull(),
  userId: text("user_id").primaryKey(),
});

// The Slack threads of deleted accounts' chats with Pochical's people whose
// app posts may still be there (spec/sync-protocol.md, Deleting an
// account): noted as the chat goes, and kept, for the daily cron to try
// again, until a try a day or more after the note finds none left. No
// user is named: the thread is all that is needed to find them.
export const erasingSlackThreads = sqliteTable("erasing_slack_threads", {
  notedAt: integer("noted_at", { mode: "timestamp_ms" }).notNull(),
  threadTs: text("thread_ts").primaryKey(),
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

// The devices' push tokens (spec/sync-protocol.md, Push), each kept with
// the session it was registered under. A token is one row, so a device is
// one session's, and one user's, at a time: registered under another
// session, it moves there. A session's tokens go with its row as it ends
// or its user is deleted, in the same database, so no call that failed
// can leave one behind.
export const pushTokens = sqliteTable(
  "push_tokens",
  {
    // From a development build: through APNs' sandbox.
    sandbox: integer({ mode: "boolean" }).notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    token: text().primaryKey(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("push_tokens_session").on(table.sessionId)]
);

// What Pochical's people did on the admin site, the latest kept for good,
// but a report's notes, which go with the report (report-retention.ts):
// who (their address on Cloudflare Access), when, what, and to whom
// (spec/admin.md, 記録).
export const adminActions = sqliteTable(
  "admin_actions",
  {
    // answer, report, cleanBucket or reset.
    action: text().notNull(),
    at: integer({ mode: "timestamp_ms" }).notNull(),
    by: text().notNull(),
    // What was done, in Pochical's people's words: the answer's start, the
    // report's new state and note, what was deleted.
    detail: text().notNull().default(""),
    id: text().primaryKey(),
    // Whom or what it was done to: a user, a report; empty for the bucket.
    target: text().notNull().default(""),
  },
  (table) => [index("admin_actions_at").on(table.at)]
);
