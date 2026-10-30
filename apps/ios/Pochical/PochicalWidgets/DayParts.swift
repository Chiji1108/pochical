import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

// How a widget draws a day (/design's design-widgets.tsx): a day off's
// look, the memo's stroke, the weekdays' colors and the words a screen
// reader says for it. The app's style preview draws the カレンダー widget
// with them too, so they are in both targets.

/// How a day off shows, following 休みの見せ方 for its pattern as the
/// calendar does: on its tile (強調), or with 空白 left empty, coming back
/// faint in a week of days as the calendar's week has it.
struct OffDrawing {
  enum Mark { case shown, faint, none }
  var mark = Mark.shown
  var tile = false

  init(_ day: WidgetDay, look: Look, inWeek: Bool) {
    guard day.off, let pattern = day.pattern else { return }
    switch look.options.offLook(of: pattern.id) {
    case .highlight: tile = true
    case .mark: break
    case .blank: mark = inWeek ? .faint : .none
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
