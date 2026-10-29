import PochicalKit
import Testing

struct DeviceCalendarVectors: Decodable {
  struct PatternCase: Decodable, Sendable {
    let name: String
    let time: [String]?
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
    /// A シフトの期間's first day; the month without it.
    let start: Int?
    let patterns: [String: PatternCase]
    let days: [String: DayCase]
    let notes: [String: String]?
    let people: [String: [String]]?
    let shown: [String]
    let expected: [Event]
  }

  struct FirstPattern: Decodable, Sendable {
    let time: [String]?
    let off: Bool?
    let nextDay: String?
  }

  struct FirstCase: VectorCase {
    let name: String
    let patterns: [String: FirstPattern]
    let expected: [String]
  }

  struct PickCase: VectorCase {
    let name: String
    let patterns: [String: FirstPattern]
    let chosen: [String: Bool]
    let pick: Pick?
    let expectedChosen: [String: Bool]
    let expectedShown: [String]
  }

  struct Pick: Decodable, Sendable {
    let id: String
    let on: Bool
  }

  let events: [Case]
  let shownAtFirst: [FirstCase]
  let picks: [PickCase]
}

private func patterns(_ cases: [String: DeviceCalendarVectors.FirstPattern]) -> [Pattern] {
  cases.map { id, pattern in
    Pattern(
      id: id, name: id, emoji: "", symbol: "", icon: "", color: 0,
      time: pattern.time.map { ShiftTime(start: $0[0], end: $0[1]) },
      countsAsOff: pattern.off ?? false, nextDay: pattern.nextDay)
  }
}

@Test(arguments: try vectors("device-calendar", as: DeviceCalendarVectors.self).events)
func shiftsAsEvents(_ vector: DeviceCalendarVectors.Case) throws {
  let patterns = Dictionary(
    uniqueKeysWithValues: vector.patterns.map { id, pattern in
      (
        id,
        Pattern(
          id: id, name: pattern.name, emoji: "", symbol: "", icon: "", color: 0,
          time: pattern.time.map { ShiftTime(start: $0[0], end: $0[1]) })
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
  let events = ShiftEvents.page(
    Period(of: try #require(Day(vector.month)), start: vector.start ?? 1), days: days, patterns: patterns, shown: Set(vector.shown),
    notes: notes, people: people)
  #expect(
    events.map {
      .init(day: $0.day.key, title: $0.title, start: $0.start, end: $0.end, notes: $0.notes)
    } == vector.expected)
}

@Test(arguments: try vectors("device-calendar", as: DeviceCalendarVectors.self).shownAtFirst)
func patternsShownAtFirst(_ vector: DeviceCalendarVectors.FirstCase) {
  #expect(ShiftEvents.shownAtFirst(patterns(vector.patterns)) == Set(vector.expected))
}

@Test(arguments: try vectors("device-calendar", as: DeviceCalendarVectors.self).picks)
func patternsPicked(_ vector: DeviceCalendarVectors.PickCase) {
  let all = patterns(vector.patterns)
  var putting = CalendarAdd()
  putting.chosen = vector.chosen
  if let pick = vector.pick {
    putting.pick(pick.id, pick.on, of: all)
  }
  #expect(putting.chosen == vector.expectedChosen)
  #expect(putting.shown(of: all) == Set(vector.expectedShown))
}
