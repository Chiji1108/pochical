import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

// The pieces every kind of widget draws days with (/design's
// design-widgets.tsx): a day's mark or dash, its name, a day off's look,
// the memo's stroke, and the words a day is written and read in.

/// How much smaller a mark draws with its name under it.
let nameRoom: CGFloat = 6

/// How a day off shows, following 休みを塗る and 休みの見せ方 as the
/// calendar does: on its tile, or with 空白 left empty, coming back faint
/// in a week of days as the calendar's week has it.
struct OffLook {
  enum Mark { case shown, faint, none }
  var mark = Mark.shown
  var tile = false

  init(_ day: WidgetDay, look: Look, inWeek: Bool) {
    guard day.off else { return }
    if look.options.blankOff {
      mark = inWeek ? .faint : .none
    } else {
      tile = look.options.highlight
    }
  }
}

extension View {
  /// A day off's tile behind a day: its pattern's tint as the calendar's,
  /// faint where the system draws the widget in one color, or it would be
  /// a solid block over its date.
  func offTile(
    _ day: WidgetDay, shown: Bool, radius: CGFloat = Radius.md, inset: EdgeInsets = EdgeInsets()
  ) -> some View {
    modifier(OffTile(day: day, shown: shown, radius: radius, inset: inset))
  }

  /// A memo's stroke under a date: the calendar's highlighter, on a day
  /// off's tile the tile's own color a step deeper.
  func noteStroke(_ shown: Bool, onTile pattern: Pattern? = nil, offset: CGFloat = -1)
    -> some View
  {
    modifier(NoteStroke(shown: shown, pattern: pattern, offset: offset))
  }
}

private struct OffTile: ViewModifier {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Environment(\.widgetRenderingMode) private var renderingMode
  let day: WidgetDay
  let shown: Bool
  let radius: CGFloat
  let inset: EdgeInsets

  func body(content: Content) -> some View {
    content.background {
      if shown, let pattern = day.pattern {
        RoundedRectangle(cornerRadius: radius)
          .fill(
            renderingMode == .fullColor
              ? colors.mark(look.colored ? pattern.color : 0).tint : .white.opacity(0.24)
          )
          .padding(inset)
      }
    }
  }
}

private struct NoteStroke: ViewModifier {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Environment(\.widgetRenderingMode) private var renderingMode
  let shown: Bool
  let pattern: Pattern?
  let offset: CGFloat

  func body(content: Content) -> some View {
    content.background(alignment: .bottom) {
      if shown {
        RoundedRectangle(cornerRadius: Radius.xxs)
          .fill(color)
          .frame(height: 7)
          .padding(.horizontal, -3)
          .offset(y: offset)
      }
    }
  }

  /// Faint in the system's one-color looks, as the tiles are.
  private var color: Color {
    if renderingMode != .fullColor { return .white.opacity(0.24) }
    return pattern.map { colors.mark(look.colored ? $0.color : 0).noteOnTint }
      ?? colors.calendarNoteMarker
  }
}

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

extension ThemeColors {
  /// A weekday's color over a column of days: Sunday's and Saturday's as
  /// the person colors them, else quiet.
  func weekday(_ tone: WidgetTone) -> Color {
    switch tone {
    case .holiday: calendarHoliday
    case .saturday: calendarSaturday
    case .plain: textTertiary
    }
  }

  /// A weekday's color in a week's heading, from the person's settings.
  func weekday(_ weekday: Int, week: DeviceSettings.Week) -> Color {
    switch weekday {
    case 0 where week.sunday: calendarHoliday
    case 6 where week.saturday: calendarSaturday
    default: textTertiary
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

  /// The whole day read aloud: its date, the shift and its hours, in the
  /// language its date is shown in (Sat, Oct 10).
  func spoken(english: Bool) -> String {
    let parts = [WidgetWords(english: english).date(date), pattern?.name ?? "予定なし"] + [time].compactMap { $0 }
    let memo = noted ? (english ? "memo" : "メモあり") : nil
    return (parts + [memo].compactMap { $0 }).joined(separator: english ? ", " : "、")
  }
}

/// A day as one element for screen readers, read as `spoken`.
struct SpokenDay: ViewModifier {
  @Environment(\.english) private var english
  let day: WidgetDay

  func body(content: Content) -> some View {
    content
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(day.spoken(english: english))
  }
}

/// The widgets' few words in Japanese or English (/design's useWords).
struct WidgetWords {
  let english: Bool

  /// A date as a widget names a day: 9月24日(木), or Thu, Sep 24.
  func date(_ day: Day) -> String {
    english
      ? "\(day.weekdayName(english: true)), \(day.shortMonth(english: true)) \(day.day)"
      : day.fullText
  }

  /// When a day comes: 今日, 明日, else how many days on.
  func inDays(_ count: Int) -> String {
    if english {
      return count == 0 ? "Today" : count == 1 ? "Tomorrow" : "in \(count) days"
    }
    return count == 0 ? "今日" : count == 1 ? "明日" : "\(count)日後"
  }

  /// The day after a day off: 明日, or its weekday (Fri) in English,
  /// short enough to keep clear of the poodle in the corner.
  func nextDay(_ day: Day) -> String {
    english ? day.weekdayName(english: true) : "明日"
  }

  var nothingYet: String { english ? "Nothing yet" : "まだ入っていません" }
  var firstRunLine: String { english ? "Enter shifts to see them" : "シフトを入れると出ます" }
}

/// A clock time without its leading zero: 8:30.
func clockWords(_ date: Date) -> String {
  let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
  return "\(parts.hour ?? 0):\(String(format: "%02d", parts.minute ?? 0))"
}
