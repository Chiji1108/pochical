import PochicalKit
import Testing

@Test func readsOnlyKeysThatNameADay() {
  #expect(Day("2028-02-29") == Day(year: 2028, month: 2, day: 29))
  #expect(Day("2026-02-29") == nil)
  #expect(Day("2026-13-01") == nil)
  #expect(Day("2026-1-01") == nil)
  #expect(Day("someday") == nil)
}

@Test func countsInWholeDays() {
  let day = Day("2026-12-31")!
  #expect(day.adding(days: 1).key == "2027-01-01")
  #expect(day.adding(days: -365).key == "2025-12-31")
  #expect(Day("2027-01-01")!.days(since: day) == 1)
  #expect(day.weekday == 4)
  #expect(Day("2028-02-01")!.daysOfMonth.count == 29)
}

@Test func countsInMonths() {
  let day = Day("2026-11-15")!
  #expect(day.addingMonths(2).key == "2027-01-01")
  #expect(day.addingMonths(-11).key == "2025-12-01")
  #expect(day.firstOfMonth.key == "2026-11-01")
}

@Test func laysAMonthOutInWholeWeeks() {
  // October 2026 begins on a Thursday and ends on a Saturday.
  let sunday = monthWeeks(Day("2026-10-01")!, weekStart: 0)
  #expect(sunday.count == 5)
  #expect(sunday.first?.first?.key == "2026-09-27")
  #expect(sunday.last?.last?.key == "2026-10-31")
  let monday = monthWeeks(Day("2026-10-01")!, weekStart: 1)
  #expect(monday.first?.first?.key == "2026-09-28")
  #expect(monday.last?.last?.key == "2026-11-01")
}

@Test func entersFromTheMonthsFirstBlankDay() {
  let month = Day("2026-10-01")!
  let filled = Dictionary(
    uniqueKeysWithValues: month.daysOfMonth.prefix(3).map { ($0, DayEntry(shift: "day")) })
  #expect(firstBlankDay(in: month, days: filled).key == "2026-10-04")
  let full = Dictionary(uniqueKeysWithValues: month.daysOfMonth.map { ($0, DayEntry(shift: "day")) })
  #expect(firstBlankDay(in: month, days: full).key == "2026-10-01")
}
