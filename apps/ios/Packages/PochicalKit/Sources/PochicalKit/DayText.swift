import Foundation

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
