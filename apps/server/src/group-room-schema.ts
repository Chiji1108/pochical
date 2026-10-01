// The tables in each Group DO's own SQLite. Change them here and run
// `mise run group-room:generate`; never edit src/group-room-migrations by
// hand. Every Group DO applies the migrations as it starts.
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
