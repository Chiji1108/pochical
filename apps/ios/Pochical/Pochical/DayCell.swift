import PochicalDesign
import PochicalKit
import SwiftUI

/// A day of a month's page: its date, and its shift's mark.
struct DayCell: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  let day: Day
  let entry: DayEntry?
  /// The day's memo, its own whether it has a shift or not
  /// (spec/shift-patterns.md, A day's memo).
  let note: String?
  let pattern: Pattern?
  /// A day of the month before or after, faded whole.
  let outside: Bool
  let isToday: Bool
  let isHoliday: Bool
  /// Whether a holiday's date takes Sunday's red (the person's カレンダー
  /// settings).
  var colorsHoliday = true
  /// How a day off shows when the person leaves days off blank.
  var offShown = OffShown.shown
  /// The day being entered or opened, framed in the accent.
  var isSelected = false
  /// While entering, today's frame gives way to the day being entered.
  var isEntering = false
  /// A shift still to come of an order being typed: its mark faint.
  var faint = false
  /// Picks the day: to enter while entering, else to open.
  var onSelect: ((Day) -> Void)?

  static let height: CGFloat = 64

  var body: some View {
    if let onSelect {
      Button {
        onSelect(day)
      } label: {
        cell
      }
      .buttonStyle(PressedScale())
      .accessibilityAddTraits(isSelected ? .isSelected : [])
    } else {
      cell
    }
  }

  private var cell: some View {
    VStack(spacing: 2) {
      date
      if let pattern, !(pattern.countsAsOff && offShown == .hidden) {
        ShiftMark(
          pattern: pattern, size: markSize,
          change: timeChange(start: entry?.start, end: entry?.end, standard: pattern.time)
        )
        .opacity(faint || (pattern.countsAsOff && offShown == .faint) ? 0.35 : 1)
        .frame(maxHeight: look.options.names ? nil : .infinity)
        if look.options.names {
          Text(dayName(pattern.name))
            .font(.system(size: 9))
            .foregroundStyle(colors.textSecondary)
            .lineLimit(1)
            .frame(maxHeight: .infinity, alignment: .top)
        }
      } else {
        Spacer(minLength: 0)
      }
    }
    .padding(.vertical, 4)
    .frame(maxWidth: .infinity)
    .frame(height: Self.height)
    .background {
      if look.options.highlight, offShown == .shown, !faint, let pattern, pattern.countsAsOff {
        RoundedRectangle(cornerRadius: Radius.md).fill(colors.mark(look.colored ? pattern.color : 0).tint)
      }
    }
    .overlay {
      // Framed inside the day, so it never reaches the page beside: the
      // day being entered, else today, lighter, and not while entering.
      if isSelected {
        RoundedRectangle(cornerRadius: Radius.md).strokeBorder(colors.accentDefault, lineWidth: 2)
      } else if isToday && !isEntering {
        RoundedRectangle(cornerRadius: Radius.md).strokeBorder(colors.accentFocus, lineWidth: 1.5)
      }
    }
    .opacity(outside ? 0.35 : 1)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityText)
  }

  private var date: some View {
    Text(day.day, format: .number)
      .font(.system(size: 11, weight: isToday ? .heavy : outside ? .regular : .semibold))
      .foregroundStyle(dateColor)
      .background(alignment: .bottom) {
        // A note: a highlighter stroke over the date's lower half, as in a
        // paper diary.
        if note?.isEmpty == false {
          RoundedRectangle(cornerRadius: Radius.xxs)
            .fill(colors.calendarNoteMarker)
            .frame(height: 7)
            .padding(.horizontal, -3)
            .offset(y: -1)
        }
      }
      .frame(height: 14)
  }

  /// Letters stand on a tile a little larger; a name under the mark takes
  /// some of the room.
  private var markSize: CGFloat {
    switch (look.style, look.options.names) {
    case (.badge, false): 26
    case (.badge, true): 22
    case (_, false): 24
    case (_, true): 21
    }
  }

  private var dateColor: Color {
    if isToday {
      return colors.accentDefault
    }
    return isHoliday && colorsHoliday ? colors.calendarHoliday : colors.textPrimary
  }

  private var accessibilityText: String {
    var parts = ["\(day.month)月\(day.day)日"]
    if isHoliday, let name = Holidays.name(on: day.key, in: "JP") {
      parts.append(name)
    }
    parts.append(pattern?.name ?? "未入力")
    if let pattern, let entry,
      let change = timeChange(start: entry.start, end: entry.end, standard: pattern.time)
    {
      let moves = [change.early ? "早出" : nil, change.late ? "残業" : nil].compactMap(\.self)
      parts.append(moves.isEmpty ? "時間変更" : moves.joined(separator: "・"))
    }
    if note?.isEmpty == false {
      parts.append("メモあり")
    }
    return parts.joined(separator: "、")
  }
}

/// A day pressed shrinks a little under the finger, as /design's do.
struct PressedScale: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed ? 0.94 : 1)
      .animation(Springs.quick, value: configuration.isPressed)
  }
}

/// How days off show on the person's month while they leave them blank
/// (休みの見せ方 空白): left out, or faint while entering and in a day's
/// week; shown as they are otherwise.
enum OffShown {
  case shown
  case faint
  case hidden
}

/// A shift's name as a day has room for: up to `TextFields.dayNameLength`
/// characters, else cut short with …, as /design's dayName.
func dayName(_ name: String) -> String {
  let length = TextFields.dayNameLength
  return name.count <= length ? name : "\(name.prefix(length - 1))…"
}
