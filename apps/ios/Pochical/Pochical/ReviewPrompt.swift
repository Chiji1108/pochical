import Foundation
import PochicalKit

/// The store's review prompt (spec/review.md): this device's use, kept in
/// its own defaults and never synced, and whether now is a time to ask.
/// The calendar asks just after the person finished putting something on
/// their days; StoreKit decides itself whether the prompt shows.
@MainActor enum ReviewPrompt {
  private static let key = "reviewHistory"
  /// Something went wrong since the app came to the front: an edit not
  /// kept, a change refused, an error shown.
  static var troubled = false

  /// The app came to the front today.
  static func opened() {
    troubled = false
    save(ReviewHistory.opened(history, on: .today))
  }

  /// Whether to ask now, having just finished putting something in.
  static var mayAsk: Bool {
    history?.mayAsk(today: .today, version: version, troubled: troubled) ?? false
  }

  /// Kept as asked, though the store does not say whether it showed.
  static func asked() {
    guard var history else { return }
    history.lastAsked = ReviewHistory.Ask(day: .today, version: version)
    save(history)
  }

  /// This build's version, as the App Store shows it.
  static var version: String {
    Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
  }

  private static var history: ReviewHistory? {
    UserDefaults.standard.data(forKey: key).flatMap {
      try? JSONDecoder().decode(ReviewHistory.self, from: $0)
    }
  }

  private static func save(_ history: ReviewHistory) {
    UserDefaults.standard.set(try? JSONEncoder().encode(history), forKey: key)
  }
}
