import Foundation
import PochicalDesign

// How days are written (spec/calendar.md, How days are written): every
// screen writes a day, its weekday and its month through these, so
// another language changes them here alone.
extension Day {
  /// The weekdays' short names, from Sunday.
  public static let weekdayNames = ["日", "月", "火", "水", "木", "金", "土"]

  /// 日 to 土.
  public var weekdayName: String { Self.weekdayNames[weekday] }

  /// 11月1日
  public var monthDayText: String { "\(month)月\(day)日" }

  /// 11月1日(日)
  public var fullText: String { "\(monthDayText)(\(weekdayName))" }

  /// 2026年11月1日(日), for a day of another year.
  public var yearFullText: String { "\(year)年\(fullText)" }

  /// 1日(日), where the month goes without saying.
  public var dayWeekdayText: String { "\(day)日(\(weekdayName))" }

  /// 11/1, where room is short.
  public var slashText: String { "\(month)/\(day)" }

  /// 2026/11/1, for a day of another year.
  public var yearSlashText: String { "\(year)/\(slashText)" }

  /// 11月, of the month this day is in.
  public var monthText: String { "\(month)月" }

  /// 2026年11月
  public var yearMonthText: String { "\(year)年\(monthText)" }
}

// 月と曜日 set to English (spec/calendar.md, How days are written): the
// months and weekdays as English writes them, where the calendar's
// headings and short labels name them. Sentences stay Japanese, their
// dates with them.
extension Day {
  /// One letter over a column of days, where the column's place tells T
  /// from T, as calendars head their weeks.
  public static let englishWeekdayLetters = ["S", "M", "T", "W", "T", "F", "S"]

  /// Three letters beside a date, where nothing else tells them apart.
  public static let englishWeekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  private static let englishMonths = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September",
    "October", "November", "December",
  ]

  /// A weekday over a column of days: 木, or T.
  public static func weekdayLetter(_ weekday: Int, english: Bool) -> String {
    (english ? englishWeekdayLetters : weekdayNames)[weekday]
  }

  /// A weekday beside a date: 木, or Thu.
  public func weekdayName(english: Bool) -> String {
    english ? Self.englishWeekdayNames[weekday] : weekdayName
  }

  /// A column's weekday where the columns do not start the week, as the
  /// hub's run from today: 木, or THU.
  public func weekdayHead(english: Bool) -> String {
    english ? Self.englishWeekdayNames[weekday].uppercased() : weekdayName
  }

  /// A month alone: 11月, or November.
  public func monthTitle(english: Bool) -> String {
    english ? Self.englishMonths[month - 1] : monthText
  }

  /// A month with its year: 2026年11月, or November 2026.
  public func monthWithYear(english: Bool) -> String {
    english ? "\(Self.englishMonths[month - 1]) \(year)" : yearMonthText
  }

  /// A month in small text: 11月, or Nov.
  public func shortMonth(english: Bool) -> String {
    english ? String(Self.englishMonths[month - 1].prefix(3)) : monthText
  }

  /// The calendar heading's month in English, lower case and cut short
  /// as a lettered calendar's: nov., may.
  public var headingMonth: String {
    let name = Self.englishMonths[month - 1].lowercased()
    return name.count > 3 ? "\(name.prefix(3))." : name
  }
}

/// A shift's name as a day has room for: up to `TextFields.dayNameLength`
/// characters, else cut short with …, as /design's dayName.
public func dayName(_ name: String) -> String {
  let length = TextFields.dayNameLength
  return name.count <= length ? name : "\(name.prefix(length - 1))…"
}
