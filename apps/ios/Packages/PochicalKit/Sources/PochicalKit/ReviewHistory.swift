import Foundation
import PochicalDesign

/// What a device keeps of its own use for the store's review prompt
/// (spec/review.md), on the device only, and whether it may ask now: the
/// same reckoning as /design's lib/review.ts, pinned by
/// spec/vectors/review.json.
public struct ReviewHistory: Codable, Hashable, Sendable {
  public struct Ask: Codable, Hashable, Sendable {
    public var day: Day
    public var version: String

    public init(day: Day, version: String) {
      self.day = day
      self.version = version
    }
  }

  public var firstOpened: Day
  public var lastOpened: Day
  /// The separate days the app was opened on.
  public var openDays: Int
  /// The calendar months those days fall in.
  public var openMonths: Int
  public var lastAsked: Ask?

  /// The history after the app was opened on `day`: a day already counted
  /// counts once, and a month once.
  public static func opened(_ history: ReviewHistory?, on day: Day) -> ReviewHistory {
    guard var history else {
      return ReviewHistory(
        firstOpened: day, lastOpened: day, openDays: 1, openMonths: 1, lastAsked: nil)
    }
    guard history.lastOpened != day else { return history }
    let sameMonth = history.lastOpened.firstOfMonth == day.firstOfMonth
    history.lastOpened = day
    history.openDays += 1
    history.openMonths += sameMonth ? 0 : 1
    return history
  }

  /// Whether to ask now, at a moment the spec allows: just after the
  /// person finished putting something on their days. `troubled` says
  /// something went wrong since the app came to the front.
  public func mayAsk(today: Day, version: String, troubled: Bool) -> Bool {
    let usedForAWhile =
      today.days(since: firstOpened) >= Review.minDaysSinceFirstOpen
      && openDays >= Review.minOpenDays && openMonths >= Review.minOpenMonths
    let askedLongAgo =
      lastAsked.map {
        $0.version != version && today.days(since: $0.day) >= Review.minDaysBetweenAsks
      } ?? true
    return usedForAWhile && askedLongAgo && !troubled
  }
}
