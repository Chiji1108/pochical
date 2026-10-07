import Foundation
import PochicalDesign
import PochicalProto
import SQLiteData

// 新しい仕事にする (spec/shift-patterns.md, Changing jobs): the new job's
// patterns take over the list, and its order starts on the day of the
// switch; a pattern still on a day before it stays, so those days keep
// their marks.

extension Pattern {
  /// A ready-made pattern as the person's copy, its next day kept only
  /// when that pattern is theirs.
  public init(_ ready: ReadyPattern, keeping ids: Set<PatternID>) {
    self.init(
      id: ready.id, name: ready.name, emoji: ready.emoji, symbol: ready.symbol, icon: ready.icon,
      color: ready.color, time: ready.time.map { ShiftTime(start: $0.start, end: $0.end) },
      countsAsOff: ready.countsAsOff,
      nextDay: ready.nextDay.flatMap { ids.contains($0) ? $0 : nil })
  }
}

extension OwnValues {
  /// Changes jobs on `start`: `incoming` take over the patterns, a
  /// pattern of the person's still on a day before it stays after them,
  /// and `sequence` repeats from `start` counted from `anchor`; an empty
  /// sequence ends repeating there.
  public static func changeJob(
    to incoming: [Pattern], sequence: [PatternID], start: Day, anchor: Day,
    holidayCountry: String, now: Int64, in db: Database
  ) throws {
    let own = try patterns(in: db)
    let before = try patternsShown(before: start, in: db)
    let changed = patternsForJob(
      own: own, incoming: incoming, sequence: sequence, usedBefore: { before.contains($0) },
      newID: { UUID().uuidString.lowercased() })
    let kept = Set(changed.patterns.map(\.id))
    for pattern in own where !kept.contains(pattern.id) {
      var value = Pochical_V1_PatternValue()
      value.id = pattern.id
      value.hlc = try nextClock(now: now, in: db)
      var change = Pochical_V1_Change()
      change.pattern = value
      try edit(change, opID: UUID().uuidString.lowercased(), in: db)
    }
    for pattern in changed.patterns where !own.contains(pattern) {
      var value = Pochical_V1_PatternValue()
      value.id = pattern.id
      value.pattern = pattern.wire
      value.hlc = try nextClock(now: now, in: db)
      var change = Pochical_V1_Change()
      change.pattern = value
      try edit(change, opID: UUID().uuidString.lowercased(), in: db)
    }
    try order(changed.patterns.map(\.id), now: now, in: db)

    let byID = Dictionary(
      changed.patterns.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    let offShift = holidayShift(of: changed.patterns)
    let holidaysOff =
      offShift != nil && holidaysOffByDefault(changed.sequence, start: anchor, patterns: byID)
    try self.start(
      RepeatOrder(
        sequence: changed.sequence, start: start, anchor: anchor, holidaysOff: holidaysOff,
        holidayShift: holidaysOff ? offShift : nil, holidayCountry: holidayCountry),
      now: now, in: db)
  }

  /// The patterns some day before `day` shows, of its own or from an
  /// order.
  private static func patternsShown(before day: Day, in db: Database) throws -> Set<PatternID> {
    let days = try DayRow.where { $0.date < day.key }.fetchAll(db)
    let orders = try RepeatOrderRow.fetchAll(db)
    let edges = days.compactMap { Day($0.date) } + orders.compactMap { Day($0.start) }
    guard let first = edges.min(), first < day else { return [] }
    let calendar = OwnCalendar(
      days: days, patterns: try PatternRow.fetchAll(db),
      patternOrder: try PatternOrderRow.fetchAll(db), orders: orders)
    return Set(calendar.shown(from: first, through: day.adding(days: -1)).values.map(\.shift))
  }
}
