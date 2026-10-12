import Foundation
import PochicalKit

/// The reminders offered once, the first time ポチポチ入力 closes with
/// shifts entered (spec/calendar.md, Reminders): kept on this device only,
/// never offered again whatever the answer.
@MainActor enum ReminderOffer {
  private static let key = "reminderOffered"

  /// The time it would say, 21:00, when it is to be offered now: never
  /// offered, the system not asked yet, and a 前日 reminder on, the
  /// evening's the offer speaks of.
  static func due(reminders: [Reminder]) -> String? {
    guard !UserDefaults.standard.bool(forKey: key), Notifications.shared.permission == .notAsked
    else { return nil }
    for reminder in reminders where reminder.on {
      if case .dayBefore(let time) = reminder.kind {
        return time.hasPrefix("0") ? String(time.dropFirst()) : time
      }
    }
    return nil
  }

  static func offered() {
    UserDefaults.standard.set(true, forKey: key)
  }
}
