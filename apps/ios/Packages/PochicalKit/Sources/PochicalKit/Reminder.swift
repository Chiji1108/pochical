import Foundation

/// A reminder of the person's own shifts (/design's design-reminders.ts):
/// a local notification the device schedules by itself, kept on the
/// device like an alarm, several at once, each on or off. It goes off the
/// evening before a day with a shift (前日), or some time before the shift
/// starts (開始前), which only days with a time have. Like an alarm's days,
/// it keeps the shifts it skips, so a pattern added later is reminded of
/// until it is turned off.
public struct Reminder: Codable, Hashable, Sendable, Identifiable {
  public enum Kind: Codable, Hashable, Sendable {
    /// The evening before, at "HH:MM".
    case dayBefore(time: String)
    /// This many minutes before the shift starts.
    case beforeStart(minutes: Int)
  }

  public var id: String
  public var on: Bool
  public var skip: [PatternID]
  public var kind: Kind

  public init(id: String, on: Bool = true, skip: [PatternID] = [], kind: Kind) {
    self.id = id
    self.on = on
    self.skip = skip
    self.kind = kind
  }

  /// One to start with: the evening before at 21:00.
  public static let defaults = [Reminder(id: "reminder-0", kind: .dayBefore(time: defaultTime))]
  public static let defaultTime = "21:00"
  public static let defaultMinutes = 60
  /// 開始前's choices, as the platforms' alert choices offer them.
  public static let minutesChoices = [15, 30, 60, 90, 120, 180]

  /// The patterns it can go off for: every one the evening before, only
  /// those with a time before they start.
  public func remindable(_ patterns: [Pattern]) -> [Pattern] {
    switch kind {
    case .dayBefore: patterns
    case .beforeStart: patterns.filter { $0.time != nil }
    }
  }

  /// What it is, as its row says: 前日 21:00, or 開始の1時間前.
  public var name: String {
    switch kind {
    case .dayBefore(let time): "前日 \(clock(time))"
    case .beforeStart(let minutes): "開始の\(Self.beforeText(minutes))前"
    }
  }

  /// How long before: 15分, 1時間, 1時間30分.
  public static func beforeText(_ minutes: Int) -> String {
    let hours = minutes / 60
    let rest = minutes % 60
    if hours == 0 { return "\(rest)分" }
    return rest == 0 ? "\(hours)時間" : "\(hours)時間\(rest)分"
  }

  /// When it goes off for a shift on `day`, if it does: for a shift it
  /// does not skip, 前日 on every day with one, days off too, and 開始前
  /// only for a shift with a time.
  public func firing(on day: Day, entry: DayEntry, pattern: Pattern) -> ReminderFiring? {
    guard !skip.contains(entry.shift) else { return nil }
    let at: (day: Day, minute: Int)
    switch kind {
    case .dayBefore(let time):
      guard let minute = minutes(time) else { return nil }
      at = (day.adding(days: -1), minute)
    case .beforeStart(let before):
      guard let start = (entry.start ?? pattern.time?.start).flatMap(minutes) else { return nil }
      let minute = start - before
      at = minute < 0 ? (day.adding(days: -1), minute + 24 * 60) : (day, minute)
    }
    let shift = shiftText(entry, pattern)
    let title =
      switch kind {
      case .dayBefore: "明日は\(shift)"
      case .beforeStart(let before): "あと\(Self.beforeText(before))で\(shift)"
      }
    return ReminderFiring(
      reminderID: id, shiftDay: day, day: at.day, minute: at.minute, title: title,
      body: timeRange(entry, pattern), shift: shift)
  }

  /// Its firings for the shifts from `from` through `through`, in order.
  public func firings(
    days: [Day: DayEntry], patterns: [PatternID: Pattern], from: Day, through: Day
  ) -> [ReminderFiring] {
    var firings: [ReminderFiring] = []
    var day = from
    while day <= through {
      if let entry = days[day], let pattern = patterns[entry.shift],
        let firing = firing(on: day, entry: entry, pattern: pattern)
      {
        firings.append(firing)
      }
      day = day.adding(days: 1)
    }
    return firings
  }
}

/// A notification a reminder sends: when it arrives, on the device's clock,
/// and what it says.
public struct ReminderFiring: Hashable, Sendable {
  public let reminderID: String
  /// The day of the shift it is about.
  public let shiftDay: Day
  /// The day it arrives, and the minute of that day.
  public let day: Day
  public let minute: Int
  /// The shift as its title: 明日は日勤, or あと1時間で日勤.
  public let title: String
  /// The shift's time, if it has one: 8:30 – 17:30.
  public let body: String?
  /// The shift by name, its 早出 or 残業 said: 日勤（残業）.
  public let shift: String

  /// When it arrives, as a row says it: 10月9日(金) 21:00.
  public var text: String {
    "\(day.fullText) \(minute / 60):\(String(format: "%02d", minute % 60))"
  }
}

/// The shift by name, with the day's own 早出 or 残業 always said, as the
/// calendar marks them: the time alone looks like any other day's.
private func shiftText(_ entry: DayEntry, _ pattern: Pattern) -> String {
  let change = timeChange(start: entry.start, end: entry.end, standard: pattern.time)
  let moves = [change?.early == true ? "早出" : nil, change?.late == true ? "残業" : nil]
    .compactMap(\.self).joined(separator: "・")
  return moves.isEmpty ? pattern.name : "\(pattern.name)（\(moves)）"
}

/// The day's time, its own else its pattern's: 8:30 – 17:30, or
/// 16:30 – 翌9:00 when it ends the next day.
private func timeRange(_ entry: DayEntry, _ pattern: Pattern) -> String? {
  guard let time = pattern.time else { return nil }
  let start = entry.start ?? time.start
  let end = entry.end ?? time.end
  return "\(clock(start)) – \(end <= start ? "翌" : "")\(clock(end))"
}

/// "08:30" as 8:30.
private func clock(_ time: String) -> String {
  time.hasPrefix("0") && time.count == 5 ? String(time.dropFirst()) : time
}

/// "HH:MM" as minutes from midnight.
private func minutes(_ time: String) -> Int? {
  let parts = time.split(separator: ":").compactMap { Int($0) }
  guard parts.count == 2 else { return nil }
  return parts[0] * 60 + parts[1]
}
