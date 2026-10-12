import Foundation
import PochicalKit

/// The reminders offered once, the first time ポチポチ入力 closes with
/// shifts entered (spec/calendar.md, Reminders): kept on this device only,
/// never offered again whatever the answer.
@MainActor enum ReminderOffer {
  private static let key = "reminderOffered"

  /// Whether to offer now: never offered, the system not asked yet, and a
  /// reminder on to be told by.
  static func due(reminders: [Reminder]) -> Bool {
    !UserDefaults.standard.bool(forKey: key) && Notifications.shared.permission == .notAsked
      && reminders.contains(where: \.on)
  }

  static func offered() {
    UserDefaults.standard.set(true, forKey: key)
  }
}
