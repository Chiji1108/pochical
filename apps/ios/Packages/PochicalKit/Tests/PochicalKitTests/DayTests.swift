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
