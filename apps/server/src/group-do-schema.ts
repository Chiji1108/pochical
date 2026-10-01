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

// What the group shows of itself to members and to invite links: one row.
export const profile = sqliteTable(
  "profile",
  {
    // Set when the group's mark is an emoji.
    emoji: text(),
    id: integer().primaryKey(),
    name: text().notNull(),
  },
  (table) => [check("profile_single_row", sql`${table.id} = 1`)]
);

// Who is in the group, as they appear in it. The Group DO is where
// membership is decided; each member's User DO keeps a copy of their own
// groups for checking sockets.
export const members = sqliteTable("members", {
  displayName: text("display_name").notNull(),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
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
