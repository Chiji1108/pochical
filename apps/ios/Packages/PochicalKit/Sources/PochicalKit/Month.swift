/// The days a month's page shows, a week to a row from `weekStart` (0 for
/// Sunday through 6 for Saturday): whole weeks covering the month, with
/// the days of the months around it filling the first and last.
public func monthWeeks(_ month: Day, weekStart: Int) -> [[Day]] {
  Period(of: month, start: 1).weeks(weekStart: weekStart)
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
    return shownDays(
      own: own, planned: planned(from: from, through: through), known: Set(patternsByID.keys))
  }

  /// The day's memo, its own whether it has a shift or not.
  public func note(on day: Day) -> String? {
    own[day]?.note
  }

  /// Each day's shift by the orders alone, from `from` through `through`.
  func planned(from: Day, through: Day) -> [Day: PatternID] {
    plannedShifts(orders: orders, known: Set(patternsByID.keys), from: from, through: through)
  }
}

/// What 今月のお休み and 今月の内訳 count on a page (spec/calendar.md, The
/// month; spec/vectors/month.json, summary): its days off, each pattern's
/// days in the patterns' order, archived ones too, and the days that show
/// no shift (未入力).
public struct PageSummary: Equatable, Sendable {
  public let daysOff: Int
  public let counts: [(pattern: PatternID, days: Int)]
  public let unfilled: Int

  /// The page's counts, `shown` each day's shift by date.
  public init(page: Period, shown: [Day: PatternID], patterns: [Pattern]) {
    let onPage = shown.filter { page.contains($0.key) }.values
    let off = Set(patterns.filter(\.countsAsOff).map(\.id))
    daysOff = onPage.count { off.contains($0) }
    counts = patterns.map { pattern in (pattern.id, onPage.count { $0 == pattern.id }) }
    unfilled = page.days.count - onPage.count
  }

  public static func == (lhs: PageSummary, rhs: PageSummary) -> Bool {
    lhs.daysOff == rhs.daysOff && lhs.unfilled == rhs.unfilled
      && lhs.counts.map(\.pattern) == rhs.counts.map(\.pattern)
      && lhs.counts.map(\.days) == rhs.counts.map(\.days)
  }
}

extension OwnCalendar {
  /// What the page counts.
  public func summary(of page: Period) -> PageSummary {
    PageSummary(
      page: page, shown: shown(from: page.first, through: page.last).mapValues(\.shift),
      patterns: patterns)
  }
}

/// Where ポチポチ入力 starts on a page: its first day without a shift in
/// `days`, else its first day (spec/calendar.md).
public func firstBlankDay(in page: Period, days: [Day: DayEntry]) -> Day {
  page.days.first { days[$0] == nil } ?? page.first
}
