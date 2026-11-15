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
      } else if upright {
        // This month over the next, a large wide and less than two tall:
        // the room under their headings goes to their weeks, so a week is
        // as tall in both and each day's mark as large as that leaves it.
        let weeks = [entry.month.weeks.count, entry.nextMonth.weeks.count]
        MonthsByWeeks(weeks: weeks, spacing: 16) {
          MonthView(month: entry.month, rows: weeks[0], entry: entry, week: week)
          MonthView(month: entry.nextMonth, rows: weeks[1], entry: entry, week: week)
        }
      } else if family == .systemExtraLarge {
        // A month in each half, each with the large's room, their weeks
        // level across though one has a week more.
        let rows = max(entry.month.weeks.count, entry.nextMonth.weeks.count)
        HStack(spacing: 24) {
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

/// Months one over the other, each as tall as its heading and its weeks:
/// the room left under the headings is shared by every week alike, so a
/// month of six weeks takes more of it than one of five.
private struct MonthsByWeeks: Layout {
  /// Each month's number of weeks, in order.
  let weeks: [Int]
  let spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    proposal.replacingUnspecifiedDimensions()
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    // Each month's least height, its heading and weekdays with no room for
    // its weeks, and what is left over them, shared by the weeks.
    let least = subviews.map {
      $0.sizeThatFits(ProposedViewSize(width: bounds.width, height: 0)).height
    }
    let gaps = spacing * CGFloat(max(subviews.count - 1, 0))
    let room = max(bounds.height - gaps - least.reduce(0, +), 0)
    let week = room / CGFloat(max(weeks.reduce(0, +), 1))
    var y = bounds.minY
    for (index, subview) in subviews.enumerated() {
      let height = least[index] + week * CGFloat(weeks[index])
      subview.place(
        at: CGPoint(x: bounds.minX, y: y), anchor: .topLeading,
        proposal: ProposedViewSize(width: bounds.width, height: height))
      y += height + spacing
    }
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
