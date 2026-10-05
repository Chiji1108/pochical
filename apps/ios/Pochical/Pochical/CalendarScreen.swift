import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// カレンダー: the person's month, a page a month, turned by swiping.
struct CalendarScreen: View {
  @Environment(\.themeColors) private var colors
  @Dependency(\.defaultDatabase) private var database
  @FetchAll private var days: [DayRow]
  @FetchAll private var patterns: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]
  @FetchAll private var orders: [RepeatOrderRow]
  @State private var today = Day.today
  @State private var shownMonth: Day? = Day.today.firstOfMonth
  /// The day ポチポチ入力 enters next, while entering.
  @State private var entering: Day?
  @State private var gaps: [Day] = []

  /// How far the pages reach either side of this month. Only the pages in
  /// view are drawn, so they can reach far without a cost.
  private static let monthsAround = 120
  private static let screenEdge: CGFloat = 16
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
              month: month, today: today, calendar: calendar, weekStart: weekStart,
              style: style, highlightOff: style != .emoji, selected: entering,
              onSelect: entering == nil ? nil : { entering = $0 }
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
      bottom(calendar)
        .padding(.horizontal, Self.screenEdge)
        .padding(.bottom, 8)
    }
    .background(colors.backgroundBase)
    // A month turned to while entering starts on its first day; a day
    // picked in a month around it turns to that month.
    .onChange(of: shownMonth) { _, month in
      if let month, let day = entering, day.firstOfMonth != month {
        entering = month
      }
    }
    .onChange(of: entering) { _, day in
      if let day, day.firstOfMonth != shownMonth {
        withAnimation(Springs.standard) {
          shownMonth = day.firstOfMonth
        }
      }
    }
    .sheet(isPresented: Binding(get: { !gaps.isEmpty }, set: { if !$0 { gaps = [] } })) {
      if let off = holidayShift(of: calendar.patterns).flatMap({ calendar.patternsByID[$0] }),
        let month = gaps.first?.firstOfMonth
      {
        GapSheet(
          month: month, days: gaps, offPattern: off,
          offCount: offCount(in: month, calendar: calendar)
        ) {
          write { db, now in try OwnValues.fill(gaps, with: off.id, now: now, in: db) }
        }
      }
    }
    .task {
      // Past midnight, while the app is open or waiting in the background.
      for await _ in NotificationCenter.default.notifications(named: .NSCalendarDayChanged) {
        today = .today
      }
    }
  }

  private var thisMonth: Day {
    today.firstOfMonth
  }

  private var months: [Day] {
    (-Self.monthsAround...Self.monthsAround).map { thisMonth.addingMonths($0) }
  }

  /// ポチポチ入力 to start entering, or its tray while entering.
  @ViewBuilder private func bottom(_ calendar: OwnCalendar) -> some View {
    if let day = entering {
      let shown = calendar.shown(from: day, through: day)
      EntryTray(
        day: day, patterns: calendar.patterns, style: style, canClear: shown[day] != nil,
        canSkip: day != day.daysOfMonth.last,
        onEnter: { shift in
          write { db, now in try OwnValues.enter(shift, on: day, now: now, in: db) }
          entering = selectedAfterEntering(shift, on: day, patterns: calendar.patternsByID)
        },
        onSkip: { entering = selectedAfterEntering(nil, on: day, patterns: [:]) }
      )
    } else {
      Button {
        entering = (shownMonth ?? thisMonth).firstOfMonth
      } label: {
        Label("ポチポチ入力", systemImage: "pencil")
          .font(.headline)
          .frame(maxWidth: .infinity, minHeight: Metrics.control)
      }
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.capsule)
      .tint(colors.accentFill)
      .foregroundStyle(colors.accentOnFill)
    }
  }

  /// 完了: entering ends, and blank days before the month's last entered
  /// one are asked about.
  private func finish() {
    guard let day = entering else {
      return
    }
    entering = nil
    let calendar = OwnCalendar(
      days: days, patterns: patterns, patternOrder: patternOrder, orders: orders)
    // With no pattern that counts as off there is nothing to offer.
    guard holidayShift(of: calendar.patterns) != nil else {
      return
    }
    let month = day.firstOfMonth
    let shown = calendar.shown(from: month, through: month.daysOfMonth.last!)
    gaps = gapDays(in: month, days: shown)
  }

  private func offCount(in month: Day, calendar: OwnCalendar) -> Int {
    calendar.shown(from: month, through: month.daysOfMonth.last!).values.filter {
      calendar.patternsByID[$0.shift]?.countsAsOff == true
    }.count
  }

  /// Writes the person's edits at once; they wait in the outbox for sync.
  private func write(_ edit: @escaping (Database, Int64) throws -> Void) {
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    do {
      try database.write { db in try edit(db, now) }
    } catch {
      // Not expected: the edit is the device's own, and its tables are.
      assertionFailure("Could not keep the edit: \(error)")
    }
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
      if entering != nil {
        Button("完了", systemImage: "checkmark") {
          finish()
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .tint(colors.accentFill)
        .foregroundStyle(colors.accentOnFill)
      } else if month != thisMonth {
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

  static let names = ["日", "月", "火", "水", "木", "金", "土"]

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
  let today: Day
  let calendar: OwnCalendar
  let weekStart: Int
  let style: MarkStyle
  let highlightOff: Bool
  /// The day being entered, framed.
  let selected: Day?
  /// Picks a day to enter, while entering.
  let onSelect: ((Day) -> Void)?

  private static let rowGap: CGFloat = 4
  static let height = 6 * DayCell.height + 5 * rowGap

  var body: some View {
    let weeks = monthWeeks(month, weekStart: weekStart)
    let shown = calendar.shown(from: weeks.first![0], through: weeks.last![6])
    VStack(spacing: Self.rowGap) {
      ForEach(weeks, id: \.first) { week in
        HStack(spacing: 4) {
          ForEach(week, id: \.self) { day in
            let entry = shown[day]
            DayCell(
              day: day, entry: entry, pattern: entry.flatMap { calendar.patternsByID[$0.shift] },
              outside: day.month != month.month, isToday: day == today,
              isHoliday: Holidays.name(on: day.key, in: "JP") != nil, style: style,
              highlightOff: highlightOff, isSelected: day == selected, onSelect: onSelect)
          }
        }
      }
    }
    .frame(height: Self.height, alignment: .top)
  }
}
