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

// The groups the user is in, so their sockets can be let in without
// waking a Group DO for an id that is not theirs, and their devices list
// them with the group's name and mark as last heard. Written as they make
// or join a group, as it is renamed, and as they leave.
// Cursors are shared with day_fields.
export const memberships = sqliteTable("memberships", {
  cursor: integer().notNull().default(0),
  // Set when the group's mark is an emoji.
  emoji: text(),
  groupId: text("group_id").primaryKey(),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  // Set once the user leaves: the row stays, at the cursor of their
  // leaving, so their devices catching up hear of it.
  leftAt: integer("left_at", { mode: "timestamp_ms" }),
  name: text().notNull().default(""),
  // How far this user's shared values have reached the group: the cursor
  // up to which they were pushed and taken (spec/sync-protocol.md, Group
  // projection). Everything after it is still to go.
  pushedCursor: integer("pushed_cursor").notNull().default(0),
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
    threadId: text("thread_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.threadId] }),
    uniqueIndex("unread_counts_cursor").on(table.cursor),
  ]
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

// The user's devices' push tokens (spec/sync-protocol.md, Push), each
// sent each launch; one APNs says is gone is dropped.
export const pushTokens = sqliteTable("push_tokens", {
  // From a development build: through APNs' sandbox.
  sandbox: integer({ mode: "boolean" }).notNull(),
  token: text().primaryKey(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
