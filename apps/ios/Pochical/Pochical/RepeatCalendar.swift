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
/// the day pressed is its 1st, and the order comes round faintly after the
/// days typed, as the calendar will show it. It is typed as ポチポチ入力
/// enters days: a key fills the framed day and the frame moves on, 翌日へ
/// moves it without typing, and 消す takes the framed day out, those after
/// it closing up. A day typed, pressed, takes the frame; any other moves
/// the order to start there, keeping what was typed.
///
/// It fills the screen as 1人ずつ's month does, swiped sideways a month at
/// a time, with the keys kept at the foot as ポチポチ入力's are. Where
/// 1人ずつ offers 今月, 1日目へ brings back the month of the order's 1st
/// day while it is out of sight: the month that matters is the order's,
/// and the month's name picks any other. Its first day and length go under
/// the page's title; what saves it is the page's 完了.
struct RepeatCalendar: View {
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
  var holidayCountry = HolidayCountry.current
  /// The month shown, from the swiped pages; until then the 1st day's.
  @State private var month: Day?
  /// Where the pages are as a finger moves them, for the month's name.
  @State private var position = PagerPosition(pages: span)
  /// The framed day, among those typed; none frames the day after them.
  @State private var framed: Int?
  @State private var keyPage = 0
  /// Every key pressed, to tick alike as ポチポチ入力's.
  @State private var keys = 0

  private static var span: Int { 24 }
  /// The month the pages count from: the order's as it opened, so an
  /// order of years ago is among them.
  @State private var origin: Day?
  private var base: Day { origin ?? anchor.firstOfMonth }

  var body: some View {
    let shown = month ?? anchor.firstOfMonth
    VStack(spacing: 12) {
      HStack {
        MonthTitleButton(
          month: shown, first: base.addingMonths(-Self.span),
          last: base.addingMonths(Self.span)
        ) { picked in
          month = picked
        } label: {
          RollingMonthTitle(position: position) { base.addingMonths($0 - Self.span) }
            .foregroundStyle(colors.textPrimary)
        }
        Spacer(minLength: 8)
        if shown != anchor.firstOfMonth {
          Button("1日目へ") {
            withAnimation(Springs.standard) { month = anchor.firstOfMonth }
          }
          .buttonStyle(BarButton())
          .accessibilityLabel("並びの1日目の月に戻る")
          .transition(.opacity)
        }
      }
      .frame(minHeight: Metrics.touch)
      // Under the weekdays as the calendar's month is.
      VStack(spacing: 0) {
        WeekdayRow(week: settings.device.week)
        pager
      }
      Spacer(minLength: 0)
      // ポチポチ入力's tray. No date over the keys: the framed day shows
      // where typing goes, and the room is the month's.
      VStack(spacing: 8) {
        PatternKeys(patterns: patterns, page: $keyPage) { pattern in
          keys += 1
          pick(pattern)
        }
        TrayActionsRow(
          pages: (patterns.count + patternsPerPage - 1) / patternsPerPage, page: $keyPage
        ) {
          TrayAction(title: "消す", systemImage: "trash", enabled: framed != nil) {
            keys += 1
            guard let at = framed, at < sequence.count else { return }
            sequence.remove(at: at)
            framed = at < sequence.count ? at : nil
          }
        } trailing: {
          TrayAction(
            title: "翌日へ", systemImage: "arrow.right", enabled: framed != nil,
            trailingIcon: true
          ) {
            keys += 1
            moveOn()
          }
        }
      }
      .sensoryFeedback(.selection, trigger: keys)
    }
    .padding(.horizontal, 16)
    .padding(.bottom, 8)
    // Its first day and length under the page's title.
    .navigationSubtitle(
      anchor.fullText + "から" + (sequence.isEmpty ? "" : "・\(sequence.count)日ごとに繰り返し"))
    .onAppear {
      origin = origin ?? anchor.firstOfMonth
      month = month ?? anchor.firstOfMonth
    }
  }

  /// The months side by side, a swipe turning one.
  private var pager: some View {
    let months = (-Self.span...Self.span).map { base.addingMonths($0) }
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
    let cursor = framed ?? sequence.count
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
              isHoliday: day.holidayName != nil,
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

  /// A key: on the framed day, the frame moving on, as ポチポチ入力 does.
  private func pick(_ pattern: Pattern) {
    if let at = framed, at < sequence.count {
      sequence[at] = pattern.id
    } else {
      sequence.append(pattern.id)
    }
    moveOn()
  }

  /// The frame to the next day, at most the one after those typed, its
  /// month turned to when it is out of sight.
  private func moveOn() {
    let next = (framed ?? sequence.count) + 1
    framed = next < sequence.count ? next : nil
    let day = anchor.adding(days: framed ?? sequence.count)
    let shown = month ?? anchor.firstOfMonth
    if !monthWeeks(shown, weekStart: settings.device.week.start).contains(where: { $0.contains(day) }) {
      withAnimation(Springs.standard) { month = day.firstOfMonth }
    }
  }

  /// A day typed takes the frame, as the next one does; any other moves
  /// the order there.
  private func press(_ day: Day) {
    let index = day.days(since: anchor)
    if index >= 0, index < sequence.count {
      framed = index
      return
    }
    framed = nil
    if index != sequence.count {
      anchor = day
    }
  }
}
