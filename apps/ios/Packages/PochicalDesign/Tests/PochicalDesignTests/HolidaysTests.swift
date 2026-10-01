import Testing

@testable import PochicalDesign

// Holidays.swift is written by design/scripts/holidays.ts; these check
// that the written table reads back, including a name with a space.
@Test func namesJapansHolidays() {
  #expect(Holidays.name(on: "2026-01-01", in: "JP") == "元日")
  #expect(Holidays.name(on: "2026-05-06", in: "JP") == "こどもの日 振替休日")
  #expect(Holidays.name(on: "2026-05-07", in: "JP") == nil)
}

@Test func knowsNoOtherCountryYet() {
  #expect(Holidays.name(on: "2026-01-01", in: "KR") == nil)
}
