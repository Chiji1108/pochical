import PochicalDesign
import PochicalKit
import SwiftUI

/// The days an order being typed covers.
enum OrderCover: Hashable {
  /// From its 1st day, as a new order starts.
  case anchor
  /// From a day of its own: an order corrected keeps its start, and a new
  /// job's starts on its first day.
  case from(Day)
  /// Every day shown, as a first run's.
  case always
}

/// A repeating order typed on a month, as ポチポチ入力 enters days
/// (/design's RepeatCalendar; spec/shift-patterns.md, Typing an order):
/// the day pressed is its 1st, each key fills the next day, and the order
/// comes round faintly after the days typed, as the calendar will show it.
/// A day typed, pressed, is chosen: a key then takes its place and ⌫ takes
/// it out. Any other day pressed moves the order to start there, keeping
/// what was typed.
///
/// It fills the screen as 1人ずつ's month does, swiped sideways a month at
/// a time, with the keys kept at the foot as ポチポチ入力's are. No 今月:
/// the month that matters is the order's, which typing keeps in sight, and
/// the month's name picks any other. Its first
/// day and length go under the page's title, `accessory` at the end of the
/// month's row; what saves it is the page's 完了.
struct RepeatCalendar<Accessory: View>: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  @Binding var sequence: [PatternID]
  /// The order's 1st day.
  @Binding var anchor: Day
  let cover: OrderCover
  let patterns: [Pattern]
  /// The days as they show now, for those before the order, which stay.
  var before: OwnCalendar?
  /// 祝日は休みにする's pattern, when it is on.
  var holidayShift: PatternID?
  var holidayCountry = "JP"
  @ViewBuilder let accessory: () -> Accessory
  /// The month shown, from the swiped pages; until then the 1st day's.
  @State private var month: Day?
  /// Where the pages are as a finger moves them, for the month's name.
  @State private var position = PagerPosition(pages: span)
  @State private var chosen: Int?
  @State private var keyPage = 0

  private static var span: Int { 24 }
  /// The month the pages count from: this one.
  private var thisMonth: Day { Day.today.firstOfMonth }

  var body: some View {
    let shown = month ?? anchor.firstOfMonth
    VStack(spacing: 12) {
      HStack {
        MonthTitleButton(
          month: shown, first: thisMonth.addingMonths(-Self.span),
          last: thisMonth.addingMonths(Self.span)
        ) { picked in
          month = picked
        } label: {
          RollingMonthTitle(position: position) { thisMonth.addingMonths($0 - Self.span) }
            .foregroundStyle(colors.textPrimary)
        }
        Spacer(minLength: 8)
        accessory()
      }
      .frame(minHeight: Metrics.touch)
      VStack(spacing: 4) {
        WeekdayRow(week: settings.device.week)
        pager
      }
      Spacer(minLength: 0)
      VStack(spacing: 8) {
        PatternKeys(patterns: patterns, page: $keyPage, onPick: pick)
        HStack {
          let pages = (patterns.count + patternsPerPage - 1) / patternsPerPage
          if pages > 1 {
            PageDots(count: pages, current: $keyPage, label: "シフトのページ")
          }
          Spacer()
          Button(chosen == nil ? "1つ消す" : "選んだ日を消す", systemImage: "delete.left") {
            if let chosen, chosen < sequence.count {
              sequence.remove(at: chosen)
            } else if !sequence.isEmpty {
              sequence.removeLast()
            }
            chosen = nil
          }
          .font(.subheadline)
          .disabled(sequence.isEmpty)
        }
      }
    }
    .padding(.horizontal, 16)
    .padding(.bottom, 8)
    // Its first day and length under the page's title.
    .navigationSubtitle(
      dayName(anchor) + "から" + (sequence.isEmpty ? "" : "・\(sequence.count)日ごとに繰り返し"))
    .onAppear { month = month ?? anchor.firstOfMonth }
  }

  /// The months side by side, a swipe turning one.
  private var pager: some View {
    let months = (-Self.span...Self.span).map { thisMonth.addingMonths($0) }
    return ScrollView(.horizontal) {
      LazyHStack(spacing: 0) {
        ForEach(months, id: \.self) { month in
          grid(month)
            .containerRelativeFrame(.horizontal)
        }
      }
      .scrollTargetLayout()
    }
    .scrollTargetBehavior(.paging)
    .scrollPosition(id: $month)
    .onScrollGeometryChange(for: CGFloat.self) { geometry in
      geometry.contentOffset.x / max(geometry.containerSize.width, 1)
    } action: { _, pages in
      position.pages = pages
    }
    .scrollIndicators(.hidden)
    .frame(height: MonthPage.height)
  }

  /// A month's days: those typed solid, the rest of the order faint, and
  /// those before it as they show now, faded. Room is kept for six weeks,
  /// so the keys under it stay put as the months turn.
  private func grid(_ month: Day) -> some View {
    let weeks = monthWeeks(month, weekStart: settings.device.week.start)
    let byID = Dictionary(patterns.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let start = orderStart
    let first = weeks.first?.first ?? month
    let last = weeks.last?.last ?? month
    let planned = repeatSchedule(
      sequence, anchor: anchor, from: start.map { max($0, first) } ?? first, through: last,
      holidayShift: holidayShift, holidayCountry: holidayCountry)
    let kept = before?.shown(from: first, through: last) ?? [:]
    let cursor = chosen ?? sequence.count
    return VStack(spacing: 4) {
      ForEach(weeks, id: \.self) { week in
        HStack(spacing: 4) {
          ForEach(week, id: \.self) { day in
            let index = day.days(since: anchor)
            let typed = index >= 0 && index < sequence.count
            let inOrder = start.map { day >= $0 } ?? true
            let shift = typed ? sequence[index] : inOrder ? planned[day] : kept[day]?.shift
            DayCell(
              day: day, entry: typed || inOrder ? shift.map { DayEntry(shift: $0) } : kept[day],
              note: nil,
              pattern: shift.flatMap { byID[$0] ?? before?.patternsByID[$0] },
              outside: day.month != month.month || !inOrder, isToday: day == .today,
              isHoliday: Holidays.name(on: day.key, in: "JP") != nil,
              colorsHoliday: settings.device.week.holiday, isSelected: index == cursor,
              isEntering: true, faint: inOrder && !typed,
              onSelect: press)
          }
        }
      }
    }
    .frame(height: MonthPage.height, alignment: .top)
  }

  /// The first day the order covers; none covers every day.
  private var orderStart: Day? {
    switch cover {
    case .anchor: anchor
    case .from(let day): day
    case .always: nil
    }
  }

  /// A key: in the chosen day's place, else on the next day, turning to
  /// the month of the day after it as ポチポチ入力 moves on.
  private func pick(_ pattern: Pattern) {
    if let chosen, chosen < sequence.count {
      sequence[chosen] = pattern.id
      self.chosen = nil
      return
    }
    sequence.append(pattern.id)
    let next = anchor.adding(days: sequence.count)
    let shown = month ?? anchor.firstOfMonth
    if !monthWeeks(shown, weekStart: settings.device.week.start).contains(where: { $0.contains(next) }) {
      withAnimation(Springs.standard) { month = next.firstOfMonth }
    }
  }

  /// A day typed is chosen, or let go; any other moves the order there.
  private func press(_ day: Day) {
    let index = day.days(since: anchor)
    if index >= 0, index < sequence.count {
      chosen = chosen == index ? nil : index
      return
    }
    chosen = nil
    if index != sequence.count {
      anchor = day
    }
  }
}
