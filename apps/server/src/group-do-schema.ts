// The tables in each Group DO's own SQLite. Change them here and run
// `mise run group-do:generate`; never edit src/group-do-migrations by
// hand. Every Group DO applies the migrations as it starts.
import type { ChatPlaceKind } from "@pochical/design/chat";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { LineContent } from "./chat-content";

// What the group shows of itself to members and to invite links: one row,
// at the cursor it got when it last changed.
export const profile = sqliteTable(
  "profile",
  {
    // The color slot of an icon or letters mark.
    color: integer().notNull().default(0),
    cursor: integer().notNull().default(0),
    // Set when the group's mark is an emoji.
    emoji: text(),
    // Set when the group's mark is a mark icon, by its name.
    icon: text(),
    id: integer().primaryKey(),
    // What the place is (design/src/chat.ts, chatPlaces): a group, or a
    // user's chat with Pochical's people, kept the same way.
    kind: text().$type<ChatPlaceKind>().notNull().default("group"),
    // Set when the group's mark is letters.
    letter: text(),
    name: text().notNull(),
    // Set when the group's mark is a photo, one of the group's photos.
    photo: text(),
  },
  (table) => [check("profile_single_row", sql`${table.id} = 1`)]
);

// The newest cursor the group's log has given out: one row. Kept apart
// from the values, whose rows a member's leaving takes away, so the
// cursor never goes back and a device past it never misses what comes
// next (spec/sync-protocol.md, Change log and cursor).
export const logHead = sqliteTable(
  "log_head",
  {
    cursor: integer().notNull(),
    id: integer().primaryKey(),
  },
  (table) => [check("log_head_single_row", sql`${table.id} = 1`)]
);

// Who is in the group, as they appear in it, each at the cursor it got
// when it last changed. The Group DO is where membership is decided; each
// member's User DO keeps a copy of their own groups, told by
// membership_outbox, for listing them and keeping out ids not theirs.
export const members = sqliteTable("members", {
  cursor: integer().notNull().default(0),
  // Their account is deleted: left, with no name, their lines taken back.
  deleted: integer({ mode: "boolean" }).notNull().default(false),
  // As they appear: their own name for the group, else their usual one.
  displayName: text("display_name").notNull(),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  // Set once they leave: the row stays, at the cursor of their leaving, so
  // a device catching up hears of it; their values go.
  leftAt: integer("left_at", { mode: "timestamp_ms" }),
  // Their icons drawn filled (MarkLook.fill).
  markFill: integer("mark_fill", { mode: "boolean" }).notNull().default(true),
  // The shape they draw their marks in, as their User DO pushes it
  // (MarkLook.style); empty while they keep the app's default.
  markStyle: text("mark_style").notNull().default(""),
  // A name of their own for this group (このグループだけ), or none.
  ownName: text("own_name"),
  // A photo of their own for this group, one of its photos; empty for none
  // on purpose, or not set to follow their usual one.
  ownPhoto: text("own_photo"),
  // Who took them out (RemoveMember), set as they leave; none when they
  // left themselves.
  removedBy: text("removed_by"),
  userId: text("user_id").primaryKey(),
  // Their usual name, as their User DO pushes it (spec/sync-protocol.md,
  // Profile).
  usualName: text("usual_name").notNull().default(""),
  // Their usual photo, copied into the group's photos as their User DO
  // pushes it; empty for none.
  usualPhoto: text("usual_photo").notNull().default(""),
});

// Members' shared days as their User DOs push them (spec/sync-protocol.md,
// Group projection): the pattern and times of each day, never the memo,
// each a last-writer-wins value by its HLC, at the group's own cursor.
export const memberDays = sqliteTable(
  "member_days",
  {
    cursor: integer().notNull(),
    date: text().notNull(),
    field: integer().notNull(),
    hlcCounter: integer("hlc_counter").notNull(),
    hlcDevice: text("hlc_device").notNull(),
    hlcMs: integer("hlc_ms").notNull(),
    userId: text("user_id").notNull(),
    value: text(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.date, table.field] }),
    uniqueIndex("member_days_cursor").on(table.cursor),
  ]
);

// Members' patterns, so the group can draw their marks: each whole, as
// pochical.v1.Pattern's JSON, or none once deleted.
export const memberPatterns = sqliteTable(
  "member_patterns",
  {
    cursor: integer().notNull(),
    data: text(),
    hlcCounter: integer("hlc_counter").notNull(),
    hlcDevice: text("hlc_device").notNull(),
    hlcMs: integer("hlc_ms").notNull(),
    patternId: text("pattern_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.patternId] }),
    uniqueIndex("member_patterns_cursor").on(table.cursor),
  ]
);

// Members' repeating orders, so the group works their days out as their
// own devices do: each member's timeline as pochical.v1.RepeatOrders' JSON
// without its clock, one last-writer-wins value.
export const memberRepeatOrders = sqliteTable(
  "member_repeat_orders",
  {
    cursor: integer().notNull(),
    data: text().notNull(),
    hlcCounter: integer("hlc_counter").notNull(),
    hlcDevice: text("hlc_device").notNull(),
    hlcMs: integer("hlc_ms").notNull(),
    userId: text("user_id").primaryKey(),
  },
  (table) => [uniqueIndex("member_repeat_orders_cursor").on(table.cursor)]
);

// The lines of the group's chats (spec/sync-protocol.md, Chat): each at
// its place in its chat (seq, from 1) and at the cursor it got when it was
// written (created_cursor) and last changed (cursor). A line taken back
// keeps its row as one of the unsent kind, so a quote of it says so.
export const chatLines = sqliteTable(
  "chat_lines",
  {
    authorId: text("author_id").notNull(),
    // What the line is, one of its kinds (src/chat-content.ts).
    content: text({ mode: "json" }).$type<LineContent>().notNull(),
    createdCursor: integer("created_cursor").notNull(),
    cursor: integer().notNull(),
    // The app's version and the device it was sent from, kept where the
    // place's rules ask for it (chatPlaces' sendsDevice).
    device: text(),
    // In a one-to-one chat, the member who had blocked its writer when it
    // was sent: never delivered to them.
    hiddenFrom: text("hidden_from"),
    // The sending edit's op_id: a send taken twice is one line.
    opId: text("op_id").notNull(),
    // The cursor it was last pinned at, while pinned for everyone.
    pinnedAt: integer("pinned_at"),
    // The line it answers (返信), by its seq in the same chat.
    replyTo: integer("reply_to"),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
    seq: integer().notNull(),
    threadId: text("thread_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.seq] }),
    uniqueIndex("chat_lines_cursor").on(table.cursor),
    uniqueIndex("chat_lines_op").on(table.opId),
    // A chat's photos alone, paged without the lines between them.
    index("chat_lines_photos")
      .on(table.threadId, table.seq)
      .where(sql`${table.content} ->> '$.kind' = 'photos'`),
    // Each kind with what it holds; a notice or a line taken back answers
    // none and is pinned nowhere. Its columns are named bare, as drizzle-kit
    // names them by the table it makes in place of this one.
    check(
      "chat_lines_content",
      sql`coalesce(CASE content ->> '$.kind'
        WHEN 'words' THEN content ->> '$.text' <> ''
          AND json_type(content, '$.edited') IN ('true', 'false')
        WHEN 'photos' THEN json_array_length(content, '$.photos') > 0
        WHEN 'days' THEN json_array_length(content, '$.days') > 0
        WHEN 'poll' THEN json_array_length(content, '$.days') > 0
        WHEN 'notice' THEN json_type(content, '$.notice') = 'object'
          AND reply_to IS NULL AND pinned_at IS NULL
        WHEN 'unsent' THEN reply_to IS NULL AND pinned_at IS NULL
      END, 0)`
    ),
  ]
);

// How far each member has read each chat, a mark that only moves forward,
// at the cursor it last moved.
export const readMarks = sqliteTable(
  "read_marks",
  {
    cursor: integer().notNull(),
    lastReadSeq: integer("last_read_seq").notNull(),
    threadId: text("thread_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.threadId] }),
    uniqueIndex("read_marks_cursor").on(table.cursor),
  ]
);

// Who chose which emoji on which line, in the order chosen. A line's
// reactions change its cursor, as its words do, so they travel with it.
export const chatReactions = sqliteTable(
  "chat_reactions",
  {
    emoji: text().notNull(),
    // When they chose it, for the order among its choosers: the group's
    // cursor then.
    madeCursor: integer("made_cursor").notNull(),
    // When the emoji was first chosen on the line, for its place among the
    // line's emoji: the same on each of its rows and kept while anyone
    // holds it, so it stays put as its first chooser takes theirs back.
    placedCursor: integer("placed_cursor").notNull(),
    seq: integer().notNull(),
    threadId: text("thread_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.threadId, table.seq, table.userId, table.emoji],
    }),
  ]
);

// Who can come on which of a poll's days, in the order they said so.
export const chatVotes = sqliteTable(
  "chat_votes",
  {
    day: text().notNull(),
    // When they said so, for the order: the group's cursor then.
    madeCursor: integer("made_cursor").notNull(),
    seq: integer().notNull(),
    threadId: text("thread_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.threadId, table.seq, table.day, table.userId],
    }),
  ]
);

// The sends members took back (ChatRecall) before the group had their
// line, by op_id: should one come after all, as from a socket that died
// with it on the way, it is dropped. Kept for chatRules.unsentAfterMs
// from when it was taken, the longest a device sends a line by itself,
// far past any send still on its way; and while the member is in the
// group, whose sends are taken no more once they leave.
export const chatRecalls = sqliteTable(
  "chat_recalls",
  {
    opId: text("op_id").notNull(),
    // Those kept before the time was are past it already.
    takenAt: integer("taken_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`0`),
    userId: text("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.opId] })]
);

// Every photo the group keeps (groups/{groupId}/photos/{id} in R2), each
// noted before it is stored, so no id is ever stored twice: a photo never
// changes. Its row goes only once R2 has deleted it, so R2 never holds a
// photo the group has no note of. `state` says what holds it, and R2
// holds it in all but takenBack:
// - unsent: a member uploaded it to the group (PUT), and nothing carries
//   it yet. Only its uploader may upload it again, which stores nothing
//   but keeps it, or send it as a line, once. Once its uploader has
//   uploaded nothing to the group for chatRules.unsentAfterMs it goes
//   (GroupDO.sweepPhotos): a device uploads a line's photo again each
//   time it sends the line, so a send comes moments after that upload.
// - sent: a line carries it, until the line is taken back. Its uploader
//   uploading it again, as a send tried again does, stores nothing.
// - takingBack: its line was taken back (or no line carried it once sent,
//   spec/admin.md), and the sweep is deleting it from R2, then notes it
//   takenBack. Nothing may upload, send or show it.
// - takenBack: R2 has deleted it. Nothing holds it, but the note stays
//   for good, so no upload stores its id again and no line sends it:
//   devices keep a photo by its id.
// - shown: the group shows it, as someone's face (their usual photo, which
//   the server copies in, or one of the group's they uploaded and set as
//   their own) or as the group's mark (copied in). No upload touches it;
//   it goes once neither the mark nor anyone in the group names it, and a
//   copy nothing came to name goes as an unsent one does.
// - deleting: the sweep is deleting it from R2, its row going after: an
//   unsent one past its time, or one let go at once (its send recalled,
//   or shown and named no more). The sweep runs with nothing else let in;
//   after one storage refused, its uploader's upload of it is answered to
//   try again (503) and a send of it does not fit. A sweep cut
//   short leaves its rows so, and the next finishes them; a copy noted
//   again meanwhile is shown again, and copied in anew.
export const photoStates = [
  "unsent",
  "sent",
  "takingBack",
  "takenBack",
  "shown",
  "deleting",
] as const;

export const groupPhotos = sqliteTable("group_photos", {
  id: text().primaryKey(),
  state: text({ enum: photoStates }).notNull().default("unsent"),
  // While unsent, when its uploader last uploaded to the group: each
  // upload sets it on all of theirs not sent, so the photos of a frame
  // stay while the rest of the frame goes up. For a copy shown, when it
  // was last copied in.
  uploadedAt: integer("uploaded_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`0`),
  // Its uploader, or whose usual photo or mark it was copied in for.
  userId: text("user_id").notNull(),
});

// Who each member has blocked, as their User DO tells the group, so a
// one-to-one chat's line from someone blocked is not delivered.
export const memberBlocks = sqliteTable(
  "member_blocks",
  {
    blockedId: text("blocked_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.blockedId] })]
);

// How far a user's chat with Pochical's people has been told outside its
// Group DO (support:{userId}): to D1's index of every chat, and to the
// chat's Slack thread. One row, the cursor of the log told up to, as the
// User DO's pushed_cursor is for its groups. Only a support place has it.
// While telling fails, how many times in a row and since when, for how
// long the relay waits before it tries again and what the admin pages
// say; none once it is told.
export const supportRelay = sqliteTable(
  "support_relay",
  {
    cursor: integer().notNull(),
    failingSince: integer("failing_since", { mode: "timestamp_ms" }),
    failures: integer().notNull().default(0),
    id: integer().primaryKey(),
    // The line being posted to Slack, since its first try, until its
    // message is kept: a retry looks for it in Slack before posting
    // again, and a line taken back before it was kept finds it there.
    postingSeq: integer("posting_seq"),
    postingSince: integer("posting_since", { mode: "timestamp_ms" }),
  },
  (table) => [check("support_relay_single_row", sql`${table.id} = 1`)]
);

// What the chat's Slack thread was told of each line: its message there,
// the user's reactions on it as told, any said in the thread for an emoji
// Slack has no name for (by emoji, the notice's message), and whether its
// taking back was told. A line written in Slack has its message from the
// start, so it is never posted again.
export const supportSlackLines = sqliteTable("support_slack_lines", {
  notices: text({ mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  seq: integer().primaryKey(),
  slackTs: text("slack_ts"),
  toldReactions: text("told_reactions", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  toldUnsent: integer("told_unsent", { mode: "boolean" })
    .notNull()
    .default(false),
});

// What each user's own DO is still to hear of their place in the group
// (spec/sync-protocol.md, Groups): the latest news of it, one row a user,
// written in the transaction that changed it and told by the alarm until
// their DO takes it. Their DO keeps only news newer than it has, by
// `cursor`, so news told twice or late changes nothing.
export const membershipOutbox = sqliteTable("membership_outbox", {
  // The group's head as it changed.
  cursor: integer().notNull(),
  // When to tell it next.
  dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
  // The tries in a row that failed, for how long the next waits.
  failures: integer().notNull().default(0),
  // In the group, with its name and mark as they are when told; else out.
  inGroup: integer("in_group", { mode: "boolean" }).notNull(),
  userId: text("user_id").primaryKey(),
});
