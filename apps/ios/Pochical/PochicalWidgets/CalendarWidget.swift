import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

/// カレンダー (/design's TwoWeeksMedium, CalendarLarge and
/// CalendarExtraLarge; spec/widgets.md, Views): this week and the next, the
/// month, and in the extra large sizes this month and the next, drawn as the
/// app's month draws its days.
struct CalendarWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "calendar", provider: DayTimeline()) { moment in
      WidgetLook(settings: moment.settings) {
        CalendarView(entry: moment.entry, week: moment.settings.week)
      }
    }
    .configurationDisplayName("カレンダー")
    .description("2週間と、1か月のシフト。")
    .supportedFamilies(families)
  }

  /// The upright extra large comes with iOS 27 (spec/widgets.md, Extra large).
  private var families: [WidgetFamily] {
    let families: [WidgetFamily] = [.systemMedium, .systemLarge, .systemExtraLarge]
    if #available(iOS 27, *) {
      return families + [.systemExtraLargePortrait]
    }
    return families
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
      } else if family == .systemExtraLarge || upright {
        // A month in each half: side by side in the iPad's, each with the
        // large's room, and one over the other in the upright one. Their
        // weeks are as tall in both, though one has a week more.
        let rows = max(entry.month.weeks.count, entry.nextMonth.weeks.count)
        let halves =
          upright ? AnyLayout(VStackLayout(spacing: 16)) : AnyLayout(HStackLayout(spacing: 24))
        halves {
          MonthView(month: entry.month, rows: rows, entry: entry, week: week)
          MonthView(month: entry.nextMonth, rows: rows, entry: entry, week: week)
        }
      } else if family == .systemLarge {
        MonthView(month: entry.month, rows: entry.month.weeks.count, entry: entry, week: week)
      } else {
        TwoWeeksView(days: entry.twoWeeks, today: entry.date, week: week)
      }
    }
    // Elsewhere than a day, today.
    .widgetURL(dayLink(entry.date))
  }

  /// The upright extra large (iOS 27), whose months stack.
  private var upright: Bool {
    if #available(iOS 27, *) {
      return family == .systemExtraLargePortrait
    }
    return false
  }
}

/// A month with every day's mark, and today's change over today's month.
private struct MonthView: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Environment(\.english) private var english
  let month: WidgetMonth
  /// How many weeks' rows to lay out: more than the month has leaves the
  /// rest empty under it.
  let rows: Int
  let entry: WidgetEntry
  let week: DeviceSettings.Week

  var body: some View {
    let named = look.options.names
    let first = month.first
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
          ForEach(month.weeks, id: \.first?.date) { days in
            HStack(spacing: 2) {
              ForEach(days, id: \.date) { day in
                GridDay(
                  day: day, today: entry.date, markSize: named ? 16 : 20,
                  inMonth: day.date.month == first.month)
              }
            }
            // The weeks share the widget's height evenly, as the month's
            // do, the rows left empty under a shorter month among them.
            .frame(minHeight: 0, maxHeight: .infinity)
          }
          ForEach(month.weeks.count..<max(rows, month.weeks.count), id: \.self) { _ in
            Color.clear.frame(minHeight: 0, maxHeight: .infinity)
          }
        }
      }
    }
    .frame(maxHeight: .infinity)
  }
}
