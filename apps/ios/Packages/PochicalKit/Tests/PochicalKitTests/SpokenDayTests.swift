import Testing

@testable import PochicalKit

@Test func aDayIsReadWithItsWeekdayTodayAndItsHoliday() throws {
  let holiday = try #require(Day("2026-11-03"))
  let plain = try #require(Day("2026-11-12"))
  #expect(plain.spokenText(isToday: false, holiday: nil) == "11月12日(木)")
  #expect(plain.spokenText(isToday: true, holiday: nil) == "今日、11月12日(木)")
  #expect(holiday.spokenText(isToday: false, holiday: "文化の日") == "11月3日(火)、文化の日")
  #expect(holiday.spokenText(isToday: true, holiday: "文化の日") == "今日、11月3日(火)、文化の日")
}

@Test func movedHoursAreReadAsWhatTheyAre() {
  #expect(TimeChange(early: true, late: false).spokenText == "早出")
  #expect(TimeChange(early: false, late: true).spokenText == "残業")
  #expect(TimeChange(early: true, late: true).spokenText == "早出・残業")
  #expect(TimeChange(early: false, late: false).spokenText == "時間変更")
}

@Test func aGroupsDayIsReadWithWhoHasWhichShift() throws {
  let day = try #require(Day("2026-11-12"))
  #expect(
    spokenGroupDay(
      day, isToday: false, holiday: nil, together: false,
      shifts: [
        SpokenShift(member: "しんご", pattern: "日勤", change: TimeChange(early: true, late: false)),
        SpokenShift(member: "お母さん", pattern: nil),
      ]) == "11月12日(木)、しんご：日勤 早出、お母さん：未入力")
  #expect(
    spokenGroupDay(
      day, isToday: true, holiday: nil, together: true,
      shifts: [
        SpokenShift(member: "しんご", pattern: "休み"), SpokenShift(member: "お母さん", pattern: "有休"),
      ]) == "今日、11月12日(木)、みんな休み、しんご：休み、お母さん：有休")
}
