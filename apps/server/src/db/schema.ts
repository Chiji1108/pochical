// The D1 database's tables. Change them here and run `mise run db:generate`
// for the migration; never edit the files in migrations/ by hand.
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// Which group each live invite code opens. The Group DO owns the group
// itself; this index exists because a link carries only the code. A group
// has one live code: remaking the link replaces its row, so the old code
// stops working at once.
export const invites = sqliteTable("invites", {
  code: text().primaryKey(),
  groupId: text("group_id").notNull().unique(),
});
