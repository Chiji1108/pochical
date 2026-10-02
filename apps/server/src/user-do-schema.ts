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
// waking a Group DO for an id that is not theirs. Written as they make or
// join a group, and later as they leave (leaving is not built yet).
export const memberships = sqliteTable("memberships", {
  groupId: text("group_id").primaryKey(),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  // How far this user's shared values have reached the group: the cursor
  // up to which they were pushed and taken (spec/sync-protocol.md, Group
  // projection). Everything after it is still to go.
  pushedCursor: integer("pushed_cursor").notNull().default(0),
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
