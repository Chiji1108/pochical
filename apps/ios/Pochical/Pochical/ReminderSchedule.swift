import PochicalKit
import SQLiteData
import SwiftUI
import UserNotifications

/// The reminders' notifications, put in the system's queue ahead of time
/// (/design's RemindersPage; spec/calendar.md, Reminders). iOS keeps 64 an
/// app may have waiting, so the nearest ones go in, two weeks ahead, and
/// all of them are put in anew whenever the days, the patterns, the
/// reminders or the permission change, and each time the app comes back.
enum ReminderSchedule {
  /// The requests' ids start with it, so the chats' are never touched.
  static let prefix = "reminder."
  private static let daysAhead = 14
  /// Under iOS's 64, leaving room.
  private static let most = 60

  @MainActor static func update(calendar: OwnCalendar, reminders: [Reminder], allowed: Bool) async {
    let center = UNUserNotificationCenter.current()
    let waiting = await center.pendingNotificationRequests().map(\.identifier)
      .filter { $0.hasPrefix(prefix) }
    // An update put aside by a newer one adds nothing after it: what it
    // would add may be what the newer one just took out.
    guard !Task.isCancelled else { return }
    center.removePendingNotificationRequests(withIdentifiers: waiting)
    guard allowed else { return }
    let today = Day.today
    let through = today.adding(days: daysAhead)
    let days = calendar.shown(from: today, through: through)
    let now = Date.now
    let firings = reminders.filter(\.on)
      .flatMap {
        $0.firings(days: days, patterns: calendar.patternsByID, from: today, through: through)
      }
      .compactMap { firing in date(of: firing).map { (firing, $0) } }
      .filter { $0.1 > now }
      .sorted { $0.1 < $1.1 }
      .prefix(most)
    for (firing, _) in firings {
      guard !Task.isCancelled else { return }
      let content = UNMutableNotificationContent()
      content.title = firing.title
      if let body = firing.body {
        content.body = body
      }
      content.sound = .default
      let trigger = UNCalendarNotificationTrigger(dateMatching: components(of: firing), repeats: false)
      let id = "\(prefix)\(firing.reminderID).\(firing.shiftDay.key)"
      try? await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
  }

  /// When it arrives, on the device's clock.
  static func date(of firing: ReminderFiring) -> Date? {
    Calendar.current.date(from: components(of: firing))
  }

  private static func components(of firing: ReminderFiring) -> DateComponents {
    DateComponents(
      year: firing.day.year, month: firing.day.month, day: firing.day.day,
      hour: firing.minute / 60, minute: firing.minute % 60)
  }
}

/// Puts the reminders in the queue anew as anything they read changes:
/// the days and orders, the patterns, the reminders, the permission, and
/// the day itself as the app comes back.
struct ReminderUpdates: ViewModifier {
  @Environment(Settings.self) private var settings
  @Environment(\.scenePhase) private var scenePhase
  @FetchAll private var days: [DayRow]
  @FetchAll private var patterns: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]
  @FetchAll private var orders: [RepeatOrderRow]

  private struct Key: Hashable {
    let days: [DayRow]
    let patterns: [PatternRow]
    let patternOrder: [PatternOrderRow]
    let orders: [RepeatOrderRow]
    let reminders: [Reminder]
    let allowed: Bool
    let today: Day
    let active: Bool
  }

  func body(content: Content) -> some View {
    let allowed = Notifications.shared.permission == .allowed
    content.task(
      id: Key(
        days: days, patterns: patterns, patternOrder: patternOrder, orders: orders,
        reminders: settings.device.reminders, allowed: allowed, today: .today,
        active: scenePhase == .active)
    ) {
      guard scenePhase == .active else { return }
      let calendar = OwnCalendar(
        days: days, patterns: patterns, patternOrder: patternOrder, orders: orders)
      await ReminderSchedule.update(
        calendar: calendar, reminders: settings.device.reminders, allowed: allowed)
    }
  }
}
