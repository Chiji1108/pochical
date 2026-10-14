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
  /// The month's days with a shift as events, days off only those of
  /// `offShown`: each at the day's own time, else its pattern's. A day of
  /// work without a time that the day before's event runs into, like 明け
  /// after 夜勤, is left out, as that event shows on it already. `notes`
  /// and `people`, given only when asked for, are each day's memo and the
  /// names of those on it: they go in a shift's event's notes, and a day
  /// with a memo and no shift's event gets one of its own, all day, named
  /// by the memo. `days` hold the day before the month too.
  public static func month(
    _ month: Day, days: [Day: DayEntry], patterns: [PatternID: Pattern], offShown: Set<PatternID>,
    notes: [Day: String] = [:], people: [Day: [String]] = [:]
  ) -> [ShiftEvent] {
    month.daysOfMonth.compactMap { day in
      let shift = carriedOver(day, days: days, patterns: patterns, offShown: offShown)
        ? nil
        : shiftEvent(on: day, days: days, patterns: patterns, offShown: offShown, notes: notes,
          people: people)
      return shift ?? notes[day].flatMap { memo in memoEvent(memo, on: day) }
    }
  }

  /// The patterns `month` leaves out as carried over from the day before,
  /// in the order of the days they are first left out on, for the sheet
  /// to name.
  public static func carriedOver(
    _ month: Day, days: [Day: DayEntry], patterns: [PatternID: Pattern], offShown: Set<PatternID>
  ) -> [PatternID] {
    var found: [PatternID] = []
    for day in month.daysOfMonth
    where carriedOver(day, days: days, patterns: patterns, offShown: offShown) {
      if let shift = days[day]?.shift, !found.contains(shift) {
        found.append(shift)
      }
    }
    return found
  }

  /// Whether the day is work without a time that the day before's event
  /// runs into.
  private static func carriedOver(
    _ day: Day, days: [Day: DayEntry], patterns: [PatternID: Pattern], offShown: Set<PatternID>
  ) -> Bool {
    guard let entry = days[day], let pattern = patterns[entry.shift], !pattern.countsAsOff,
      hours(of: entry, pattern) == nil,
      let before = shiftEvent(
        on: day.adding(days: -1), days: days, patterns: patterns, offShown: offShown, notes: [:],
        people: [:]),
      let end = before.end
    else { return false }
    return end > 24 * 60
  }

  private static func shiftEvent(
    on day: Day, days: [Day: DayEntry], patterns: [PatternID: Pattern], offShown: Set<PatternID>,
    notes: [Day: String], people: [Day: [String]]
  ) -> ShiftEvent? {
    guard let entry = days[day], let pattern = patterns[entry.shift] else { return nil }
    guard !pattern.countsAsOff || offShown.contains(entry.shift) else { return nil }
    let said = notesOf(memo: notes[day], people: people[day] ?? [])
    guard let (start, end) = hours(of: entry, pattern) else {
      return ShiftEvent(day: day, title: pattern.name, start: nil, end: nil, notes: said)
    }
    return ShiftEvent(day: day, title: pattern.name, start: start, end: end, notes: said)
  }

  /// The day's own hours, else its pattern's, in minutes from its
  /// midnight; a shift ending at or before its start ends the next day.
  private static func hours(of entry: DayEntry, _ pattern: Pattern) -> (Int, Int)? {
    guard let start = (entry.start ?? pattern.time?.start).flatMap(minutes),
      let end = (entry.end ?? pattern.time?.end).flatMap(minutes)
    else { return nil }
    return (start, end > start ? end : end + 24 * 60)
  }

  /// A memo on a day with no shift's event: all day, named by its first
  /// line, the whole memo in its notes when it runs longer.
  private static func memoEvent(_ memo: String, on day: Day) -> ShiftEvent? {
    let lines = memo.split(separator: "\n", omittingEmptySubsequences: true)
    guard let first = lines.first else { return nil }
    return ShiftEvent(
      day: day, title: String(first), start: nil, end: nil, notes: lines.count > 1 ? memo : nil)
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
