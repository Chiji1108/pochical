import Foundation
import PochicalDesign

// What the home and lock screen widgets show, worked out ahead of time
// (spec/widgets.md; /design's widgetEntry in apps/web/src/lib/design-widgets.ts):
// WidgetKit's TimelineEntry draws only from this, never from the person's
// database. How each field is worked out is pinned by spec/vectors/widgets.json.

/// How a day's date is colored where it stands alone.
public enum WidgetTone: String, Sendable {
  case holiday, saturday, plain
}

/// One day of a widget's entry.
public struct WidgetDay: Hashable, Sendable {
  public var date: Day
  public var tone: WidgetTone
  /// A national holiday while 祝日 coloring is on: the one date a grid of
  /// days colors, Sundays and Saturdays being colored in the weekdays.
  public var holiday: Bool
  /// The day's pattern, absent where nothing is entered.
  public var pattern: Pattern?
  /// A day off (休み, 有休), drawn on its tile as the calendar does.
  public var off: Bool
  /// "9:00 – 18:00", for a shift with a time: read aloud, not shown.
  public var time: String?
  /// The day's own start and end, else its pattern's, "HH:MM", for a shift
  /// with hours: いまのシフト counts by them.
  public var hours: ShiftTime?
  /// What is shown instead, only on a day whose hours differ from its
  /// pattern's: 早出 7:00〜, 残業 〜20:00, or the hours alone.
  public var change: String?
  /// 早出 and 残業, drawn on the mark's corners.
  public var timeChange: TimeChange?
  /// Whether the day has a memo, which the calendar's stroke says. Its
  /// words never come into an entry, nor do the day's people.
  public var noted: Bool
}

/// A shift with hours as a stretch of the clock: from its day's start to
/// its end, the next day where the end comes at or before the start.
public struct WidgetSpan: Hashable, Sendable {
  public var day: WidgetDay
  public var start: Date
  public var end: Date
}

/// いまのシフト at `at`: the shift on, else the next with hours, as far as
/// widgetRules.shiftLookaheadDays. Days off and shifts without hours are
/// time off. `refresh` is when the entry is made again.
public struct WidgetNow: Hashable, Sendable {
  public var at: Date
  public var on: WidgetSpan?
  public var next: WidgetSpan?
  /// Whole days to the next shift's day, when it is more than
  /// countdownHours away; within them the words count down instead.
  public var nextInDays: Int?
  public var refresh: Date
}

/// Why no day off is ahead.
public enum WidgetNoOff: Hashable, Sendable {
  case notEntered
  case waiting([String])
  case apart
}

/// 次の休み: whether today is off, and the next day off after it, as far
/// as days are entered; with someone picked, only days all are off.
public struct WidgetOffs: Hashable, Sendable {
  public var today: Bool
  public var next: (day: WidgetDay, inDays: Int)? {
    nextDay.map { ($0, nextInDays ?? 0) }
  }
  var nextDay: WidgetDay?
  var nextInDays: Int?
  /// Only when nothing is ahead, today included.
  public var none: WidgetNoOff?
}

/// Someone a widget is set to, by name, with whether they are off on a
/// day, nil where they have not entered it.
public struct WidgetPerson: Sendable {
  public var name: String
  public var offOn: @Sendable (Day) -> Bool?

  public init(name: String, offOn: @escaping @Sendable (Day) -> Bool?) {
    self.name = name
    self.offOn = offOn
  }
}

public struct WidgetEntry: Sendable {
  /// When the entry is for, a new one each day at midnight.
  public var date: Day
  public var now: WidgetNow
  /// The person has entered no day at all yet: the widgets then say where
  /// their days will come from.
  public var nothingEntered: Bool
  public var today: WidgetDay
  public var offs: WidgetOffs
  /// Today and the six days after it.
  public var upcoming: [WidgetDay]
  /// This week and the next, from the person's week start.
  public var twoWeeks: [WidgetDay]
  /// Whole weeks covering today's month, from the person's week start.
  public var month: [[WidgetDay]]
}

extension WidgetDay {
  /// A day as the calendar shows it, from what it holds and its pattern.
  public init(
    _ date: Day, entry: DayEntry?, pattern: Pattern?, noted: Bool, week: DeviceSettings.Week,
    holiday isHoliday: Bool
  ) {
    let shown = entry.flatMap { _ in pattern }
    let standard = shown?.time
    let moved = PochicalKit.timeChange(start: entry?.start, end: entry?.end, standard: standard)
    let hours = standard.map {
      ShiftTime(start: entry?.start ?? $0.start, end: entry?.end ?? $0.end)
    }
    let time = hours.map { widgetHoursText($0.start, $0.end) }
    self.date = date
    self.holiday = week.holiday && isHoliday
    tone =
      self.holiday || (date.weekday == 0 && week.sunday)
      ? .holiday : date.weekday == 6 && week.saturday ? .saturday : .plain
    self.pattern = shown
    off = shown?.countsAsOff ?? false
    self.time = time
    self.hours = hours
    change = time.flatMap { widgetChange($0, moved: moved) }
    timeChange = moved
    self.noted = noted
  }
}

/// Hours as the widgets read them aloud: 9:00 – 18:00, a leading zero
/// dropped from the hour, 翌 before an end at or before the start.
public func widgetHoursText(_ start: String, _ end: String) -> String {
  let trim = { (time: String) in time.hasPrefix("0") ? String(time.dropFirst()) : time }
  return "\(trim(start)) – \(end <= start ? "翌" : "")\(trim(end))"
}

/// A day's changed hours in words, from its time and how it moved: 早出
/// 7:00〜, 残業 〜20:00, or the hours alone where both moved, so they keep
/// to one line; the mark's corners say 早出 and 残業.
public func widgetChange(_ time: String, moved: TimeChange?) -> String? {
  guard let moved else { return nil }
  let parts = time.components(separatedBy: " – ")
  let start = parts.first ?? ""
  let end = parts.count > 1 ? parts[1] : ""
  if moved.early != moved.late {
    return moved.early ? "早出 \(start)〜" : "残業 〜\(end)"
  }
  return "\(start)〜\(end)"
}

/// What changed, short enough for a column of これから on one line: the new
/// start for 早出, the new end for 残業, else both ends.
public func widgetColumnHours(_ day: WidgetDay) -> String? {
  guard let time = day.time, day.change != nil else { return nil }
  let parts = time.components(separatedBy: " – ")
  let start = parts.first ?? ""
  let end = parts.count > 1 ? parts[1] : ""
  let early = day.timeChange?.early ?? false
  let late = day.timeChange?.late ?? false
  if early && !late { return "\(start)〜" }
  if late && !early { return "〜\(end)" }
  return "\(start)〜\(end)"
}

/// Those words for a column they do not fit even shrunk to 8pt: without
/// their :00 (7〜20).
public func widgetWithoutWholeHours(_ words: String) -> String {
  words.replacingOccurrences(of: ":00", with: "")
}

/// The clock time on a day, in the device's time zone.
func clock(_ day: Day, _ time: String, calendar: Calendar) -> Date {
  let parts = time.split(separator: ":").compactMap { Int($0) }
  var components = DateComponents(year: day.year, month: day.month, day: day.day)
  components.hour = parts.first ?? 0
  components.minute = parts.dropFirst().first ?? 0
  return calendar.date(from: components) ?? .distantPast
}

/// A working day's shift as a stretch of the clock; none for a day off or
/// a shift without hours.
func span(of day: WidgetDay, calendar: Calendar) -> WidgetSpan? {
  guard !day.off, let hours = day.hours else { return nil }
  let start = clock(day.date, hours.start, calendar: calendar)
  var end = clock(day.date, hours.end, calendar: calendar)
  if end <= start {
    end = clock(day.date.adding(days: 1), hours.end, calendar: calendar)
  }
  return WidgetSpan(day: day, start: start, end: end)
}

/// いまのシフト at `at`, `dayAt` giving each day by how many days it is
/// from today: yesterday's shift may still be on past midnight.
public func widgetNow(at: Date, today: Day, calendar: Calendar, dayAt: (Int) -> WidgetDay)
  -> WidgetNow
{
  let spans = (-1...Widgets.shiftLookaheadDays).compactMap {
    span(of: dayAt($0), calendar: calendar)
  }
  let on = spans.first { $0.start <= at && at < $0.end }
  let next = spans.first { $0.start > at }
  let midnight = clock(today.adding(days: 1), "00:00", calendar: calendar)
  let countdown = TimeInterval(Widgets.countdownHours * 3600)
  var turns = [midnight, on?.end, next?.start].compactMap(\.self)
  if let next { turns.append(next.start.addingTimeInterval(-countdown)) }
  let refresh = turns.filter { $0 > at && $0 < midnight }.min() ?? midnight
  let far = next.map { $0.start.timeIntervalSince(at) > countdown } ?? false
  return WidgetNow(
    at: at, on: on, next: next,
    nextInDays: far ? next.map { $0.day.date.days(since: today) } : nil, refresh: refresh)
}

/// 次の休み from today, `dayAt` giving each day by how many days on it is,
/// with `people` those the widget is set to.
public func widgetOffs(today: WidgetDay, people: [WidgetPerson], dayAt: (Int) -> WidgetDay)
  -> WidgetOffs
{
  func theirs(_ day: WidgetDay) -> [Bool?] { people.map { $0.offOn(day.date) } }
  func together(_ day: WidgetDay) -> Bool {
    Together.allOff([day.pattern == nil ? nil : day.off] + theirs(day))
  }
  var looked = [today]
  var next: (WidgetDay, Int)?
  for inDays in 1...Widgets.offLookaheadDays {
    let day = dayAt(inDays)
    looked.append(day)
    if together(day) {
      next = (day, inDays)
      break
    }
  }
  let offToday = together(today)
  var none: WidgetNoOff?
  if next == nil, !offToday {
    var waiting: [String] = []
    for day in looked where day.off && Together.mayAllBeOff(theirs(day)) {
      for (index, off) in theirs(day).enumerated()
      where off == nil && !waiting.contains(people[index].name) {
        waiting.append(people[index].name)
      }
    }
    if !waiting.isEmpty {
      none = .waiting(waiting)
    } else {
      let entered = looked.contains { $0.pattern != nil }
      none = entered && !people.isEmpty ? .apart : .notEntered
    }
  }
  return WidgetOffs(today: offToday, nextDay: next?.0, nextInDays: next?.1, none: none)
}

extension OwnCalendar {
  /// The person's widget entry at `now`, their own days alone.
  public func widgetEntry(
    at now: Date, week: DeviceSettings.Week, calendar: Calendar = .current,
    holiday: (Day) -> Bool = { $0.holidayName != nil }
  ) -> WidgetEntry {
    let today = Day(now, in: calendar)
    let reach = max(Widgets.offLookaheadDays, Widgets.shiftLookaheadDays)
    let firstShown = min(today.adding(days: -1), monthWeeks(today, weekStart: week.start)[0][0])
    let lastShown = max(today.adding(days: reach), today.firstOfMonth.daysOfMonth.last ?? today)
    let shown = self.shown(from: firstShown, through: lastShown.adding(days: 14))
    func day(_ date: Day) -> WidgetDay {
      let entry = shown[date]
      return WidgetDay(
        date, entry: entry, pattern: entry.flatMap { patternsByID[$0.shift] },
        noted: note(on: date) != nil, week: week, holiday: holiday(date))
    }
    let todayDay = day(today)
    let weekStart = today.adding(days: -(((today.weekday - week.start) % 7 + 7) % 7))
    return WidgetEntry(
      date: today,
      now: widgetNow(at: now, today: today, calendar: calendar) { day(today.adding(days: $0)) },
      nothingEntered: !hasEnteredDays,
      today: todayDay,
      offs: widgetOffs(today: todayDay, people: []) { day(today.adding(days: $0)) },
      upcoming: (0..<7).map { day(today.adding(days: $0)) },
      twoWeeks: (0..<14).map { day(weekStart.adding(days: $0)) },
      month: monthWeeks(today, weekStart: week.start).map { $0.map(day) })
  }

  /// Whether the person has entered any day yet, their own or by a
  /// repeating order.
  var hasEnteredDays: Bool {
    own.values.contains { $0.shift != nil && $0.shift != Days.noShift }
      || orders.contains { !$0.sequence.isEmpty }
  }
}

extension WidgetEntry {
  /// The sample week the gallery shows before anything is entered, and
  /// while an entry loads (/design/widgets' ふつう): 日勤, 夜勤 and its 明け,
  /// and days off, coming round.
  public static func sample(
    at now: Date, week: DeviceSettings.Week, calendar: Calendar = .current
  ) -> WidgetEntry {
    let ids = ["day", "day", "night", "after", "off", "off", "day"]
    let patterns = Dictionary(
      uniqueKeysWithValues: Set(ids).compactMap(ReadyPatterns.pattern).map {
        ($0.id, Pattern($0, keeping: []))
      })
    let today = Day(now, in: calendar)
    func day(_ date: Day) -> WidgetDay {
      let id = ids[((date.days(since: today) % ids.count) + ids.count) % ids.count]
      return WidgetDay(
        date, entry: DayEntry(shift: id), pattern: patterns[id], noted: false, week: week,
        holiday: false)
    }
    let weekStart = today.adding(days: -(((today.weekday - week.start) % 7 + 7) % 7))
    let todayDay = day(today)
    return WidgetEntry(
      date: today,
      now: widgetNow(at: now, today: today, calendar: calendar) { day(today.adding(days: $0)) },
      nothingEntered: false, today: todayDay,
      offs: widgetOffs(today: todayDay, people: []) { day(today.adding(days: $0)) },
      upcoming: (0..<7).map { day(today.adding(days: $0)) },
      twoWeeks: (0..<14).map { day(weekStart.adding(days: $0)) },
      month: monthWeeks(today, weekStart: week.start).map { $0.map(day) })
  }
}
