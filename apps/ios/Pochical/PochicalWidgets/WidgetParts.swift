import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

// The pieces every kind of widget draws days with (/design's
// design-widgets.tsx): a day's mark or dash and its name; a day off's look
// and the memo's stroke are DayParts.swift's. The words they are written
// and read in are WidgetWords.swift's, which the shortcuts say too.

/// How much smaller a mark draws with its name under it.
let nameRoom: CGFloat = 6

/// A day's mark, or a quiet dash where nothing is entered; with names on,
/// the name small under it, the two one group. `reserve` keeps the name's
/// line on a day without one, so the marks of a row stay level.
struct WidgetMark: View {
  @Environment(\.themeColors) private var colors
  let day: WidgetDay
  let size: CGFloat
  var faint = false
  var named = false
  var reserve = false
  /// Under a large mark, its name a size larger.
  var large = false

  var body: some View {
    VStack(spacing: 2) {
      if let pattern = day.pattern {
        ShiftMark(pattern: pattern, size: size, change: day.timeChange)
          .opacity(faint ? 0.35 : 1)
      } else {
        Text("–")
          .font(.system(size: size * 0.5))
          .foregroundStyle(colors.textQuaternary)
          .frame(width: size, height: size)
      }
      if named && (day.pattern != nil || reserve) {
        Text(day.pattern.map { dayName($0.name) } ?? " ")
          .font(.system(size: large ? 11 : 9))
          .foregroundStyle(colors.textSecondary)
          .lineLimit(1)
      }
    }
  }
}

extension WidgetDay {
  /// Its date short, as a widget heads one day: 9月24日, Sep 24.
  func shortDate(english: Bool) -> String {
    english ? "\(date.shortMonth(english: true)) \(date.day)." : date.monthDayText
  }

  /// The words a day says under its mark: what changed, 予定なし where
  /// nothing is entered, else nothing.
  var news: String? {
    pattern == nil ? "予定なし" : change
  }
}

/// A clock time without its leading zero: 8:30.
func clockWords(_ date: Date) -> String {
  let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
  return "\(parts.hour ?? 0):\(String(format: "%02d", parts.minute ?? 0))"
}

/// Who a widget is set to, by their face or the group's mark.
struct CompanionFace: View {
  let with: WidgetWith
  var size: CGFloat = 20

  var body: some View {
    switch with.kind {
    case .person: WidgetFace(person: with, size: size)
    case .group: WidgetGroupMark(group: with, size: size)
    }
  }
}

/// Asking for who the widget is set to to be picked again, once the person
/// or they have left the group they were picked under: in the secondary
/// color in the middle of its room.
struct PickAgain: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.english) private var english
  /// 一緒に休む人, or これから's 一緒に見る人.
  let whom: String
  let groupID: String

  var body: some View {
    Text(english ? "Pick who again" : "\(whom)を\n選び直してください")
      .font(.footnote)
      .multilineTextAlignment(.center)
      .foregroundStyle(colors.textSecondary)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .widgetURL(groupLink(groupID))
  }
}
