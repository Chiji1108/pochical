import PochicalDesign
import PochicalKit
import PochicalProto
import SwiftUI

// Small pieces chats share: their times and days, an unsent line's
// words, the count of unread lines, and what goes with a line sent.

/// How many lines are unread, in the badge's red.
struct UnreadCount: View {
  @Environment(\.themeColors) private var colors
  let count: Int
  /// Its round, growing with the reader's text size as its digits do.
  @ScaledMetric(relativeTo: .caption2) private var least: CGFloat = 18

  var body: some View {
    Text("\(count)")
      .font(.caption2.weight(.bold).monospacedDigit())
      .foregroundStyle(colors.dangerOnFill)
      .padding(.horizontal, 5)
      .frame(minWidth: least, minHeight: least)
      .background(colors.dangerFill, in: Capsule())
      .accessibilityLabel("\(count)件の未読")
  }
}

/// A member's name in a chat by id, from the chat's `names` as the group
/// shows them now: メンバー for someone it does not know.
func memberName(_ id: String, in names: [String: String]) -> String {
  names[id] ?? "メンバー"
}

/// The line a line taken back leaves (spec/chat.md, Editing and unsending).
func unsentLine(_ writer: String?, mine: Bool, deleted: Bool = false) -> String {
  if deleted { return "削除されたメッセージ" }
  return mine ? "メッセージの送信を取り消しました" : "\(writer ?? "メンバー")がメッセージの送信を取り消しました"
}

/// A chat's times as the messaging apps write them.
enum ChatTime {
  private static var calendar: Calendar { .current }

  static func date(_ ms: Int64) -> Date {
    Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
  }

  /// The device's time now, in milliseconds.
  static var nowMs: Int64 { Int64(Date.now.timeIntervalSince1970 * 1000) }

  /// Returns at the device's time `ms`, or as the task is cancelled.
  static func sleep(until ms: Int64) async {
    try? await Task.sleep(for: .milliseconds(max(ms - nowMs, 0)))
  }

  /// The time by a line: 9:41.
  static func clock(_ ms: Int64) -> String {
    let parts = calendar.dateComponents([.hour, .minute], from: date(ms))
    return String(format: "%d:%02d", parts.hour ?? 0, parts.minute ?? 0)
  }

  /// The day over a day's first line: 今日, 昨日, 10月5日(月), with the
  /// year once it is another year's.
  static func day(_ day: Day) -> String {
    let today = Day.today
    if day == today { return "今日" }
    if day == today.adding(days: -1) { return "昨日" }
    return day.year == today.year ? day.fullText : day.yearFullText
  }

  /// The time in the list of chats: the time today, 昨日, else the date.
  static func listed(_ ms: Int64) -> String {
    let day = Day(date(ms), in: calendar)
    let today = Day.today
    if day == today { return clock(ms) }
    if day == today.adding(days: -1) { return "昨日" }
    return day.year == today.year
      ? day.slashText : day.yearSlashText
  }
}

/// A day's name as a chat draws it, in the day's title and floating over
/// the lines, the two of one size.
struct DayWords: View {
  let day: Day

  var body: some View {
    Text(ChatTime.day(day))
      .font(.caption2)
      .padding(.horizontal, 12)
      .padding(.vertical, 2)
  }
}

/// The day over a day's first line in a chat, its words at its foot:
/// not drawn while the floating day stands for it, pinned in its place.
struct DayChip: View {
  @Environment(\.themeColors) private var colors
  let day: Day
  let scroll: ChatScroll
  let notice: ChatNotice

  var body: some View {
    DayWords(day: day)
      .foregroundStyle(colors.textTertiary)
      .background(colors.fillTertiary, in: RoundedRectangle(cornerRadius: Radius.sm))
      .opacity(scroll.floats(day, covered: notice.words != nil) ? 0 : 1)
      .padding(.top, FloatingDay.gap)
      // VoiceOver's rotor goes from day to day by its headings.
      .accessibilityAddTraits(.isHeader)
  }
}

/// The app's version and the device, as they reach Pochical's people with
/// each line of the chat with them: ポチカル 1.0・iPhone・iOS 26.0.
enum AppDevice {
  static var words: String {
    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    let system = UIDevice.current
    return "ポチカル \(version)・\(system.model)・\(system.systemName) \(system.systemVersion)"
  }

  /// A chat edit as it goes from the place `placeID`: each line with the
  /// app's version and the device where the place keeps them (the
  /// support chat's head says so).
  static func stamped(
    _ kind: Pochical_V1_ChatEdit.OneOf_Kind, in placeID: String
  ) -> Pochical_V1_ChatEdit.OneOf_Kind {
    guard ChatPlace.rules(of: placeID).sendsDevice, case .send(var send) = kind else { return kind }
    send.device = words
    return .send(send)
  }
}

/// A message's words as they are sent, from the composer or a
/// notification's answer: without the space around them, cut to the limit
/// (spec/text-limits.md).
func sentWords(_ text: String) -> String {
  String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(TextLimits.chatMessage))
}
