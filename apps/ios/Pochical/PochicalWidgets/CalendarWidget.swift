import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

/// カレンダー (/design's TwoWeeksMedium and CalendarLarge; spec/widgets.md,
/// Views): this week and the next, and the month, drawn as the app's
/// month draws its days.
struct CalendarWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "calendar", provider: DayTimeline()) { moment in
      WidgetLook(settings: moment.settings) {
        CalendarView(entry: moment.entry, week: moment.settings.week)
      }
    }
    .configurationDisplayName("カレンダー")
    .description("2週間と、1か月のシフト。")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

private struct CalendarView: View {
  @Environment(\.widgetFamily) private var family
  let entry: WidgetEntry
  let week: DeviceSettings.Week

  var body: some View {
    Group {
      if entry.nothingEntered {
        FirstRun()
      } else if family == .systemLarge {
        MonthView(entry: entry, week: week)
      } else {
        TwoWeeksView(entry: entry, week: week)
      }
    }
    // Elsewhere than a day, today.
    .widgetURL(dayLink(entry.date))
  }
}

/// This week and the next, seven across from the week start as the
/// calendar lays them, days already gone faint so the weeks keep their
/// shape.
private struct TwoWeeksView: View {
  @Environment(\.look) private var look
  let entry: WidgetEntry
  let week: DeviceSettings.Week

  var body: some View {
    let named = look.options.names
    VStack(spacing: 4) {
      WeekdayHeads(week: week)
      VStack(spacing: 4) {
        ForEach(0..<2, id: \.self) { row in
          HStack(spacing: 2) {
            ForEach(entry.twoWeeks[(row * 7)..<(row * 7 + 7)], id: \.date) { day in
              GridDay(
                day: day, today: entry.date, markSize: named ? 18 : 22, inMonth: true,
                inWeek: true
              )
              .opacity(day.date < entry.date ? 0.4 : 1)
            }
          }
          .frame(maxHeight: .infinity)
        }
      }
    }
  }
}

/// The month with every day's mark, and today's change over it.
private struct MonthView: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Environment(\.english) private var english
  let entry: WidgetEntry
  let week: DeviceSettings.Week

  var body: some View {
    let named = look.options.names
    VStack(spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        // The month as the calendar titles it: 9月, or sep.
        Text(english ? entry.date.headingMonth : entry.date.monthText)
          .font(.title3.weight(.bold))
          .foregroundStyle(colors.textPrimary)
        Spacer()
        if let change = entry.today.change {
          Text("\(english ? "Today" : "今日") \(change)")
            .font(.footnote.monospacedDigit())
            .foregroundStyle(colors.textSecondary)
            .lineLimit(1)
        }
      }
      VStack(spacing: 0) {
        WeekdayHeads(week: week)
          .padding(.bottom, 4)
        VStack(spacing: named ? 2 : 4) {
          ForEach(entry.month, id: \.first?.date) { days in
            HStack(spacing: 2) {
              ForEach(days, id: \.date) { day in
                GridDay(
                  day: day, today: entry.date, markSize: named ? 16 : 20,
                  inMonth: day.date.month == entry.date.month)
              }
            }
            // The weeks share the widget's height, as the month's do.
            .frame(maxHeight: .infinity)
          }
        }
      }
    }
    .frame(maxHeight: .infinity)
  }
}

/// The weekdays over the days, from the person's week start, in Sunday's
/// and Saturday's colors.
private struct WeekdayHeads: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.english) private var english
  let week: DeviceSettings.Week

  var body: some View {
    HStack(spacing: 2) {
      ForEach(0..<7, id: \.self) { index in
        let weekday = (week.start + index) % 7
        Text(Day.weekdayLetter(weekday, english: english))
          .font(.caption2)
          .foregroundStyle(colors.weekday(weekday, week: week))
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
private struct GridDay: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  let day: WidgetDay
  let today: Day
  let markSize: CGFloat
  let inMonth: Bool
  var inWeek = false

  var body: some View {
    let off = OffLook(day, look: look, inWeek: inWeek)
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
