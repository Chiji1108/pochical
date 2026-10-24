import PochicalDesign
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

struct MonthVectors: Decodable, Sendable {
  struct Case: VectorCase {
    struct Expected: Decodable, Sendable {
      let first: String
      let last: String
      let weeks: Int
    }

    let name: String
    let month: String
    let weekStart: Int
    let expected: Expected
  }

  let weeks: [Case]
}

@Test(arguments: try vectors("month", as: MonthVectors.self).weeks)
func laysAMonthOutInWholeWeeks(_ vector: MonthVectors.Case) throws {
  let month = try #require(Day("\(vector.month)-01"))
  let weeks = monthWeeks(month, weekStart: vector.weekStart)
  #expect(weeks.count == vector.expected.weeks)
  #expect(weeks.allSatisfy { $0.count == 7 })
  #expect(weeks.first?.first?.key == vector.expected.first)
  #expect(weeks.last?.last?.key == vector.expected.last)
}

@Test func entersFromThePagesFirstBlankDay() {
  let month = Period(of: Day("2026-10-01")!, start: 1)
  let filled = Dictionary(
    uniqueKeysWithValues: month.days.prefix(3).map { ($0, DayEntry(shift: "day")) })
  #expect(firstBlankDay(in: month, days: filled).key == "2026-10-04")
  let full = Dictionary(uniqueKeysWithValues: month.days.map { ($0, DayEntry(shift: "day")) })
  #expect(firstBlankDay(in: month, days: full).key == "2026-10-01")
  let period = Period(of: Day("2026-10-01")!, start: 15)
  #expect(firstBlankDay(in: period, days: full).key == "2026-11-01")
}

@Test func takesHolidaysFromItsRegionElseJapan() {
  #expect(Holidays.country(for: "JP") == "JP")
  // Pochical has no holidays of these yet.
  #expect(Holidays.country(for: "KR") == "JP")
  #expect(Holidays.country(for: nil) == "JP")
}

@Test func writesADayInOneWay() {
  let day = Day("2026-10-12")!
  #expect(day.fullText == "10月12日(月)")
  #expect(day.monthDayText == "10月12日")
  #expect(day.dayWeekdayText == "12日(月)")
  #expect(day.slashText == "10/12")
  #expect(day.yearSlashText == "2026/10/12")
  #expect(day.yearMonthText == "2026年10月")
}
