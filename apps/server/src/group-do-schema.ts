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
  displayName: text("display_name").notNull(),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  // Set once they leave: the row stays, at the cursor of their leaving, so
  // a device catching up hears of it; their values go.
  leftAt: integer("left_at", { mode: "timestamp_ms" }),
  userId: text("user_id").primaryKey(),
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
