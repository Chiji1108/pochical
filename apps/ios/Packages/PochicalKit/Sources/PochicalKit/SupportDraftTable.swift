import SQLiteData

// The chat with Pochical's people kept its draft in a table of its own
// before it was a chat of its own place, whose drafts are kept as every
// chat's are (ChatDrafts). Its migration stays, so a device that ran it
// goes on, and the table goes.

extension DatabaseMigrator {
  mutating func registerSupportDraft() {
    registerMigration("Keep the draft to Pochical's people") { db in
      try #sql(
        """
        CREATE TABLE "supportDraft" (
          "text" TEXT NOT NULL,
          "replyTo" TEXT,
          "savedAtMs" INTEGER NOT NULL
        ) STRICT
        """
      )
      .execute(db)
    }
    registerMigration("Keep the draft to Pochical's people as every chat's") { db in
      try #sql(#"DROP TABLE "supportDraft""#).execute(db)
    }
  }
}
