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
/// what was typed. Its parts are rows of the list it is in.
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
  var holidayCountry = "JP"
  /// The month shown; until turned, the 1st day's.
  @State private var month: Day?
  @State private var chosen: Int?
  @State private var keyPage = 0

  var body: some View {
    let shownMonth = month ?? anchor.firstOfMonth
    let weeks = monthWeeks(shownMonth, weekStart: settings.device.week.start)
    let byID = Dictionary(patterns.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let start = orderStart
    let first = weeks.first?.first ?? shownMonth
    let last = weeks.last?.last ?? shownMonth
    let planned = repeatSchedule(
      sequence, anchor: anchor, from: start.map { max($0, first) } ?? first, through: last,
      holidayShift: holidayShift, holidayCountry: holidayCountry)
    let cursor = chosen ?? sequence.count
    let kept = before?.shown(from: first, through: last) ?? [:]

    VStack(spacing: 0) {
      HStack {
        Button("前の月", systemImage: "chevron.left") { month = shownMonth.addingMonths(-1) }
        Spacer()
        Text(verbatim: "\(shownMonth.year)年\(shownMonth.month)月").font(.headline)
        Spacer()
        Button("次の月", systemImage: "chevron.right") { month = shownMonth.addingMonths(1) }
      }
      .labelStyle(.iconOnly)
      .buttonStyle(.borderless)
      .padding(.bottom, 8)
      WeekdayRow(week: settings.device.week)
      VStack(spacing: 4) {
        ForEach(weeks, id: \.first) { week in
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
                outside: day.month != shownMonth.month || !inOrder, isToday: day == .today,
                isHoliday: Holidays.name(on: day.key, in: "JP") != nil,
                colorsHoliday: settings.device.week.holiday, isSelected: index == cursor,
                isEntering: true, faint: inOrder && !typed,
                onSelect: press)
            }
          }
        }
      }
    }
    .padding(.vertical, 4)
    PatternKeys(patterns: patterns, page: $keyPage, onPick: pick)
      .padding(.vertical, 4)
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

  /// The first day the order covers; none covers every day.
  private var orderStart: Day? {
    switch cover {
    case .anchor: anchor
    case .from(let day): day
    case .always: nil
    }
  }

  /// A key: in the chosen day's place, else on the next day, turning the
  /// month as ポチポチ入力 moves on.
  private func pick(_ pattern: Pattern) {
    if let chosen, chosen < sequence.count {
      sequence[chosen] = pattern.id
      self.chosen = nil
      return
    }
    sequence.append(pattern.id)
    let next = anchor.adding(days: sequence.count)
    let shown = month ?? anchor.firstOfMonth
    if next.firstOfMonth > shown, !monthWeeks(shown, weekStart: settings.device.week.start)
      .contains(where: { $0.contains(next) })
    {
      month = next.firstOfMonth
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
