/// The days after entering `shift` on `day` (ポチポチ入力,
/// spec/shift-patterns.md, The next day): the day takes it, keeping its
/// memo and people, and a pattern with a next day fills the following day
/// too, keeping that day's. One day only: the following day's own next day
/// is never followed. No shift clears the day, and only that day.
public func enteringShift(
  _ shift: PatternID?, on day: Day, in days: [Day: DayEntry], patterns: [PatternID: Pattern]
) -> [Day: DayEntry] {
  var entered = days
  entered[day] = shift.map { keepingDetails(of: days[day], shift: $0) }
  if let following = shift.flatMap({ patterns[$0]?.nextDay }) {
    let next = day.adding(days: 1)
    entered[next] = keepingDetails(of: days[next], shift: following)
  }
  return entered
}

private func keepingDetails(of entry: DayEntry?, shift: PatternID) -> DayEntry {
  if let entry, entry.shift == shift {
    return entry
  }
  return DayEntry(shift: shift, note: entry?.note, people: entry?.people)
}

/// The day selected next after entering `shift` on `day`: one day on, or
/// two past a next day it filled, but never past the month's last day,
/// where entering stays until 完了.
public func selectedAfterEntering(
  _ shift: PatternID?, on day: Day, patterns: [PatternID: Pattern]
) -> Day {
  let fillsNextDay = shift.flatMap { patterns[$0]?.nextDay } != nil
  let next = day.adding(days: fillsNextDay ? 2 : 1)
  let last = day.daysOfMonth.last!
  return min(next, last)
}

/// The blank days 完了 asks about in `month`'s month: those before its last
/// entered day. Blanks after it are left alone, as more likely not decided
/// yet (spec/shift-patterns.md, Blanks when entering ends).
public func gapDays(in month: Day, days: [Day: DayEntry]) -> [Day] {
  let monthDays = month.daysOfMonth
  guard let lastEntered = monthDays.last(where: { days[$0] != nil }) else {
    return []
  }
  return monthDays.filter { $0 < lastEntered && days[$0] == nil }
}
