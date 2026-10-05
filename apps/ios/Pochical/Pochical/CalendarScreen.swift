import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// カレンダー: the person's month, a page a month, turned by swiping.
struct CalendarScreen: View {
  @Environment(\.themeColors) private var colors
  @FetchAll private var days: [DayRow]
  @FetchAll private var patterns: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]
  @FetchAll private var orders: [RepeatOrderRow]
  @State private var shownMonth: Day? = Day.today.firstOfMonth

  /// How far the pages reach either side of this month. Only the pages in
  /// view are drawn, so they can reach far without a cost.
  private static let monthsAround = 120
  private static let screenEdge: CGFloat = 16
  private let thisMonth = Day.today.firstOfMonth
  private let weekStart = 0
  private let style = MarkStyle.icon

  var body: some View {
    let calendar = OwnCalendar(
      days: days, patterns: patterns, patternOrder: patternOrder, orders: orders)
    VStack(spacing: 0) {
      heading
        .padding(.horizontal, Self.screenEdge)
      WeekdayRow(weekStart: weekStart)
        .padding(.horizontal, Self.screenEdge)
      // The pages run to the screen's edges, so a month slides out of
      // sight rather than being cut off inside them.
      ScrollView(.horizontal) {
        LazyHStack(spacing: 0) {
          ForEach(months, id: \.self) { month in
            MonthPage(
              month: month, calendar: calendar, weekStart: weekStart, style: style,
              highlightOff: style != .emoji
            )
            .padding(.horizontal, Self.screenEdge)
            .containerRelativeFrame(.horizontal)
          }
        }
        .scrollTargetLayout()
      }
      .scrollTargetBehavior(.paging)
      .scrollPosition(id: $shownMonth)
      .scrollIndicators(.hidden)
      .frame(height: MonthPage.height)
      Spacer(minLength: 0)
    }
    .background(colors.backgroundBase)
  }

  private var months: [Day] {
    (-Self.monthsAround...Self.monthsAround).map { thisMonth.addingMonths($0) }
  }

  private var heading: some View {
    let month = shownMonth ?? thisMonth
    return HStack(alignment: .bottom) {
      VStack(alignment: .leading, spacing: 4) {
        Text(String(month.year))
          .font(.system(size: 11))
          .foregroundStyle(colors.textTertiary)
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(month.month, format: .number)
            .font(.system(size: 36, weight: .semibold))
            .contentTransition(.numericText())
          Text("月")
            .font(.system(size: 14, weight: .medium))
        }
        .foregroundStyle(colors.textPrimary)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("\(month.year)年\(month.month)月")
      .accessibilityAddTraits(.isHeader)
      Spacer()
      if month != thisMonth {
        Button("今月") {
          withAnimation(Springs.standard) {
            shownMonth = thisMonth
          }
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .tint(colors.textPrimary)
      }
    }
    .padding(.horizontal, 8)
    .padding(.top, 8)
    .padding(.bottom, 12)
  }
}

/// The weekday names over the pages, from the week start, Sundays and
/// Saturdays in their colors.
struct WeekdayRow: View {
  @Environment(\.themeColors) private var colors
  let weekStart: Int

  private static let names = ["日", "月", "火", "水", "木", "金", "土"]

  var body: some View {
    HStack(spacing: 4) {
      ForEach(0..<7, id: \.self) { index in
        let weekday = (weekStart + index) % 7
        Text(Self.names[weekday])
          .font(.system(size: 11))
          .foregroundStyle(color(of: weekday))
          .frame(maxWidth: .infinity)
      }
    }
    .padding(.bottom, 12)
    .accessibilityHidden(true)
  }

  private func color(of weekday: Int) -> Color {
    switch weekday {
    case 0: colors.calendarHoliday
    case 6: colors.calendarSaturday
    default: colors.textTertiary
    }
  }
}

/// A month's page: its weeks, a row each, with room kept for six, the most
/// a month spans, so what is under it stays put as the months turn.
struct MonthPage: View {
  let month: Day
  let calendar: OwnCalendar
  let weekStart: Int
  let style: MarkStyle
  let highlightOff: Bool

  private static let rowGap: CGFloat = 4
  static let height = 6 * DayCell.height + 5 * rowGap

  var body: some View {
    let weeks = monthWeeks(month, weekStart: weekStart)
    let shown = calendar.shown(from: weeks.first![0], through: weeks.last![6])
    let today = Day.today
    VStack(spacing: Self.rowGap) {
      ForEach(weeks, id: \.first) { week in
        HStack(spacing: 4) {
          ForEach(week, id: \.self) { day in
            let entry = shown[day]
            DayCell(
              day: day, entry: entry, pattern: entry.flatMap { calendar.patternsByID[$0.shift] },
              outside: day.month != month.month, isToday: day == today,
              isHoliday: Holidays.name(on: day.key, in: "JP") != nil, style: style,
              highlightOff: highlightOff)
          }
        }
      }
    }
    .frame(height: Self.height, alignment: .top)
  }
}
