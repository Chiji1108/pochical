import Testing

@testable import PochicalKit

struct DayNameVectors: Decodable, Sendable {
  struct Case: VectorCase {
    struct Names: Decodable, Sendable, Equatable {
      let weekdayLetter: String
      let weekdayName: String
      let weekdayHead: String
      let monthTitle: String
      let monthWithYear: String
      let shortMonth: String
      let headingMonth: String?
    }

    let name: String
    let day: String
    let english: Bool
    let expected: Names
  }

  let cases: [Case]
}

@Test(arguments: try vectors("day-names", as: DayNameVectors.self).cases)
func namesMonthsAndWeekdaysAsTheHeadingsDo(_ vector: DayNameVectors.Case) throws {
  let day = try #require(Day(vector.day))
  let english = vector.english
  #expect(
    DayNameVectors.Case.Names(
      weekdayLetter: Day.weekdayLetter(day.weekday, english: english),
      weekdayName: day.weekdayName(english: english),
      weekdayHead: day.weekdayHead(english: english),
      monthTitle: day.monthTitle(english: english),
      monthWithYear: day.monthWithYear(english: english),
      shortMonth: day.shortMonth(english: english),
      headingMonth: english ? day.headingMonth : nil) == vector.expected)
}
