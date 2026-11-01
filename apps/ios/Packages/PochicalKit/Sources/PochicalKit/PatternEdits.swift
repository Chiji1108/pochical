import Foundation
import PochicalDesign
import PochicalProto
import SQLiteData
import SwiftUI

// The person's own patterns as 設定 › シフトパターン changes them
// (spec/shift-patterns.md): each pattern a whole value, and their order
// one more, every change an edit through the outbox like a day's.

/// An edit of a pattern the rules refuse, for the page to say why.
public enum PatternRefusal: Error, Equatable {
  /// A repeating order in use or to come puts it on days: it can be
  /// neither archived nor deleted until that order changes.
  case repeating
  /// It holds what the server would refuse (`fitsPattern`), so it would
  /// not stay once sent.
  case unfit
}

/// The mark palette's slots, the same in every テーマ.
public let markSlots = Theme.pochical.colors(.light).marks.count

/// Whether `pattern` holds only what the server takes for one under `id`,
/// so it stays once sent (apps/server/src/pattern-values.ts;
/// spec/vectors/patterns.json, fits): a name, an emoji, a letter and an
/// icon for each look, a color of the palette, both times or neither as
/// HH:MM, and a next day that is another pattern.
public func fitsPattern(_ pattern: Pochical_V1_Pattern, id: PatternID) -> Bool {
  let timed = pattern.hasStart || pattern.hasEnd
  return fitsText(pattern.name, limit: TextLimits.shiftName)
    && isEmoji(pattern.emoji)
    && fitsText(pattern.symbol, limit: TextLimits.shiftMark)
    && isID(pattern.icon)
    && Int(pattern.color) < markSlots
    && (!timed || (pattern.hasStart && pattern.hasEnd))
    && (!pattern.hasStart || isClockTime(pattern.start))
    && (!pattern.hasEnd || isClockTime(pattern.end))
    && (!pattern.hasNextDay || (isID(pattern.nextDay) && pattern.nextDay != id))
}

/// Whether the text can be an id or an icon's name: 1 to
/// `SyncLimits.idLength` UTF-16 units, as the server counts them, with no
/// spaces.
func isID(_ text: String) -> Bool {
  !text.isEmpty && text.utf16.count <= SyncLimits.idLength
    && !text.contains(where: \.isWhitespace)
}

/// Whether the text is a time of day as "HH:MM", 00:00 to 23:59.
private func isClockTime(_ text: String) -> Bool {
  text.wholeMatch(of: /(?:[01][0-9]|2[0-3]):[0-5][0-9]/) != nil
}

extension Pattern {
  /// Whether the server takes it as it is (`fitsPattern`).
  public var fits: Bool { fitsPattern(wire, id: id) }
}

extension OwnValues {
  /// Keeps `pattern` as it is now, a new one at the end of the order.
  /// One the server would refuse, or archiving one a repeating order still
  /// has, is refused, and nothing is written.
  public static func save(_ pattern: Pattern, now: Int64, in db: Database) throws {
    guard pattern.fits else {
      throw PatternRefusal.unfit
    }
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
    let calendar = try OwnCalendar(db)
    let edges = Array(calendar.own.keys) + calendar.orders.map(\.start)
    guard let first = edges.min(), let last = edges.max() else { return 0 }
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
