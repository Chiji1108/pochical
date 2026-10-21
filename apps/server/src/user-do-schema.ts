// The tables in each User DO's own SQLite. Change them here and run
// `mise run user-do:generate`; never edit src/user-do-migrations by hand.
// Every User DO applies the migrations as it starts.
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// The groups the user is in, so an id that is not theirs never wakes a
// Group DO, and their devices list them with the group's name and mark as
// last heard. Written as the group tells of their joining, a new name or
// mark, and their leaving (takeMembership); the Group DO decides.
// Cursors are shared with day_fields.
export const memberships = sqliteTable("memberships", {
  // The color slot of an icon or letters mark.
  color: integer().notNull().default(0),
  cursor: integer().notNull().default(0),
  // Set when the group's mark is an emoji.
  emoji: text(),
  groupId: text("group_id").primaryKey(),
  // Set when the group's mark is a mark icon, by its name.
  icon: text(),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  // Set once the user leaves: the row stays, at the cursor of their
  // leaving, so their devices catching up hear of it.
  leftAt: integer("left_at", { mode: "timestamp_ms" }),
  // Set when the group's mark is letters.
  letter: text(),
  name: text().notNull().default(""),
  // Set when the group's mark is a photo, one of the group's photos.
  photo: text(),
  // How far this user's shared values have reached the group: the cursor
  // up to which they were pushed and taken (spec/sync-protocol.md, Group
  // projection). Everything after it is still to go.
  pushedCursor: integer("pushed_cursor").notNull().default(0),
});

// Every group the user asked to make or join, written before the group
// hears of them, so deleting the account reaches each one
// (spec/sync-protocol.md, Deleting an account); and the group's cursor of
// the latest news of their place in it taken here (membership_outbox in
// the Group DO), so news told twice or late changes nothing.
export const knownGroups = sqliteTable("known_groups", {
  groupId: text("group_id").primaryKey(),
  newsCursor: integer("news_cursor").notNull().default(0),
});

// The groups the user made, by the request id their app sent, so a
// CreateGroup repeated after a lost answer gives back the same group
// rather than a second one.
export const groupRequests = sqliteTable("group_requests", {
  groupId: text("group_id").notNull(),
  requestId: text("request_id").primaryKey(),
});

// The user's own days, a row for each field of each day as a
// last-writer-wins value (spec/sync-protocol.md, Shifts): the HLC that set
// it, and the cursor it got when it last changed. Kept once cleared, with
// no value, so an older edit cannot bring it back; and "every change after
// cursor N" is the rows past N.
export const dayFields = sqliteTable(
  "day_fields",
  {
    cursor: integer().notNull(),
    date: text().notNull(),
    // DayField's number in proto/pochical/v1/sync.proto.
    field: integer().notNull(),
    hlcCounter: integer("hlc_counter").notNull(),
    hlcDevice: text("hlc_device").notNull(),
    hlcMs: integer("hlc_ms").notNull(),
    value: text(),
  },
  (table) => [
    primaryKey({ columns: [table.date, table.field] }),
    uniqueIndex("day_fields_cursor").on(table.cursor),
  ]
);

// The user's patterns, each one last-writer-wins value: the pattern as
// pochical.v1.Pattern's JSON, or none once deleted (kept, so an older
// edit cannot bring it back). Cursors are shared with day_fields, so a
// device catches up on both in one order.
export const patterns = sqliteTable(
  "patterns",
  {
    cursor: integer().notNull(),
    data: text(),
    hlcCounter: integer("hlc_counter").notNull(),
    hlcDevice: text("hlc_device").notNull(),
    hlcMs: integer("hlc_ms").notNull(),
    id: text().primaryKey(),
  },
  (table) => [uniqueIndex("patterns_cursor").on(table.cursor)]
);

// The order the user's patterns are shown in: one row, one value.
export const patternOrder = sqliteTable(
  "pattern_order",
  {
    cursor: integer().notNull(),
    hlcCounter: integer("hlc_counter").notNull(),
    hlcDevice: text("hlc_device").notNull(),
    hlcMs: integer("hlc_ms").notNull(),
    id: integer().primaryKey(),
    // The pattern ids in order, as JSON.
    ids: text().notNull(),
  },
  (table) => [check("pattern_order_single_row", sql`${table.id} = 1`)]
);

// The user's repeating orders: one row, one value (spec/sync-protocol.md,
// Repeating orders), the timeline as pochical.v1.RepeatOrders' JSON
// without its clock. Cursors are shared with day_fields.
export const repeatOrders = sqliteTable(
  "repeat_orders",
  {
    cursor: integer().notNull(),
    data: text().notNull(),
    hlcCounter: integer("hlc_counter").notNull(),
    hlcDevice: text("hlc_device").notNull(),
    hlcMs: integer("hlc_ms").notNull(),
    id: integer().primaryKey(),
  },
  (table) => [check("repeat_orders_single_row", sql`${table.id} = 1`)]
);

// The user's coworkers, each one last-writer-wins value: a name, or none
// once deleted (kept, so an older edit cannot bring it back).
export const coworkers = sqliteTable(
  "coworkers",
  {
    cursor: integer().notNull(),
    hlcCounter: integer("hlc_counter").notNull(),
    hlcDevice: text("hlc_device").notNull(),
    hlcMs: integer("hlc_ms").notNull(),
    id: text().primaryKey(),
    name: text(),
  },
  (table) => [uniqueIndex("coworkers_cursor").on(table.cursor)]
);

// The order the user's coworkers are listed in: one row, one value.
export const coworkerOrder = sqliteTable(
  "coworker_order",
  {
    cursor: integer().notNull(),
    hlcCounter: integer("hlc_counter").notNull(),
    hlcDevice: text("hlc_device").notNull(),
    hlcMs: integer("hlc_ms").notNull(),
    id: integer().primaryKey(),
    // The coworker ids in order, as JSON.
    ids: text().notNull(),
  },
  (table) => [check("coworker_order_single_row", sql`${table.id} = 1`)]
);

// The user's preferences, each key one last-writer-wins value, as the
// apps write it: a value, or none once set back to the apps' own default
// (kept, so an older edit cannot bring it back).
export const preferences = sqliteTable(
  "preferences",
  {
    cursor: integer().notNull(),
    hlcCounter: integer("hlc_counter").notNull(),
    hlcDevice: text("hlc_device").notNull(),
    hlcMs: integer("hlc_ms").notNull(),
    key: text().primaryKey(),
    value: text(),
  },
  (table) => [uniqueIndex("preferences_cursor").on(table.cursor)]
);

// Where taken repeating orders cleared the user's days: from each
// clear_from, the clock of the orders that cleared it (the newest, when
// orders cleared from the same day twice). An edit of a pattern or time on
// a day from there with an older clock arrived late and is corrected
// (spec/sync-protocol.md, Repeating orders).
export const orderClears = sqliteTable("order_clears", {
  fromDate: text("from_date").primaryKey(),
  hlcCounter: integer("hlc_counter").notNull(),
  hlcDevice: text("hlc_device").notNull(),
  hlcMs: integer("hlc_ms").notNull(),
});

// How many lines of each chat in the user's groups they have not read, as
// the group last said, so their devices badge every group without a
// socket to each (spec/sync-protocol.md, Unread summary). Cursors are
// shared with day_fields.
export const unreadCounts = sqliteTable(
  "unread_counts",
  {
    count: integer().notNull(),
    cursor: integer().notNull(),
    // The group's own cursor the count was taken at: counts can arrive out
    // of order, and an older one changes nothing.
    groupCursor: integer("group_cursor").notNull(),
    groupId: text("group_id").notNull(),
    // How many of them mention the user: what counts in a chat turned off.
    mentions: integer().notNull().default(0),
    threadId: text("thread_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.threadId] }),
    uniqueIndex("unread_counts_cursor").on(table.cursor),
  ]
);

// The lines of each chat the user's devices were notified of and have not
// yet been told to take back, from the first to the last (spec/chat.md,
// Notifications): a read reaching them sends the devices a withdrawal.
// Only the server keeps them, so no cursor.
export const chatNotified = sqliteTable(
  "chat_notified",
  {
    firstSeq: integer("first_seq").notNull(),
    groupId: text("group_id").notNull(),
    lastSeq: integer("last_seq").notNull(),
    threadId: text("thread_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.threadId] })]
);

// Who the user has blocked (spec/chat.md, Reporting and blocking), one row
// a person, the latest; unblocking keeps the row, so devices catching up
// hear of it. Cursors are shared with day_fields.
export const blocks = sqliteTable(
  "blocks",
  {
    blocked: integer({ mode: "boolean" }).notNull(),
    cursor: integer().notNull(),
    userId: text("user_id").primaryKey(),
  },
  (table) => [uniqueIndex("blocks_cursor").on(table.cursor)]
);

// Chats whose notifications the user turned off (spec/chat.md,
// Notifications), one row a chat, the latest; turning one on again keeps
// the row, so devices catching up hear of it. Cursors are shared with
// day_fields.
export const chatMutes = sqliteTable(
  "chat_mutes",
  {
    cursor: integer().notNull(),
    groupId: text("group_id").notNull(),
    muted: integer({ mode: "boolean" }).notNull(),
    threadId: text("thread_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.threadId] }),
    uniqueIndex("chat_mutes_cursor").on(table.cursor),
  ]
);

// The user's chat notification settings for the account, one row once
// they set them; before, mentions notify in chats turned off.
export const chatSettings = sqliteTable(
  "chat_settings",
  {
    cursor: integer().notNull(),
    id: integer().primaryKey(),
    mentionsWhenMuted: integer("mentions_when_muted", {
      mode: "boolean",
    }).notNull(),
  },
  (table) => [
    check("chat_settings_one_row", sql`${table.id} = 1`),
    uniqueIndex("chat_settings_cursor").on(table.cursor),
  ]
);

// The user's usual name (いつもの名前) and photo, one row once they set
// them.
export const profile = sqliteTable(
  "profile",
  {
    cursor: integer().notNull(),
    id: integer().primaryKey(),
    // The user's icons drawn filled (MarkLook.fill).
    markFill: integer("mark_fill", { mode: "boolean" }).notNull().default(true),
    // The shape the user's marks are drawn in (MarkLook.style), which their
    // groups show; empty while they keep the app's default.
    markStyle: text("mark_style").notNull().default(""),
    name: text().notNull(),
    // The usual photo, one of the user's own photos; empty for none.
    photoId: text("photo_id").notNull().default(""),
  },
  (table) => [
    check("profile_one_row", sql`${table.id} = 1`),
    uniqueIndex("profile_cursor").on(table.cursor),
  ]
);

// The newest cursor the user's log has given out: one row. Kept apart
// from the values, some of whose rows leaving a group takes away, so the
// cursor never goes back and no two values share one
// (spec/sync-protocol.md, Change log and cursor).
export const logHead = sqliteTable(
  "log_head",
  {
    cursor: integer().notNull(),
    id: integer().primaryKey(),
  },
  (table) => [check("log_head_single_row", sql`${table.id} = 1`)]
);
