import Testing

@testable import PochicalKit

struct SpokenDayVectors: Decodable, Sendable {
  struct Change: Decodable, Sendable {
    let early: Bool
    let late: Bool
  }

  struct Shift: Decodable, Sendable {
    let member: String
    let pattern: String?
    let change: Change?

    var spoken: SpokenShift {
      SpokenShift(
        member: member, pattern: pattern,
        change: change.map { TimeChange(early: $0.early, late: $0.late) })
    }
  }

  struct DayCase: VectorCase {
    let name: String
    let day: String
    let today: String
    let holiday: String?
    let expected: String
  }

  struct ShiftCase: VectorCase {
    let name: String
    let member: String
    let pattern: String?
    let change: Change?
    let expected: String
  }

  struct GroupDayCase: VectorCase {
    let name: String
    let day: String
    let today: String
    let holiday: String?
    let together: Bool
    let shifts: [Shift]
    let expected: String
  }

  let days: [DayCase]
  let shifts: [ShiftCase]
  let groupDays: [GroupDayCase]
}

@Test(arguments: try vectors("spoken-days", as: SpokenDayVectors.self).days)
func aDayIsReadWithItsWeekdayTodayAndItsHoliday(_ vector: SpokenDayVectors.DayCase) throws {
  let day = try #require(Day(vector.day))
  #expect(
    day.spokenText(isToday: vector.day == vector.today, holiday: vector.holiday) == vector.expected)
}

@Test(arguments: try vectors("spoken-days", as: SpokenDayVectors.self).shifts)
func aMembersDayIsReadWithItsShiftAndMovedHours(_ vector: SpokenDayVectors.ShiftCase) {
  let shift = SpokenDayVectors.Shift(
    member: vector.member, pattern: vector.pattern, change: vector.change)
  #expect(shift.spoken.text == vector.expected)
}

@Test(arguments: try vectors("spoken-days", as: SpokenDayVectors.self).groupDays)
func aGroupsDayIsReadWithWhoHasWhichShift(_ vector: SpokenDayVectors.GroupDayCase) throws {
  let day = try #require(Day(vector.day))
  #expect(
    spokenGroupDay(
      day, isToday: vector.day == vector.today, holiday: vector.holiday,
      together: vector.together, shifts: vector.shifts.map(\.spoken)) == vector.expected)
}
