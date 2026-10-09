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
  /// The event's notes: the day's memo and who works it, when asked for;
  /// none without either.
  public var notes: String? = nil
}

public enum ShiftEvents {
  /// The month's days with a shift as events, days off only when asked:
  /// each at the day's own time, else its pattern's. `notes` and `people`,
  /// given only when asked for, are each day's memo and the names of those
  /// on it, which go in the event's notes.
  public static func month(
    _ month: Day, days: [Day: DayEntry], patterns: [PatternID: Pattern], includeOff: Bool,
    notes: [Day: String] = [:], people: [Day: [String]] = [:]
  ) -> [ShiftEvent] {
    month.daysOfMonth.compactMap { day in
      guard let entry = days[day], let pattern = patterns[entry.shift] else { return nil }
      guard includeOff || !pattern.countsAsOff else { return nil }
      let said = notesOf(memo: notes[day], people: people[day] ?? [])
      let start = (entry.start ?? pattern.time?.start).flatMap(minutes)
      let end = (entry.end ?? pattern.time?.end).flatMap(minutes)
      guard let start, let end else {
        return ShiftEvent(day: day, title: pattern.name, start: nil, end: nil, notes: said)
      }
      // A shift ending at or before its start ends the next day.
      return ShiftEvent(
        day: day, title: pattern.name, start: start, end: end > start ? end : end + 24 * 60,
        notes: said)
    }
  }

  /// The memo, then 一緒に働く人：A、B on a line of its own.
  private static func notesOf(memo: String?, people: [String]) -> String? {
    let lines = [
      memo.flatMap { $0.isEmpty ? nil : $0 },
      people.isEmpty ? nil : "一緒に働く人：\(people.joined(separator: "、"))",
    ].compactMap(\.self)
    return lines.isEmpty ? nil : lines.joined(separator: "\n")
  }

  /// "HH:MM" as minutes from midnight.
  private static func minutes(_ time: String) -> Int? {
    let parts = time.split(separator: ":").compactMap { Int($0) }
    guard parts.count == 2 else { return nil }
    return parts[0] * 60 + parts[1]
  }
}
