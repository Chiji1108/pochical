import Foundation
import PochicalKit

/// The reminders offered once (spec/calendar.md, Reminders): the first time
/// ポチポチ入力 closes with shifts entered, or as the calendar shows after
/// a repeating order was set up. Kept on this device only, never offered
/// again whatever the answer.
@MainActor enum ReminderOffer {
  private static let key = "reminderOffered"
  private static let pendingKey = "reminderOfferPending"

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

  /// A repeating order was set up (はじめの設定, 新しい仕事にする): it fills
  /// the days without ポチポチ入力, so the calendar offers as it shows.
  static func setUpOrder(_ sequence: [PatternID]) {
    if !sequence.isEmpty { UserDefaults.standard.set(true, forKey: pendingKey) }
  }

  /// Takes the waiting offer, if one waits.
  static func takePending() -> Bool {
    guard UserDefaults.standard.bool(forKey: pendingKey) else { return false }
    UserDefaults.standard.set(false, forKey: pendingKey)
    return true
  }
}
