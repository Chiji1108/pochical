import Foundation

/// A group's end (spec/sync-protocol.md, A group's end;
/// spec/vectors/group-end.json): one moment for everyone, which each device
/// shows as a day by its own clock.
public enum GroupEnd {
  /// The moment the end date `day` ends on a device in `zone`, in ms since
  /// the epoch: the first moment of the day after it there, which is not
  /// always midnight nor 24 hours after the day began (endsAt).
  public static func endsAt(_ day: Day, in zone: TimeZone) -> Int64 {
    // The Gregorian calendar has every day in every time zone: no day
    // stands in for one it cannot find, which would end the group early.
    let calendar = Day.gregorian(in: zone)
    let within = calendar.date(
      from: DateComponents(year: day.year, month: day.month, day: day.day))!
    let end = calendar.dateInterval(of: .day, for: within)!.end
    return Int64((end.timeIntervalSince1970 * 1000).rounded())
  }

  /// The day a device in `zone` shows for a group ending at `ms`: the day
  /// the moment just before it falls on there (endDay).
  public static func endDay(_ ms: Int64, in zone: TimeZone) -> Day {
    Day(Date(timeIntervalSince1970: Double(ms - 1) / 1000), in: Day.gregorian(in: zone))
  }

  /// How an end date is said, 12月31日, with its year when that is not the
  /// year of `today`, the device's own day (words).
  public static func words(_ day: Day, today: Day) -> String {
    day.year == today.year ? day.monthDayText : "\(day.year)年\(day.monthDayText)"
  }

  /// The end `ms` as a device in `zone` says it on `today`.
  public static func words(endsAtMs ms: Int64, in zone: TimeZone, today: Day) -> String {
    words(endDay(ms, in: zone), today: today)
  }

  /// このグループは12月31日に終了し、チャットや写真も消えます: what the
  /// group's chat says before its end `ms` comes, with what goes, the
  /// notification of that line, and its join screen before joining.
  public static func coming(_ ms: Int64, in zone: TimeZone, today: Day) -> String {
    "このグループは\(words(endsAtMs: ms, in: zone, today: today))に終了し、チャットや写真も消えます"
  }

  /// The key of the notification that a group ends soon, its one argument
  /// the end in ms since the epoch (spec/sync-protocol.md, A group's end).
  public static let notificationKey = "GROUP_ENDS"

  /// The words of the notification `payload` that a group ends soon, as a
  /// device in `zone` says them on `today`: the chat line's own. Nil for
  /// any other notification, or one whose argument is no moment, which
  /// shows as it came.
  public static func notificationWords(
    payload: [AnyHashable: Any], in zone: TimeZone, today: Day
  ) -> String? {
    guard let aps = payload["aps"] as? [String: Any],
      let alert = aps["alert"] as? [String: Any],
      alert["loc-key"] as? String == notificationKey,
      let args = alert["loc-args"] as? [String], args.count == 1,
      let ms = Int64(args[0]), ms > 0
    else { return nil }
    return coming(ms, in: zone, today: today)
  }
}
