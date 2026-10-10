import Foundation
import Testing

@testable import PochicalKit

struct WidgetVectors: Decodable, Sendable {
  struct DayCase: VectorCase {
    struct Expected: Decodable, Sendable {
      let time: String?
      let change: String?
      let column: String?
      let columnShort: String?
    }

    let name: String
    let time: [String]?
    let start: String?
    let end: String?
    let expected: Expected
  }

  /// Someone's days by how many days from today: work, off, or null
  /// where not entered; days not listed are `rest`, else not entered.
  struct Days: Decodable, Sendable {
    let name: String?
    let days: [String: String?]
    let rest: String?

    func value(_ inDays: Int) -> String? {
      if let listed = days[String(inDays)] { return listed }
      return rest
    }
  }

  struct OffsCase: VectorCase {
    struct NoOff: Decodable, Sendable {
      let kind: String
      let names: [String]?
    }

    struct Expected: Decodable, Sendable {
      let today: Bool
      let next: Int?
      let none: NoOff?
    }

    let name: String
    let me: Days
    let with: [Days]
    let expected: Expected
  }

  struct NowCase: VectorCase {
    struct Shift: Decodable, Sendable {
      let shift: String
      let start: String?
      let end: String?
    }

    struct Expected: Decodable, Sendable {
      let on: [Stamp]?
      let next: [Stamp]?
      let nextInDays: Int?
      let refresh: [Stamp]
    }

    let name: String
    let at: String
    let days: [String: Shift]
    let expected: Expected
  }

  /// An offset or a time, as the vectors write a moment.
  enum Stamp: Decodable, Sendable, Equatable {
    case offset(Int)
    case time(String)

    init(from decoder: any Decoder) throws {
      let container = try decoder.singleValueContainer()
      if let offset = try? container.decode(Int.self) {
        self = .offset(offset)
      } else {
        self = .time(try container.decode(String.self))
      }
    }
  }

  let day: [DayCase]
  let offs: [OffsCase]
  let now: [NowCase]
}

private let week = DeviceSettings.Week()
private let gmt = { () -> Calendar in
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
  return calendar
}()

private func pattern(_ id: String, time: ShiftTime? = nil, off: Bool = false) -> Pattern {
  Pattern(id: id, name: id, emoji: "", symbol: "", icon: "", color: 0, time: time, countsAsOff: off)
}

@Test(arguments: try vectors("widgets", as: WidgetVectors.self).day)
func widgetDayWords(_ vector: WidgetVectors.DayCase) {
  let standard = vector.time.map { ShiftTime(start: $0[0], end: $0[1]) }
  let day = WidgetDay(
    Day(year: 2026, month: 9, day: 24),
    entry: DayEntry(shift: "s", start: vector.start, end: vector.end),
    pattern: pattern("s", time: standard), noted: false, week: week, holiday: false)
  #expect(day.time == vector.expected.time)
  #expect(day.change == vector.expected.change)
  let column = widgetColumnHours(day)
  #expect(column == vector.expected.column)
  #expect(column.map(widgetWithoutWholeHours) == vector.expected.columnShort)
}

@Test(arguments: try vectors("widgets", as: WidgetVectors.self).offs)
func widgetOffsCount(_ vector: WidgetVectors.OffsCase) {
  let today = Day(year: 2026, month: 9, day: 24)
  let work = pattern("work")
  let off = pattern("off", off: true)
  func day(_ inDays: Int) -> WidgetDay {
    let value = vector.me.value(inDays)
    let shown = value.map { $0 == "off" ? off : work }
    return WidgetDay(
      today.adding(days: inDays), entry: shown.map { DayEntry(shift: $0.id) }, pattern: shown,
      noted: false, week: week, holiday: false)
  }
  let people = vector.with.map { them in
    WidgetPerson(name: them.name ?? "") { date in
      them.value(date.days(since: today)).map { $0 == "off" }
    }
  }
  let offs = widgetOffs(today: day(0), people: people, dayAt: day)
  #expect(offs.today == vector.expected.today)
  #expect(offs.next?.inDays == vector.expected.next)
  let none: WidgetNoOff? =
    switch vector.expected.none?.kind {
    case "waiting": .waiting(vector.expected.none?.names ?? [])
    case "apart": .apart
    case "notEntered": .notEntered
    default: nil
    }
  #expect(offs.none == none)
}

@Test(arguments: try vectors("widgets", as: WidgetVectors.self).now)
func widgetNowCounts(_ vector: WidgetVectors.NowCase) {
  // Offset 0 is a Monday.
  let monday = Day(year: 2026, month: 9, day: 21)
  let patterns = [
    "day": pattern("day", time: ShiftTime(start: "09:00", end: "18:00")),
    "night": pattern("night", time: ShiftTime(start: "16:30", end: "09:30")),
    "duty": pattern("duty", time: ShiftTime(start: "08:30", end: "08:30")),
    "after": pattern("after"),
    "offDuty": pattern("offDuty"),
    "off": pattern("off", off: true),
  ]
  func day(_ inDays: Int) -> WidgetDay {
    let shift = vector.days[String(inDays)]
    return WidgetDay(
      monday.adding(days: inDays),
      entry: shift.map { DayEntry(shift: $0.shift, start: $0.start, end: $0.end) },
      pattern: shift.flatMap { patterns[$0.shift] }, noted: false, week: week, holiday: false)
  }
  func moment(_ stamps: [WidgetVectors.Stamp]?, at index: Int = 0) -> Date? {
    guard let stamps, case .offset(let offset) = stamps[index],
      case .time(let time) = stamps[index + 1]
    else { return nil }
    return clock(monday.adding(days: offset), time, calendar: gmt)
  }
  let now = widgetNow(
    at: clock(monday, vector.at, calendar: gmt), today: monday, calendar: gmt, dayAt: day)
  #expect(now.on?.start == moment(vector.expected.on))
  #expect(now.on?.end == moment(vector.expected.on, at: 2))
  #expect(now.next?.start == moment(vector.expected.next))
  #expect(now.next?.end == moment(vector.expected.next, at: 2))
  #expect(now.nextInDays == vector.expected.nextInDays)
  #expect(now.refresh == moment(vector.expected.refresh))
}
