/// The days a month's page shows, a week to a row from `weekStart` (0 for
/// Sunday through 6 for Saturday): whole weeks covering the month, with
/// the days of the months around it filling the first and last.
public func monthWeeks(_ month: Day, weekStart: Int) -> [[Day]] {
  let first = month.firstOfMonth
  let lead = ((first.weekday - weekStart) % 7 + 7) % 7
  let count = month.daysOfMonth.count
  let weeks = (lead + count + 6) / 7
  let start = first.adding(days: -lead)
  return (0..<weeks).map { week in
    (0..<7).map { start.adding(days: week * 7 + $0) }
  }
}

/// The person's own calendar as the device holds it: their days, patterns
/// and repeating orders, read from the tables that show them.
public struct OwnCalendar: Sendable {
  /// The patterns in their order.
  public let patterns: [Pattern]
  public let patternsByID: [PatternID: Pattern]
  let own: [Day: OwnDay]
  let orders: [RepeatOrder]

  public init(
    days: [DayRow], patterns: [PatternRow], patternOrder: [PatternOrderRow],
    orders: [RepeatOrderRow]
  ) {
    var own: [Day: OwnDay] = [:]
    for row in days {
      if let day = Day(row.date) {
        own[day] = row.ownDay
      }
    }
    self.own = own
    self.patterns = ordered(patterns, by: patternOrder)
    self.patternsByID = Dictionary(
      self.patterns.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    self.orders = orders.sorted { $0.position < $1.position }.compactMap(\.order)
  }

  /// Every day from `from` through `through` that shows a shift: its own,
  /// else its order's (spec/shift-patterns.md, Repeating orders).
  public func shown(from: Day, through: Day) -> [Day: DayEntry] {
    let own = own.filter { $0.key >= from && $0.key <= through }
    return shownDays(own: own, planned: planned(from: from, through: through))
  }

  /// Each day's shift by the orders alone, from `from` through `through`.
  func planned(from: Day, through: Day) -> [Day: PatternID] {
    plannedShifts(orders: orders, known: Set(patternsByID.keys), from: from, through: through)
  }
}
