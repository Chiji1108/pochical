import PochicalDesign
import PochicalKit
import SwiftUI

// Small pieces chats share: their times and days, an unsent line's
// words, and the count of unread lines.

/// How many lines are unread, in the badge's red.
struct UnreadCount: View {
  @Environment(\.themeColors) private var colors
  let count: Int

  var body: some View {
    Text("\(count)")
      .font(.system(size: 11, weight: .bold).monospacedDigit())
      .foregroundStyle(colors.dangerOnFill)
      .padding(.horizontal, 5)
      .frame(minWidth: 18, minHeight: 18)
      .background(colors.dangerFill, in: Capsule())
      .accessibilityLabel("\(count)件の未読")
  }
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

/// The day over a day's first line in a chat.
struct DayChip: View {
  @Environment(\.themeColors) private var colors
  let day: Day

  var body: some View {
    Text(ChatTime.day(day))
      .font(.caption2)
      .foregroundStyle(colors.textTertiary)
      .padding(.horizontal, 12)
      .padding(.vertical, 2)
      .background(colors.fillTertiary, in: RoundedRectangle(cornerRadius: Radius.sm))
      .padding(.top, 8)
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
}
