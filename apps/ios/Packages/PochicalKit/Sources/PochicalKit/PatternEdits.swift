import Foundation
import PochicalProto
import SQLiteData

// The person's own patterns as 設定 › シフトパターン changes them
// (spec/shift-patterns.md): each pattern a whole value, and their order
// one more, every change an edit through the outbox like a day's.

extension OwnValues {
  /// Keeps `pattern` as it is now, a new one at the end of the order.
  public static func save(_ pattern: Pattern, now: Int64, in db: Database) throws {
    let isNew = try PatternRow.find(pattern.id).fetchOne(db) == nil
    var value = Pochical_V1_PatternValue()
    value.id = pattern.id
    value.pattern = pattern.wire
    value.hlc = try nextClock(now: now, in: db)
    var change = Pochical_V1_Change()
    change.pattern = value
    try edit(change, opID: UUID().uuidString.lowercased(), in: db)
    if isNew {
      try order(try patterns(in: db).map(\.id).filter { $0 != pattern.id } + [pattern.id],
        now: now, in: db)
    }
  }

  /// Deletes a pattern (spec/shift-patterns.md, Deleting a pattern): it
  /// goes from the list and its order, and nothing that names it changes.
  public static func deletePattern(_ id: PatternID, now: Int64, in db: Database) throws {
    var value = Pochical_V1_PatternValue()
    value.id = id
    value.hlc = try nextClock(now: now, in: db)
    var change = Pochical_V1_Change()
    change.pattern = value
    try edit(change, opID: UUID().uuidString.lowercased(), in: db)
    try order(try patterns(in: db).map(\.id).filter { $0 != id }, now: now, in: db)
  }

  /// Puts the patterns in this order, ポチポチ入力's buttons with them.
  public static func order(_ ids: [PatternID], now: Int64, in db: Database) throws {
    var order = Pochical_V1_PatternOrder()
    order.ids = ids
    order.hlc = try nextClock(now: now, in: db)
    var change = Pochical_V1_Change()
    change.patternOrder = order
    try edit(change, opID: UUID().uuidString.lowercased(), in: db)
  }

  /// Whether the repeating order in use puts the pattern on days, in its
  /// sequence or on holidays: it cannot be deleted until the order changes.
  public static func isRepeating(_ id: PatternID, in db: Database) throws -> Bool {
    guard let current = try repeatOrders(in: db).last else { return false }
    return current.sequence.contains(id) || (current.holidaysOff && current.holidayShift == id)
  }

  /// How many days show the pattern, of their own or from an order: from
  /// the first day either reaches through the last own day or the latest
  /// order's start, past which only own days could show one the order in
  /// use does not repeat.
  public static func daysShowing(_ id: PatternID, in db: Database) throws -> Int {
    let days = try DayRow.fetchAll(db)
    let orders = try RepeatOrderRow.fetchAll(db)
    let edges = days.compactMap { Day($0.date) } + orders.compactMap { Day($0.start) }
    guard let first = edges.min(), let last = edges.max() else { return 0 }
    let calendar = OwnCalendar(
      days: days, patterns: try PatternRow.fetchAll(db),
      patternOrder: try PatternOrderRow.fetchAll(db), orders: orders)
    return calendar.shown(from: first, through: last).values.count { $0.shift == id }
  }
}

extension Pattern {
  /// The pattern as the wire carries it.
  var wire: Pochical_V1_Pattern {
    var pattern = Pochical_V1_Pattern()
    pattern.name = name
    pattern.emoji = emoji
    pattern.symbol = symbol
    pattern.icon = icon
    pattern.color = UInt32(color)
    if let time {
      pattern.start = time.start
      pattern.end = time.end
    }
    pattern.countsAsOff = countsAsOff
    if let nextDay {
      pattern.nextDay = nextDay
    }
    return pattern
  }
}
