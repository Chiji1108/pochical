import Foundation

/// A day's shift as an event in the device's calendar (spec/calendar.md,
/// Adding a month to the device calendar): its name, at its time on that
/// day, or all day when it has none. Its memo and people stay in Pochical.
public struct ShiftEvent: Hashable, Sendable {
  public let day: Day
  public let title: String
  /// Minutes from the day's midnight; none is all day.
  public let start: Int?
  /// Minutes from the day's midnight, past 24 hours for a shift that ends
  /// the next day.
  public let end: Int?
}

public enum ShiftEvents {
  /// The month's days with a shift as events, days off only when asked:
  /// each at the day's own time, else its pattern's.
  public static func month(
    _ month: Day, days: [Day: DayEntry], patterns: [PatternID: Pattern], includeOff: Bool
  ) -> [ShiftEvent] {
    month.daysOfMonth.compactMap { day in
      guard let entry = days[day], let pattern = patterns[entry.shift] else { return nil }
      guard includeOff || !pattern.countsAsOff else { return nil }
      let start = (entry.start ?? pattern.time?.start).flatMap(minutes)
      let end = (entry.end ?? pattern.time?.end).flatMap(minutes)
      guard let start, let end else {
        return ShiftEvent(day: day, title: pattern.name, start: nil, end: nil)
      }
      // A shift ending at or before its start ends the next day.
      return ShiftEvent(
        day: day, title: pattern.name, start: start, end: end > start ? end : end + 24 * 60)
    }
  }

  /// "HH:MM" as minutes from midnight.
  private static func minutes(_ time: String) -> Int? {
    let parts = time.split(separator: ":").compactMap { Int($0) }
    guard parts.count == 2 else { return nil }
    return parts[0] * 60 + parts[1]
  }
}
