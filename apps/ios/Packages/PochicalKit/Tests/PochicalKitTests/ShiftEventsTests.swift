import PochicalKit
import Testing

struct DeviceCalendarVectors: Decodable {
  struct PatternCase: Decodable, Sendable {
    let name: String
    let time: [String]?
    let off: Bool
  }

  struct DayCase: Decodable, Sendable {
    let shift: String
    let start: String?
    let end: String?
  }

  struct Event: Decodable, Sendable, Equatable {
    let day: String
    let title: String
    let start: Int?
    let end: Int?
    var notes: String? = nil
  }

  struct Case: VectorCase {
    let name: String
    let month: String
    let patterns: [String: PatternCase]
    let days: [String: DayCase]
    let includeOff: Bool
    let notes: [String: String]?
    let people: [String: [String]]?
    let expected: [Event]
  }

  let events: [Case]
}

@Test(arguments: try vectors("device-calendar", as: DeviceCalendarVectors.self).events)
func shiftsAsEvents(_ vector: DeviceCalendarVectors.Case) throws {
  let patterns = Dictionary(
    uniqueKeysWithValues: vector.patterns.map { id, pattern in
      (
        id,
        Pattern(
          id: id, name: pattern.name, emoji: "", symbol: "", icon: "", color: 0,
          time: pattern.time.map { ShiftTime(start: $0[0], end: $0[1]) },
          countsAsOff: pattern.off)
      )
    })
  var days: [Day: DayEntry] = [:]
  for (key, day) in vector.days {
    days[try #require(Day(key))] = DayEntry(shift: day.shift, start: day.start, end: day.end)
  }
  let notes = Dictionary(
    uniqueKeysWithValues: (vector.notes ?? [:]).compactMap { key, memo in Day(key).map { ($0, memo) } })
  let people = Dictionary(
    uniqueKeysWithValues: (vector.people ?? [:]).compactMap { key, names in Day(key).map { ($0, names) } })
  let events = ShiftEvents.month(
    try #require(Day(vector.month)), days: days, patterns: patterns, includeOff: vector.includeOff,
    notes: notes, people: people)
  #expect(
    events.map {
      .init(day: $0.day.key, title: $0.title, start: $0.start, end: $0.end, notes: $0.notes)
    } == vector.expected)
}
