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
