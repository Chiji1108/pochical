import Testing

@testable import PochicalKit

@Test func englishNamesTheMonthsAndWeekdaysAsTheCalendarHeadsThem() {
  let day = Day(year: 2026, month: 9, day: 24)
  #expect(Day.weekdayLetter(day.weekday, english: true) == "T")
  #expect(day.weekdayName(english: true) == "Thu")
  #expect(day.weekdayHead(english: true) == "THU")
  #expect(day.monthTitle(english: true) == "September")
  #expect(day.monthWithYear(english: true) == "September 2026")
  #expect(day.shortMonth(english: true) == "Sep")
  #expect(day.headingMonth == "sep.")
  #expect(Day(year: 2026, month: 5, day: 1).headingMonth == "may")
}

@Test func japaneseKeepsItsOwnForms() {
  let day = Day(year: 2026, month: 9, day: 24)
  #expect(Day.weekdayLetter(day.weekday, english: false) == "木")
  #expect(day.weekdayHead(english: false) == "木")
  #expect(day.monthWithYear(english: false) == "2026年9月")
  #expect(day.shortMonth(english: false) == "9月")
}
