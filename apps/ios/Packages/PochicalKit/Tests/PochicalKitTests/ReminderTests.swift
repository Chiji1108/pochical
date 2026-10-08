import Foundation
import PochicalKit
import Testing

private let day = Pattern(
  id: "day", name: "日勤", emoji: "", symbol: "", icon: "", color: 0,
  time: ShiftTime(start: "08:30", end: "17:30"))
private let night = Pattern(
  id: "night", name: "夜勤", emoji: "", symbol: "", icon: "", color: 0,
  time: ShiftTime(start: "00:30", end: "09:00"))
private let off = Pattern(
  id: "off", name: "休み", emoji: "", symbol: "", icon: "", color: 0, countsAsOff: true)
private let patterns = Dictionary(uniqueKeysWithValues: [day, night, off].map { ($0.id, $0) })
private let nov2 = Day("2026-11-02")!

@Test func theEveningBeforeEveryShiftItDoesNotSkip() {
  let reminder = Reminder(id: "r", skip: ["off"], kind: .dayBefore(time: "21:00"))
  let firings = reminder.firings(
    days: [nov2: DayEntry(shift: "day"), nov2.adding(days: 1): DayEntry(shift: "off")],
    patterns: patterns, from: nov2, through: nov2.adding(days: 1))
  #expect(firings.count == 1)
  #expect(firings[0].day == Day("2026-11-01")!)
  #expect(firings[0].minute == 21 * 60)
  #expect(firings[0].title == "明日は日勤")
  #expect(firings[0].body == "8:30 – 17:30")
  #expect(reminder.name == "前日 21:00")
}

@Test func beforeAShiftThatHasATime() {
  let reminder = Reminder(id: "r", kind: .beforeStart(minutes: 90))
  let firing = reminder.firing(
    on: nov2, entry: DayEntry(shift: "day", start: "07:00", end: "20:00"), pattern: day)
  #expect(firing?.day == nov2)
  #expect(firing?.minute == 5 * 60 + 30)
  // The day's own hours are said, its moves too.
  #expect(firing?.title == "あと1時間30分で日勤（早出・残業）")
  #expect(firing?.body == "7:00 – 20:00")
  #expect(reminder.firing(on: nov2, entry: DayEntry(shift: "off"), pattern: off) == nil)
  #expect(reminder.name == "開始の1時間30分前")
}

@Test func beforeAShiftJustAfterMidnightComesTheDayBefore() {
  let reminder = Reminder(id: "r", kind: .beforeStart(minutes: 60))
  let firing = reminder.firing(on: nov2, entry: DayEntry(shift: "night"), pattern: night)
  #expect(firing?.day == Day("2026-11-01")!)
  #expect(firing?.minute == 23 * 60 + 30)
}

@Test func remindersKeptBeforeThereWereAnyStartWithTheEveningBefore() throws {
  let settings = try JSONDecoder().decode(DeviceSettings.self, from: Data("{}".utf8))
  #expect(settings.reminders == Reminder.defaults)
  let kept = try JSONEncoder().encode(settings)
  #expect(try JSONDecoder().decode(DeviceSettings.self, from: kept).reminders == Reminder.defaults)
}
