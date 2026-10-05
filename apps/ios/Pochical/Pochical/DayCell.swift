import PochicalDesign
import PochicalKit
import SwiftUI

/// A day of a month's page: its date, and its shift's mark.
struct DayCell: View {
  @Environment(\.themeColors) private var colors
  let day: Day
  let entry: DayEntry?
  let pattern: Pattern?
  /// A day of the month before or after, faded whole.
  let outside: Bool
  let isToday: Bool
  let isHoliday: Bool
  let style: MarkStyle
  /// Days off on a tint of their own pattern's color.
  let highlightOff: Bool

  static let height: CGFloat = 64

  var body: some View {
    VStack(spacing: 2) {
      date
      if let pattern {
        ShiftMark(
          pattern: pattern, style: style, size: 24,
          change: timeChange(start: entry?.start, end: entry?.end, standard: pattern.time)
        )
        .frame(maxHeight: .infinity)
      } else {
        Spacer(minLength: 0)
      }
    }
    .padding(.vertical, 4)
    .frame(maxWidth: .infinity)
    .frame(height: Self.height)
    .background {
      if highlightOff, let pattern, pattern.countsAsOff {
        RoundedRectangle(cornerRadius: Radius.md).fill(colors.mark(pattern.color).tint)
      }
    }
    .overlay {
      // Today framed inside the day, so it never reaches the page beside.
      if isToday {
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
        if entry?.note?.isEmpty == false {
          RoundedRectangle(cornerRadius: Radius.xxs)
            .fill(colors.calendarNoteMarker)
            .frame(height: 7)
            .padding(.horizontal, -3)
            .offset(y: -1)
        }
      }
      .frame(height: 14)
  }

  private var dateColor: Color {
    if isToday {
      return colors.accentDefault
    }
    return isHoliday ? colors.calendarHoliday : colors.textPrimary
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
    if entry?.note?.isEmpty == false {
      parts.append("メモあり")
    }
    return parts.joined(separator: "、")
  }
}
