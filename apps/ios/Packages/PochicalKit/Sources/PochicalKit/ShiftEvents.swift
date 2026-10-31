import Foundation

/// A day's shift as an event in the device's calendar (spec/calendar.md,
/// Adding a month to the device calendar): its name, at its time on that
/// day, or all day when it has none, the day's memo and people in its notes
/// when asked for.
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

/// Pochical's mark on an event it puts in: the site's link to the event's
/// day and whose shift it is, `https://pochical.app/day/YYYY-MM-DD#by=<user id>`
/// (`siteDayLink`), user ids being of letters and digits alone, in the
/// fragment, which a browser opening the link never sends to the site. It goes
/// in the event's notes, which every calendar keeps, Google's sync too,
/// where a link or a property of the app's own may not survive, and which
/// calendars make a link opening the day in the app (spec/calendar.md,
/// Adding a month to the device calendar).
public struct EventMark: Hashable, Sendable {
  public let day: Day
  public let user: String

  public init(day: Day, user: String) {
    self.day = day
    self.user = user
  }

  public var link: String { "\(siteDayLink(day).absoluteString)#by=\(user)" }

  /// The notes an event goes in with: its own, then the mark on a line of
  /// its own.
  public func appended(to notes: String?) -> String {
    [notes, link].compactMap(\.self).joined(separator: "\n")
  }

  /// The mark on a line of its own in an event's notes, whoever's; nil
  /// for an event not Pochical's. The last such line, as the mark goes in
  /// last, after a memo that may hold one copied from another event.
  /// Lines end at a line feed, each taken without the spaces, tabs and
  /// carriage return around it, as Android reads them.
  public init?(notes: String?) {
    let found = notes?.components(separatedBy: "\n").reversed().lazy.compactMap { line -> (day: Day, user: String)? in
      let line = line.trimmingCharacters(in: CharacterSet(charactersIn: " \t\r"))
      guard line.hasPrefix(siteDayLinks) else { return nil }
      return line.dropFirst(siteDayLinks.count)
        .wholeMatch(of: /(\d{4}-\d{2}-\d{2})#by=([A-Za-z0-9]+)/)
        .flatMap { match in Day(String(match.1)).map { (day: $0, user: String(match.2)) } }
    }.first
    guard let found else { return nil }
    self.init(day: found.day, user: found.user)
  }
}

public enum ShiftEvents {
  /// The page's days with a shift of `shown` as events, each at the day's
  /// own time, else its pattern's. `notes` and `people`, given only when
  /// asked for, are each day's memo and the names of those on it: they go
  /// in a shift's event's notes, and a day with a memo and no shift's
  /// event gets one of its own, all day, named by the memo.
  public static func page(
    _ page: Period, days: [Day: DayEntry], patterns: [PatternID: Pattern], shown: Set<PatternID>,
    notes: [Day: String] = [:], people: [Day: [String]] = [:]
  ) -> [ShiftEvent] {
    page.days.compactMap { day in
      shiftEvent(on: day, days: days, patterns: patterns, shown: shown, notes: notes,
        people: people)
        ?? notes[day].flatMap { memo in memoEvent(memo, on: day) }
    }
  }

  /// The patterns put in until the person picks otherwise: those with a
  /// time, and of those without, not the days off and not a pattern that
  /// follows another as its next day, like 明け after 夜勤, whose night
  /// shows on that day already.
  public static func shownAtFirst(_ patterns: [Pattern]) -> Set<PatternID> {
    let following = Set(patterns.compactMap(\.nextDay))
    return Set(
      patterns.filter { pattern in
        pattern.time != nil || !(pattern.countsAsOff || following.contains(pattern.id))
      }
      .map(\.id))
  }

  private static func shiftEvent(
    on day: Day, days: [Day: DayEntry], patterns: [PatternID: Pattern], shown: Set<PatternID>,
    notes: [Day: String], people: [Day: [String]]
  ) -> ShiftEvent? {
    guard let entry = days[day], let pattern = patterns[entry.shift], shown.contains(entry.shift)
    else { return nil }
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
