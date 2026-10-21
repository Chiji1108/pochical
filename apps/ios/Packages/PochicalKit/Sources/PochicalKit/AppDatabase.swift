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
  return try coordinated(writing: true, at: sharedDatabaseURL()) { url in
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

/// Runs `body` on the database's file while no other process writes it:
/// the app opens and sets the database up writing, and a widget reads
/// it, so a widget never reads one half set up or half erased.
func coordinated<T>(
  writing: Bool, at url: URL, _ body: (URL) throws -> T
) throws -> T {
  var coordinatorError: NSError?
  var result: Result<T, any Error>?
  let coordinator = NSFileCoordinator(filePresenter: nil)
  if writing {
    coordinator.coordinate(
      writingItemAt: url, options: .forMerging, error: &coordinatorError
    ) { url in
      result = Result { try body(url) }
    }
  } else {
    coordinator.coordinate(
      readingItemAt: url, options: [], error: &coordinatorError
    ) { url in
      result = Result { try body(url) }
    }
  }
  if let coordinatorError {
    throw coordinatorError
  }
  return try result!.get()
}

/// The tables, one step a group of them. Nothing is released yet, so a
/// table changes where it is created: any change to the tables erases the
/// device's database in every build, and it syncs again from the server.
var migrator: DatabaseMigrator {
  var migrator = DatabaseMigrator()
  migrator.eraseDatabaseOnSchemaChange = true
  migrator.registerOwnValues()
  migrator.registerGroups()
  migrator.registerGroupValues()
  migrator.registerChats()
  migrator.registerBlocks()
  migrator.registerChatNotifications()
  migrator.registerProfile()
  migrator.registerPreferences()
  migrator.registerChatDrafts()
  return migrator
}
