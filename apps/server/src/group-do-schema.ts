// The tables in each Group DO's own SQLite. Change them here and run
// `mise run group-do:generate`; never edit src/group-do-migrations by
// hand. Every Group DO applies the migrations as it starts.
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// What the group shows of itself to members and to invite links: one row,
// at the cursor it got when it last changed.
export const profile = sqliteTable(
  "profile",
  {
    cursor: integer().notNull().default(0),
    // Set when the group's mark is an emoji.
    emoji: text(),
    id: integer().primaryKey(),
    name: text().notNull(),
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
// member's User DO keeps a copy of their own groups for checking sockets.
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
  // A name of their own for this group (このグループだけ), or none.
  ownName: text("own_name"),
  // A photo of their own for this group, one of its photos; empty for none
  // on purpose, or not set to follow their usual one.
  ownPhoto: text("own_photo"),
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
// written (created_cursor) and last changed (cursor). Unsent lines keep
// their row without words, so a quote of one says it was taken back.
export const chatLines = sqliteTable(
  "chat_lines",
  {
    authorId: text("author_id").notNull(),
    createdCursor: integer("created_cursor").notNull(),
    cursor: integer().notNull(),
    // The days a line of shared days shares, as a JSON array of
    // YYYY-MM-DD; none for words, and once unsent.
    days: text({ mode: "json" }).$type<string[]>(),
    // The day a poll was settled on, while settled.
    decided: text(),
    edited: integer({ mode: "boolean" }).notNull().default(false),
    // In a one-to-one chat, the member who had blocked its writer when it
    // was sent: never delivered to them.
    hiddenFrom: text("hidden_from"),
    // The sending edit's op_id: a send taken twice is one line.
    opId: text("op_id").notNull(),
    // The photo sent as the line, as pochical.v1.ChatPhoto's fields;
    // none for words or days, and once unsent.
    photo: text({ mode: "json" }).$type<{
      id: string;
      height: number;
      width: number;
    }>(),
    // The cursor it was last pinned at, while pinned for everyone.
    pinnedAt: integer("pinned_at"),
    // Its days are put to the vote.
    poll: integer({ mode: "boolean" }).notNull().default(false),
    // Its first link's page, as pochical.v1.LinkPreview's fields; none
    // without one, and once unsent.
    preview: text({ mode: "json" }).$type<{
      imageHeight: number;
      imageId: string;
      imageWidth: number;
      site: string;
      title: string;
      url: string;
    }>(),
    // The line it answers (返信), by its seq in the same chat; none once
    // unsent.
    replyTo: integer("reply_to"),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
    seq: integer().notNull(),
    text: text().notNull(),
    threadId: text("thread_id").notNull(),
    unsent: integer({ mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.seq] }),
    uniqueIndex("chat_lines_cursor").on(table.cursor),
    uniqueIndex("chat_lines_op").on(table.opId),
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
    // When it was chosen, for the order: the group's cursor then.
    madeCursor: integer("made_cursor").notNull(),
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

// Photos members have uploaded to the group's chats (the Worker notes each
// as it stores it in R2), so a line can send only its uploader's own photo,
// and only once.
export const chatPhotos = sqliteTable("chat_photos", {
  id: text().primaryKey(),
  // Sent as a line already.
  sent: integer({ mode: "boolean" }).notNull().default(false),
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
