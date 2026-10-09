import Foundation
import SQLite3
import SQLiteData

/// The App Group the app and its widgets share, as both targets'
/// entitlements name it.
public let appGroup = "group.app.pochical"

/// The device's database: what it holds of the user's own values and of
/// their groups, and its outbox (spec/sync-protocol.md). It lives in the
/// App Group's container so the widgets can read it; only the app writes.
///
/// The app posts `Database.suspendNotification` when it goes to the
/// background and `Database.resumeNotification` when it comes back, so it
/// lets go of its locks before iOS suspends it.
public func appDatabase() throws -> any DatabaseWriter {
  @Dependency(\.context) var context
  var configuration = Configuration()
  configuration.foreignKeysEnabled = true
  // iOS ends an app suspended while holding a lock on a file in a shared
  // container (0xDEAD10CC).
  configuration.observesSuspensionNotifications = true
  configuration.prepareDatabase { db in
    // Keep the -wal and -shm files once the app closes the database, as
    // the widgets' read-only connections cannot open it without them.
    guard !db.configuration.readonly else { return }
    var persist: CInt = 1
    let code = sqlite3_file_control(db.sqliteConnection, nil, SQLITE_FCNTL_PERSIST_WAL, &persist)
    guard code == SQLITE_OK else {
      throw DatabaseError(resultCode: .init(rawValue: code))
    }
  }
  // Tests and previews get a database of their own, in a temporary file.
  guard context == .live else {
    let database = try defaultDatabase(configuration: configuration)
    try migrator.migrate(database)
    return database
  }
  return try coordinated(at: sharedDatabaseURL()) { url in
    let database = try defaultDatabase(path: url.path(), configuration: configuration)
    try migrator.migrate(database)
    return database
  }
}

/// Where the database lives in the App Group's container.
func sharedDatabaseURL() throws -> URL {
  guard
    let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroup)
  else {
    throw MissingAppGroup()
  }
  return container.appending(path: "Pochical.sqlite")
}

struct MissingAppGroup: Error {}

/// Opens and sets up the database while no other process is opening it,
/// so a widget never reads one half set up.
private func coordinated(
  at url: URL, open: (URL) throws -> any DatabaseWriter
) throws -> any DatabaseWriter {
  var coordinatorError: NSError?
  var result: Result<any DatabaseWriter, any Error>?
  NSFileCoordinator(filePresenter: nil).coordinate(
    writingItemAt: url, options: .forMerging, error: &coordinatorError
  ) { url in
    result = Result { try open(url) }
  }
  if let coordinatorError {
    throw coordinatorError
  }
  return try result!.get()
}

/// The tables, each step once.
var migrator: DatabaseMigrator {
  var migrator = DatabaseMigrator()
  #if DEBUG
    // Nothing is released yet, so a changed table starts a debug build's
    // database afresh rather than needing a migration of its own.
    migrator.eraseDatabaseOnSchemaChange = true
  #endif
  migrator.registerOwnValues()
  migrator.registerGroups()
  migrator.registerGroupValues()
  migrator.registerChats()
  migrator.registerBlocks()
  migrator.registerChatNotifications()
  migrator.registerChatReplies()
  migrator.registerProfile()
  return migrator
}
