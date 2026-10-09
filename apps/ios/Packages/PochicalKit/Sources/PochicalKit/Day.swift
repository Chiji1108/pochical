import Foundation

/// A day of the calendar, as "YYYY-MM-DD" names it in spec/, on the wire
/// and in the database. It is a date without a time, so no time zone or
/// clock change can move it to another day.
public struct Day: Hashable, Comparable, Sendable {
  public let year: Int
  public let month: Int
  public let day: Int

  public init(year: Int, month: Int, day: Int) {
    self.year = year
    self.month = month
    self.day = day
  }

  /// The day `date` falls on in `calendar`, the device's own unless given.
  public init(_ date: Date, in calendar: Calendar) {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    self.init(year: parts.year!, month: parts.month!, day: parts.day!)
  }

  /// The day's start in `calendar`, for the system's date pickers.
  public func date(in calendar: Calendar) -> Date {
    calendar.date(from: DateComponents(year: year, month: month, day: day)) ?? .now
  }

  /// Today, where the device is.
  public static var today: Day {
    Day(.now, in: .current)
  }

  /// The day a "YYYY-MM-DD" key names, or nil for one that names no day.
  public init?(_ key: String) {
    let parts = key.split(separator: "-")
    guard parts.count == 3, let year = Int(parts[0]), let month = Int(parts[1]),
      let day = Int(parts[2])
    else {
      return nil
    }
    self.init(year: year, month: month, day: day)
    guard self.key == key, Day(date) == self else {
      return nil
    }
  }

  public var key: String {
    String(format: "%04d-%02d-%02d", year, month, day)
  }

  public static func < (a: Day, b: Day) -> Bool {
    (a.year, a.month, a.day) < (b.year, b.month, b.day)
  }

  /// The day `count` days on, or back for a negative count.
  public func adding(days count: Int) -> Day {
    Day(Self.calendar.date(byAdding: .day, value: count, to: date)!)
  }

  /// Whole days from `other` to this day, negative when it is earlier.
  public func days(since other: Day) -> Int {
    Self.calendar.dateComponents([.day], from: other.date, to: date).day!
  }

  /// 0 for Sunday through 6 for Saturday.
  public var weekday: Int {
    Self.calendar.component(.weekday, from: date) - 1
  }

  /// The 1st of this day's month.
  public var firstOfMonth: Day {
    Day(year: year, month: month, day: 1)
  }

  /// The 1st of the month `count` months on, or back for a negative count.
  public func addingMonths(_ count: Int) -> Day {
    let months = year * 12 + (month - 1) + count
    return Day(year: months.floorDivided(by: 12), month: months.floorModulo(12) + 1, day: 1)
  }

  /// Every day of this day's month, the 1st to the last.
  public var daysOfMonth: [Day] {
    let count = Self.calendar.range(of: .day, in: .month, for: date)!.count
    return (1...count).map { Day(year: year, month: month, day: $0) }
  }

  // Days are counted in the Gregorian calendar at UTC, where every day is
  // 24 hours long.
  private static let calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
  }()

  private var date: Date {
    Self.calendar.date(from: DateComponents(year: year, month: month, day: day))!
  }

  private init(_ date: Date) {
    let parts = Self.calendar.dateComponents([.year, .month, .day], from: date)
    self.init(year: parts.year!, month: parts.month!, day: parts.day!)
  }
}

extension Day: CustomStringConvertible {
  public var description: String { key }
}

extension Day: Codable {
  public init(from decoder: any Decoder) throws {
    let key = try decoder.singleValueContainer().decode(String.self)
    guard let day = Day(key) else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "\(key) names no day"))
    }
    self = day
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(key)
  }
}

extension Int {
  fileprivate func floorDivided(by divisor: Int) -> Int {
    (self - floorModulo(divisor)) / divisor
  }

  fileprivate func floorModulo(_ divisor: Int) -> Int {
    ((self % divisor) + divisor) % divisor
  }
}
