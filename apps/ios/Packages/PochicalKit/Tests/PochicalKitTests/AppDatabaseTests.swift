import CryptoKit
import Foundation
import SQLite3
import SQLiteData
import Testing

@testable import PochicalKit

@Test func keepsTheWALFilesForTheWidgets() throws {
  let database = try appDatabase()
  let persist = try database.write { db in
    var persist: CInt = -1
    sqlite3_file_control(db.sqliteConnection, nil, SQLITE_FCNTL_PERSIST_WAL, &persist)
    return persist
  }
  #expect(persist == 1)
}

/// A database a later app left, with a column this one does not know, as
/// one of any shape other than the steps': its rows stay.
@Test func aStoredDatabaseIsMigratedNeverErased() throws {
  let path = FileManager.default.temporaryDirectory.appending(path: "\(UUID()).sqlite").path()
  defer { try? FileManager.default.removeItem(atPath: path) }
  do {
    let database = try DatabaseQueue(path: path)
    try migrator.migrate(database)
    try database.write { db in
      try db.execute(sql: #"INSERT INTO "days" ("date") VALUES ('2026-11-13')"#)
      try db.execute(sql: #"ALTER TABLE "days" ADD COLUMN "later" TEXT"#)
    }
  }
  let database = try DatabaseQueue(path: path)
  try migrator.migrate(database)
  let kept = try database.read { db in
    try String.fetchAll(db, sql: #"SELECT "date" FROM "days" WHERE "later" IS NULL"#)
  }
  #expect(kept == ["2026-11-13"])
}

/// The baseline's tables are as the first release made them: a step's
/// body is never edited, as a device that ran it never runs it again. A
/// table changes shape in a new step after the last (`migrator`).
@Test func theBaselineIsAsFirstReleased() throws {
  let database = try DatabaseQueue()
  try migrator.migrate(database, upTo: baselineEnd)
  let schema = try database.read { db in
    try String.fetchAll(
      db,
      sql: """
        SELECT "sql" FROM "sqlite_master"
        WHERE "sql" IS NOT NULL AND "name" NOT LIKE 'grdb_%' ORDER BY "name"
        """)
  }
  let words = schema.joined(separator: "\n").split(whereSeparator: \.isWhitespace).joined(separator: " ")
  let hash = SHA256.hash(data: Data(words.utf8)).map { String(format: "%02x", $0) }.joined()
  #expect(hash == "0d88140cbb3bf05576b87f604398e1526b77df7e909f9aa914884925b5c1ea28")
}
