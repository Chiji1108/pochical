import Foundation
import SQLiteData

/// Everything the device holds of the user, gone as their account is: the
/// database's rows, its outbox too, whose they were with them, the photos
/// kept for the chats, and who the device was signed in as. The device's
/// own settings stay.
public enum LocalData {
  /// The tables the device keeps whoever it is signed in as: none of the
  /// user's own but GRDB's record of the migrations run. Every other table
  /// is the user's and goes, so a table added is erased unless it is named
  /// here (AccountTests pins the lists).
  static let deviceTables: Set<String> = ["grdb_migrations"]

  /// The user's tables, as the database has them now.
  static func userTables(in db: Database) throws -> [String] {
    try String.fetchAll(
      db,
      sql: #"SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' AND "name" NOT LIKE 'sqlite\_%' ESCAPE '\' ORDER BY "name""#
    )
    .filter { !deviceTables.contains($0) }
  }

  /// Every row of the user's, the record of whose they were among them,
  /// so the database is no one's until the next user claims it
  /// (`SyncState.claim`).
  static func erase(in db: Database) throws {
    for table in try userTables(in: db) {
      try db.execute(sql: "DELETE FROM \"\(table)\"")
    }
  }

  /// The chats' photos and links' pictures kept on the device, the
  /// linked account the app shows, and what the system's URL cache kept
  /// of the server's answers.
  static func eraseFiles() {
    ChatPhotos.eraseAll()
    LinkedAccount.keep(nil)
    URLCache.shared.removeAllCachedResponses()
  }
}
