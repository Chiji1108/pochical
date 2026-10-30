import PochicalDesign
import PochicalKit
import SwiftUI

// カレンダー's two weeks (/design's TwoWeeksMedium) and the days it and the
// month draw: in the widget, and on the home screen's page of the app's
// style preview, so they are in both targets.

/// This week and the next, seven across from the week start as the
/// calendar lays them, days already gone faint so the weeks keep their
/// shape.
struct TwoWeeksView: View {
  @Environment(\.look) private var look
  /// The fortnight from the week start, fourteen days.
  let days: [WidgetDay]
  let today: Day
  let week: DeviceSettings.Week

  var body: some View {
    let named = look.options.names
    VStack(spacing: 4) {
      WeekdayHeads(week: week)
      VStack(spacing: 4) {
        ForEach(0..<2, id: \.self) { row in
          HStack(spacing: 2) {
            ForEach(days[(row * 7)..<(row * 7 + 7)], id: \.date) { day in
              GridDay(
                day: day, today: today, markSize: named ? 18 : 22, inMonth: true,
                inWeek: true
              )
              .opacity(day.date < today ? 0.4 : 1)
            }
          }
          .frame(maxHeight: .infinity)
        }
      }
    }
  }
}

/// The weekdays over the days, from the person's week start, in Sunday's
/// and Saturday's colors.
struct WeekdayHeads: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.english) private var english
  let week: DeviceSettings.Week

  var body: some View {
    HStack(spacing: 2) {
      ForEach(0..<7, id: \.self) { index in
        let weekday = week.weekday(atColumn: index)
        Text(Day.weekdayLetter(weekday, english: english))
          .font(.caption2)
          .foregroundStyle(colors.color(week.tone(weekday), plain: colors.textTertiary))
          .frame(maxWidth: .infinity)
      }
    }
    .accessibilityHidden(true)
  }
}

/// A day in a grid of days, drawn as the calendar's day: the date at the
/// top, semibold, red only for a holiday, today's in the accent and
/// framed; the mark in the room under it; a day off on its tile; days of
/// the months beside faded.
struct GridDay: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  let day: WidgetDay
  let today: Day
  let markSize: CGFloat
  let inMonth: Bool
  var inWeek = false

  var body: some View {
    let off = OffDrawing(day, look: look, inWeek: inWeek)
    let tile = off.tile && inMonth
    let isToday = day.date == today
    Link(destination: dayLink(day.date)) {
      VStack(spacing: 2) {
        Text(day.date.day, format: .number)
          .font(.system(size: 11, weight: isToday ? .heavy : inMonth ? .semibold : .regular))
          .foregroundStyle(dateColor(isToday: isToday))
          .noteStroke(day.noted, onTile: tile ? day.pattern : nil)
          .frame(height: 14)
        if let pattern = day.pattern, off.mark != .none {
          VStack(spacing: 1) {
            ShiftMark(pattern: pattern, size: markSize, change: day.timeChange)
              .opacity(off.mark == .faint ? 0.35 : 1)
            if look.options.names {
              Text(dayName(pattern.name))
                .font(.system(size: 9))
                .foregroundStyle(colors.textSecondary)
                .lineLimit(1)
            }
          }
          .frame(maxHeight: .infinity)
        } else {
          Spacer(minLength: 0)
        }
      }
      .padding(.vertical, 3)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .offTile(day, shown: tile)
      .overlay {
        if isToday {
          RoundedRectangle(cornerRadius: Radius.md)
            .strokeBorder(colors.accentFocus, lineWidth: 1.5)
        }
      }
      .opacity(inMonth ? 1 : 0.35)
    }
    .modifier(SpokenDay(day: day))
  }

  private func dateColor(isToday: Bool) -> Color {
    if isToday { return colors.accentDefault }
    return day.holiday ? colors.calendarHoliday : colors.textPrimary
  }
}
