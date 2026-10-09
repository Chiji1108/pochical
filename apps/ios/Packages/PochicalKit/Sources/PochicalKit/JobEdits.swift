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
    let changed = try takePatterns(incoming, sequence: sequence, start: start, now: now, in: db)
    try repeatFrom(
      start, anchor: anchor, sequence: changed.sequence, patterns: changed.patterns,
      holidayCountry: holidayCountry, now: now, in: db)
  }

  /// はじめの設定 (spec/shift-patterns.md, The first run): a kind of
  /// work's patterns become the person's, and its sequence, if it has one,
  /// repeats counted from `anchor`, from the month before `today`'s or
  /// from `anchor` when that is earlier.
  public static func begin(
    with incoming: [Pattern], sequence: [PatternID], anchor: Day, today: Day,
    holidayCountry: String, now: Int64, in db: Database
  ) throws {
    let monthBefore = today.firstOfMonth.addingMonths(-1)
    let start = min(anchor, monthBefore)
    let changed = try takePatterns(incoming, sequence: sequence, start: start, now: now, in: db)
    guard !changed.sequence.isEmpty else { return }
    try repeatFrom(
      start, anchor: anchor, sequence: changed.sequence, patterns: changed.patterns,
      holidayCountry: holidayCountry, now: now, in: db)
  }

  /// `incoming` take over the patterns from `start`, a pattern of the
  /// person's still on a day before it staying after them.
  private static func takePatterns(
    _ incoming: [Pattern], sequence: [PatternID], start: Day, now: Int64, in db: Database
  ) throws -> (patterns: [Pattern], sequence: [PatternID]) {
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
    return (changed.patterns, changed.sequence)
  }

  /// `sequence` repeats from `start` counted from `anchor`, holidays off
  /// as its days suggest; an empty sequence ends repeating there.
  private static func repeatFrom(
    _ start: Day, anchor: Day, sequence: [PatternID], patterns: [Pattern],
    holidayCountry: String, now: Int64, in db: Database
  ) throws {
    let byID = Dictionary(patterns.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    let offShift = holidayShift(of: patterns)
    let holidaysOff =
      offShift != nil && holidaysOffByDefault(sequence, start: anchor, patterns: byID)
    try self.start(
      RepeatOrder(
        sequence: sequence, start: start, anchor: anchor, holidaysOff: holidaysOff,
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
