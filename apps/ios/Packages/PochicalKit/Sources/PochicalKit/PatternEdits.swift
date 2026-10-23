import Foundation
import PochicalProto
import SQLiteData

// The person's own patterns as 設定 › シフトパターン changes them
// (spec/shift-patterns.md): each pattern a whole value, and their order
// one more, every change an edit through the outbox like a day's.

/// An edit of a pattern the rules refuse, for the page to say why.
public enum PatternRefusal: Error, Equatable {
  /// A repeating order in use or to come puts it on days: it can be
  /// neither archived nor deleted until that order changes.
  case repeating
}

extension OwnValues {
  /// Keeps `pattern` as it is now, a new one at the end of the order.
  /// Archiving one a repeating order still has is refused.
  public static func save(_ pattern: Pattern, now: Int64, in db: Database) throws {
    let saved = try PatternRow.find(pattern.id).fetchOne(db)
    let isNew = saved == nil
    if pattern.archived,
      refusesArchiving(
        pattern.id, archived: saved?.archived == true, orders: try repeatOrders(in: db))
    {
      throw PatternRefusal.repeating
    }
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
  /// One a repeating order still has is refused.
  public static func deletePattern(_ id: PatternID, now: Int64, in db: Database) throws {
    if try isRepeating(id, in: db) {
      throw PatternRefusal.repeating
    }
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

  /// Whether a repeating order in use or to come puts the pattern on days,
  /// in its sequence or on holidays: it cannot be deleted until that order
  /// changes. One only in periods over can.
  public static func isRepeating(_ id: PatternID, today: Day = .today, in db: Database) throws
    -> Bool
  {
    repeats(id, in: try repeatOrders(in: db), today: today)
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

/// Whether one of `orders`, in their order, in use or to come puts the
/// pattern on days.
public func repeats(_ id: PatternID, in orders: [RepeatOrder], today: Day = .today) -> Bool {
  // A period in use or to come still needs it; one over does not.
  orders.indices.contains { index in
    let order = orders[index]
    let over = index + 1 < orders.count && orders[index + 1].start <= today
    return !over
      && (order.sequence.contains(id) || (order.holidaysOff && order.holidayShift == id))
  }
}

/// Whether archiving the pattern, saved as `archived`, is refused: one in
/// use stays so while one of `orders` repeats it. Bringing one back into
/// use never is.
public func refusesArchiving(
  _ id: PatternID, archived: Bool, orders: [RepeatOrder], today: Day = .today
) -> Bool {
  !archived && repeats(id, in: orders, today: today)
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
    pattern.archived = archived
    return pattern
  }
}
