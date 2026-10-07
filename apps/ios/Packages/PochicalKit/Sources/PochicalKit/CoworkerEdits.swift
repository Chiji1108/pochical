import Foundation
import PochicalProto
import SQLiteData

// The person's 一緒に働く人 as 設定 changes them: each a name, kept whole,
// and their order one more value. Days name them by id, so a new name
// shows on every day they are on, and someone deleted is skipped there.

extension OwnValues {
  /// Gives someone a new name, on every day they are on too.
  public static func renameCoworker(_ id: String, to name: String, now: Int64, in db: Database)
    throws
  {
    var coworker = Pochical_V1_CoworkerValue()
    coworker.id = id
    coworker.name = name
    coworker.hlc = try nextClock(now: now, in: db)
    var change = Pochical_V1_Change()
    change.coworker = coworker
    try edit(change, opID: UUID().uuidString.lowercased(), in: db)
  }

  /// Deletes someone: gone from the list, and skipped on the days that
  /// name them.
  public static func deleteCoworker(_ id: String, now: Int64, in db: Database) throws {
    var coworker = Pochical_V1_CoworkerValue()
    coworker.id = id
    coworker.hlc = try nextClock(now: now, in: db)
    var change = Pochical_V1_Change()
    change.coworker = coworker
    try edit(change, opID: UUID().uuidString.lowercased(), in: db)
    try orderCoworkers(try coworkers(in: db).map(\.id).filter { $0 != id }, now: now, in: db)
  }

  /// Lists the coworkers in this order, as a day's details do.
  public static func orderCoworkers(_ ids: [String], now: Int64, in db: Database) throws {
    var order = Pochical_V1_CoworkerOrder()
    order.ids = ids
    order.hlc = try nextClock(now: now, in: db)
    var change = Pochical_V1_Change()
    change.coworkerOrder = order
    try edit(change, opID: UUID().uuidString.lowercased(), in: db)
  }

  /// How many days note someone.
  public static func daysWithCoworker(_ id: String, in db: Database) throws -> Int {
    try DayRow.where { $0.people.isNot(nil) }.fetchAll(db).count { row in
      (row.people ?? "").split(separator: " ").contains { $0 == id }
    }
  }
}
