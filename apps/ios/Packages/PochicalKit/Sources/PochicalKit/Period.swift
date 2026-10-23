import PochicalDesign

/// A page of the calendar's days (spec/calendar.md, The shift period): a
/// month, or with a シフトの期間 the period starting on `start` (2 to 28) in
/// a month and running to the day before it a month on. A page is named by
/// that month, so turning pages is turning months whatever the period.
public struct Period: Hashable, Sendable {
  public let first: Day
  public let last: Day

  public init(first: Day, last: Day) {
    self.first = first
    self.last = last
  }

  /// The period starting on `start` in `month`'s month; 1 is the month.
  public init(of month: Day, start: Int) {
    let first = month.firstOfMonth
    self.init(
      first: first.adding(days: start - 1),
      last: first.addingMonths(1).adding(days: start - 2))
  }

  /// The period `day` is in: the calendar opens on today's.
  public init(holding day: Day, start: Int) {
    self.init(of: day.addingMonths(day.day < start ? -1 : 0), start: start)
  }

  /// The month naming this page.
  public var month: Day { first.firstOfMonth }

  /// Every day of it, its first to its last.
  public var days: [Day] {
    (0...last.days(since: first)).map { first.adding(days: $0) }
  }

  public func contains(_ day: Day) -> Bool {
    day >= first && day <= last
  }

  /// The days its page draws, a week to a row from `weekStart` (0 for
  /// Sunday through 6 for Saturday): whole weeks holding it, with the
  /// days before and after filling the first and last.
  public func weeks(weekStart: Int) -> [[Day]] {
    let lead = ((first.weekday - weekStart) % 7 + 7) % 7
    let count = last.days(since: first) + 1
    let start = first.adding(days: -lead)
    return (0..<(lead + count + 6) / 7).map { week in
      (0..<7).map { start.adding(days: week * 7 + $0) }
    }
  }
}

/// シフトの期間 (設定 > カレンダー, kept with the account): the day of the
/// month each page starts on, 1 for the month itself, else 2 to 28, so
/// every month has the day.
public struct ShiftPeriod: Codable, Equatable, Sendable {
  public static let starts = Array(1...Days.periodLastStart)

  public var start = 1

  public init(start: Int = 1) {
    self.start = start
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let start = try container.decodeIfPresent(Int.self, forKey: .start) ?? 1
    self.start = Self.starts.contains(start) ? start : 1
  }

  /// Whether the pages are periods rather than months.
  public var byPeriod: Bool { start != 1 }

  /// The page `month` names.
  public func page(_ month: Day) -> Period {
    Period(of: month, start: start)
  }

  /// The month naming the page that holds `day`.
  public func month(holding day: Day) -> Day {
    Period(holding: day, start: start).month
  }

  /// 15日〜, as 設定's row says it after the week's start and the month.
  public var shortName: String { "\(start)日〜" }

  /// 1日〜末日, or 15日〜翌月14日, as 設定 names it.
  public var name: String { Self.name(of: start) }

  public static func name(of start: Int) -> String {
    start == 1 ? "1日〜末日" : "\(start)日〜翌月\(start - 1)日"
  }
}
