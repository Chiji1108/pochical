import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

/// カレンダー (/design's TwoWeeksMedium, CalendarLarge and
/// CalendarExtraLarge; spec/widgets.md, Views): this week and the next, the
/// month, and on the iPad this month and the next, drawn as the app's month
/// draws its days.
struct CalendarWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "calendar", provider: DayTimeline()) { moment in
      WidgetLook(settings: moment.settings) {
        CalendarView(entry: moment.entry, week: moment.settings.week)
      }
    }
    .configurationDisplayName("カレンダー")
    .description("2週間と、1か月のシフト。")
    .supportedFamilies([.systemMedium, .systemLarge, .systemExtraLarge])
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
      } else if family == .systemExtraLarge {
        // A month in each half, each with the large's room.
        HStack(spacing: 24) {
          MonthView(first: entry.date.firstOfMonth, weeks: entry.month, entry: entry, week: week)
          MonthView(
            first: entry.date.firstOfMonth.addingMonths(1), weeks: entry.nextMonth, entry: entry,
            week: week)
        }
      } else if family == .systemLarge {
        MonthView(first: entry.date.firstOfMonth, weeks: entry.month, entry: entry, week: week)
      } else {
        TwoWeeksView(days: entry.twoWeeks, today: entry.date, week: week)
      }
    }
    // Elsewhere than a day, today.
    .widgetURL(dayLink(entry.date))
  }
}

/// A month with every day's mark, and today's change over today's month.
private struct MonthView: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Environment(\.english) private var english
  /// The month's first day.
  let first: Day
  /// Its whole weeks from the week start.
  let weeks: [[WidgetDay]]
  let entry: WidgetEntry
  let week: DeviceSettings.Week

  var body: some View {
    let named = look.options.names
    VStack(spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        // The month as the calendar titles it: 9月, or sep.
        Text(english ? first.headingMonth : first.monthText)
          .font(.title3.weight(.bold))
          .foregroundStyle(colors.textPrimary)
        Spacer()
        if first.month == entry.date.month, let change = entry.today.change {
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
          ForEach(weeks, id: \.first?.date) { days in
            HStack(spacing: 2) {
              ForEach(days, id: \.date) { day in
                GridDay(
                  day: day, today: entry.date, markSize: named ? 16 : 20,
                  inMonth: day.date.month == first.month)
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
