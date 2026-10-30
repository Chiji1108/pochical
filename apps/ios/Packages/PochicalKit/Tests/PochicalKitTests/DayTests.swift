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

  struct Summary: VectorCase {
    struct OwnPattern: Decodable, Sendable {
      let id: String
      let countsAsOff: Bool
      var archived = false

      enum CodingKeys: CodingKey {
        case id, countsAsOff, archived
      }

      init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        countsAsOff = try container.decode(Bool.self, forKey: .countsAsOff)
        archived = try container.decodeIfPresent(Bool.self, forKey: .archived) ?? false
      }
    }

    struct Count: Decodable, Sendable, Equatable {
      let id: String
      let days: Int
    }

    struct Expected: Decodable, Sendable {
      let daysOff: Int
      let counts: [Count]
      let unfilled: Int
    }

    let name: String
    let first: String
    let last: String
    let patterns: [OwnPattern]
    let shown: [String: String]
    let expected: Expected
  }

  struct Columns: VectorCase {
    let name: String
    let weekStart: Int
    let expected: [Int]
  }

  struct Tones: VectorCase {
    struct Colored: Decodable, Sendable {
      let sunday: Bool
      let saturday: Bool
      let holiday: Bool
    }

    let name: String
    let weekday: Int
    let holiday: Bool
    let week: Colored
    let expected: String
  }

  let weeks: [Case]
  let summary: [Summary]
  let columns: [Columns]
  let tones: [Tones]
}

@Test(arguments: try vectors("month", as: MonthVectors.self).columns)
func numbersAPagesColumnsFromTheWeekStart(_ vector: MonthVectors.Columns) {
  var week = DeviceSettings.Week()
  week.start = vector.weekStart
  #expect((0..<7).map { week.weekday(atColumn: $0) } == vector.expected)
}

@Test(arguments: try vectors("month", as: MonthVectors.self).tones)
func colorsADayAsTheWeekHasIt(_ vector: MonthVectors.Tones) {
  var week = DeviceSettings.Week()
  week.sunday = vector.week.sunday
  week.saturday = vector.week.saturday
  week.holiday = vector.week.holiday
  #expect(week.tone(vector.weekday, holiday: vector.holiday).rawValue == vector.expected)
}

@Test(arguments: try vectors("month", as: MonthVectors.self).summary)
func countsAPagesDaysOffAndEachPattern(_ vector: MonthVectors.Summary) throws {
  let page = Period(first: try #require(Day(vector.first)), last: try #require(Day(vector.last)))
  let patterns = vector.patterns.map {
    Pattern(
      id: $0.id, name: $0.id, emoji: "⭐️", symbol: $0.id, icon: "star", color: 0,
      countsAsOff: $0.countsAsOff, archived: $0.archived)
  }
  let shown = Dictionary(uniqueKeysWithValues: try vector.shown.map { (try #require(Day($0.key)), $0.value) })
  let summary = PageSummary(page: page, shown: shown, patterns: patterns)
  #expect(summary.daysOff == vector.expected.daysOff)
  #expect(summary.counts.map { MonthVectors.Summary.Count(id: $0.pattern, days: $0.days) } == vector.expected.counts)
  #expect(summary.unfilled == vector.expected.unfilled)
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
