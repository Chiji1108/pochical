// The tables in each User DO's own SQLite. Change them here and run
// `mise run user-do:generate`; never edit src/user-do-migrations by hand.
// Every User DO applies the migrations as it starts.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The groups the user is in, so their sockets can be let in without
// waking a Group DO for an id that is not theirs. Written as they join or
// leave (joining is not built yet).
export const memberships = sqliteTable("memberships", {
  groupId: text("group_id").primaryKey(),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
});
