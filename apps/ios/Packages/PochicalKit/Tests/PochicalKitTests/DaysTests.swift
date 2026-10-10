import PochicalKit
import Testing

// spec/vectors/repeat.json, own-days.json, entering.json, patterns.json and
// time-change.json, read as the files write them and turned into the
// package's types.

/// A day's values as the vectors write them, by date.
struct VectorDay: Decodable, Sendable {
  let shift: String?
  let start: String?
  let end: String?
  let note: String?
  let people: [String]?

  var own: OwnDay {
    OwnDay(shift: shift, start: start, end: end, note: note, people: people)
  }

  var entry: DayEntry {
    DayEntry(shift: shift ?? "", start: start, end: end, note: note, people: people)
  }
}

/// A pattern with only the fields a case needs.
struct VectorPattern: Decodable, Sendable {
  let id: String
  let name: String?
  let emoji: String?
  let symbol: String?
  let icon: String?
  let color: Int?
  let time: [String]?
  let countsAsOff: Bool?
  let nextDay: String?

  var pattern: Pattern {
    Pattern(
      id: id, name: name ?? "", emoji: emoji ?? "", symbol: symbol ?? "", icon: icon ?? "",
      color: color ?? 0, time: time.map { ShiftTime(start: $0[0], end: $0[1]) },
      countsAsOff: countsAsOff ?? false, nextDay: nextDay)
  }
}

/// A pattern as an expected list names it.
struct PatternLink: Decodable, Hashable, Sendable {
  let id: String
  let nextDay: String?
}

struct VectorOrder: Decodable, Sendable {
  let sequence: [String]
  let start: Day
  let anchor: Day?
  let holidaysOff: Bool?
  let holidayShift: String?

  var order: RepeatOrder {
    RepeatOrder(
      sequence: sequence, start: start, anchor: anchor, holidaysOff: holidaysOff ?? false,
      holidayShift: holidayShift, holidayCountry: "JP")
  }
}

func byDay<Value>(_ values: [String: Value]) -> [Day: Value] {
  Dictionary(uniqueKeysWithValues: values.map { (Day($0.key)!, $0.value) })
}

func book(_ patterns: [VectorPattern]) -> [PatternID: Pattern] {
  Dictionary(uniqueKeysWithValues: patterns.map { ($0.id, $0.pattern) })
}

struct RepeatVectors: Decodable, Sendable {
  struct Schedule: VectorCase {
    let name: String
    let sequence: [String]
    let anchor: Day
    let from: Day
    let to: Day
    let holidays: String?
    let holidayShift: String?
    let expected: [String: String]
  }

  struct Shown: VectorCase {
    let name: String
    let orders: [VectorOrder]
    let patterns: [String]
    let own: [String: VectorDay]
    let from: Day
    let to: Day
    let expected: [String: String]
  }

  struct HolidaysOffByDefault: VectorCase {
    let name: String
    let sequence: [String]
    let start: Day
    let daysOff: [String]
    let expected: Bool
  }

  struct HolidayShift: VectorCase {
    let name: String
    let patterns: [VectorPattern]
    let picked: String?
    let expected: String?
  }

  struct Added: VectorCase {
    let name: String
    let orders: [VectorOrder]
    let order: VectorOrder
    let expected: [VectorOrder]
  }

  let schedule: [Schedule]
  let shown: [Shown]
  let holidaysOffByDefault: [HolidaysOffByDefault]
  struct Put: VectorCase {
    let name: String
    let orders: [VectorOrder]
    let order: VectorOrder
    let replacing: Day?
    let expected: [VectorOrder]
  }

  struct Removed: VectorCase {
    let name: String
    let orders: [VectorOrder]
    let start: Day
    let expected: [VectorOrder]
  }

  let holidayShift: [HolidayShift]
  let added: [Added]
  let put: [Put]
  let removed: [Removed]
}

@Test(arguments: try vectors("repeat", as: RepeatVectors.self).schedule)
func schedule(_ vector: RepeatVectors.Schedule) {
  let days = repeatSchedule(
    vector.sequence, anchor: vector.anchor, from: vector.from, through: vector.to,
    holidayShift: vector.holidayShift, holidayCountry: vector.holidays ?? "JP")
  #expect(days == byDay(vector.expected))
}

@Test(arguments: try vectors("repeat", as: RepeatVectors.self).shown)
func shown(_ vector: RepeatVectors.Shown) {
  let planned = plannedShifts(
    orders: vector.orders.map(\.order), known: Set(vector.patterns), from: vector.from,
    through: vector.to)
  let shown = shownDays(
    own: byDay(vector.own).mapValues(\.own), planned: planned, known: Set(vector.patterns))
    .filter { $0.key >= vector.from && $0.key <= vector.to }
  #expect(shown.mapValues(\.shift) == byDay(vector.expected))
}

@Test(arguments: try vectors("repeat", as: RepeatVectors.self).holidaysOffByDefault)
func holidaysOffByDefault(_ vector: RepeatVectors.HolidaysOffByDefault) {
  let patterns = Dictionary(
    vector.sequence.map { id in
      (id, Pattern(id: id, name: "", emoji: "", symbol: "", icon: "", color: 0,
        countsAsOff: vector.daysOff.contains(id)))
    },
    uniquingKeysWith: { first, _ in first })
  #expect(
    holidaysOffByDefault(vector.sequence, start: vector.start, patterns: patterns)
      == vector.expected)
}

@Test(arguments: try vectors("repeat", as: RepeatVectors.self).holidayShift)
func holidayShift(_ vector: RepeatVectors.HolidayShift) {
  #expect(
    holidayShift(of: vector.patterns.map(\.pattern), picked: vector.picked) == vector.expected)
}

@Test(arguments: try vectors("repeat", as: RepeatVectors.self).added)
func added(_ vector: RepeatVectors.Added) {
  let added = orders(vector.orders.map(\.order), adding: vector.order.order)
  #expect(added == vector.expected.map(\.order))
}

@Test(arguments: try vectors("repeat", as: RepeatVectors.self).put)
func put(_ vector: RepeatVectors.Put) {
  let put = orders(
    vector.orders.map(\.order), putting: vector.order.order, replacing: vector.replacing)
  #expect(put == vector.expected.map(\.order))
}

@Test(arguments: try vectors("repeat", as: RepeatVectors.self).removed)
func removed(_ vector: RepeatVectors.Removed) {
  #expect(orders(vector.orders.map(\.order), removing: vector.start) == vector.expected.map(\.order))
}

struct OwnDaysVectors: Decodable, Sendable {
  struct Edited: VectorCase {
    let name: String
    let own: [String: VectorDay]
    let planned: [String: String]
    let edits: [String: VectorDay?]
    let expected: [String: VectorDay]
  }

  struct GivenToOrder: VectorCase {
    let name: String
    let own: [String: VectorDay]
    let start: Day
    let expected: [String: VectorDay]
  }

  let edited: [Edited]
  let givenToOrder: [GivenToOrder]
}

@Test(arguments: try vectors("own-days", as: OwnDaysVectors.self).edited)
func edited(_ vector: OwnDaysVectors.Edited) {
  let edited = editedOwnDays(
    own: byDay(vector.own).mapValues(\.own), planned: byDay(vector.planned),
    edits: byDay(vector.edits).mapValues { $0?.entry })
  #expect(edited == byDay(vector.expected).mapValues(\.own))
}

@Test(arguments: try vectors("own-days", as: OwnDaysVectors.self).givenToOrder)
func givenToOrder(_ vector: OwnDaysVectors.GivenToOrder) {
  let given = givingDaysToOrder(own: byDay(vector.own).mapValues(\.own), from: vector.start)
  #expect(given == byDay(vector.expected).mapValues(\.own))
}

struct EnteringVectors: Decodable, Sendable {
  struct Enter: VectorCase {
    let name: String
    let patterns: [VectorPattern]
    let days: [String: VectorDay]
    let date: Day
    let shift: String?
    let expected: [String: VectorDay]
    let selects: Day
  }

  struct Gaps: VectorCase {
    let name: String
    let days: [Day]
    let month: String
    let expected: [Day]
  }

  let enter: [Enter]
  let gaps: [Gaps]
}

@Test(arguments: try vectors("entering", as: EnteringVectors.self).enter)
func enter(_ vector: EnteringVectors.Enter) {
  let patterns = book(vector.patterns)
  let after = enteringShift(
    vector.shift, on: vector.date, in: byDay(vector.days).mapValues(\.entry),
    patterns: patterns)
  #expect(after == byDay(vector.expected).mapValues(\.entry))
  #expect(selectedAfterEntering(vector.shift, on: vector.date, patterns: patterns) == vector.selects)
}

@Test(arguments: try vectors("entering", as: EnteringVectors.self).gaps)
func gaps(_ vector: EnteringVectors.Gaps) {
  let days = Dictionary(uniqueKeysWithValues: vector.days.map { ($0, DayEntry(shift: "day")) })
  #expect(gapDays(in: Day("\(vector.month)-01")!, days: days) == vector.expected)
}

struct PatternsVectors: Decodable, Sendable {
  struct Deleted: VectorCase {
    struct Expected: Decodable, Sendable {
      let patterns: [PatternLink]
    }

    let name: String
    let patterns: [VectorPattern]
    let id: String
    let expected: Expected
  }

  struct NewJob: VectorCase {
    struct Expected: Decodable, Sendable {
      let patterns: [PatternLink]
      let sequence: [String]
    }

    let name: String
    let own: [VectorPattern]
    let incoming: [VectorPattern]
    let sequence: [String]
    let usedBefore: [String]
    let expected: Expected
  }

  let deleted: [Deleted]
  let newJob: [NewJob]
}

func links(_ patterns: [Pattern]) -> [PatternLink] {
  patterns.map { PatternLink(id: $0.id, nextDay: $0.nextDay) }
}

@Test(arguments: try vectors("patterns", as: PatternsVectors.self).deleted)
func deleted(_ vector: PatternsVectors.Deleted) {
  let left = patterns(vector.patterns.map(\.pattern), without: vector.id)
  #expect(links(left) == vector.expected.patterns)
}

@Test(arguments: try vectors("patterns", as: PatternsVectors.self).newJob)
func newJob(_ vector: PatternsVectors.NewJob) {
  var fresh = 0
  let changed = patternsForJob(
    own: vector.own.map(\.pattern), incoming: vector.incoming.map(\.pattern),
    sequence: vector.sequence, usedBefore: vector.usedBefore.contains
  ) {
    fresh += 1
    return "new-\(fresh)"
  }
  #expect(links(changed.patterns) == vector.expected.patterns)
  #expect(changed.sequence == vector.expected.sequence)
}

struct TimeChangeVectors: Decodable, Sendable {
  struct Case: VectorCase {
    struct Expected: Decodable, Sendable {
      let early: Bool
      let late: Bool
    }

    let name: String
    let time: [String]?
    let start: String?
    let end: String?
    let expected: Expected?
  }

  let cases: [Case]
}

@Test(arguments: try vectors("time-change", as: TimeChangeVectors.self).cases)
func timeChange(_ vector: TimeChangeVectors.Case) {
  let change = timeChange(
    start: vector.start, end: vector.end,
    standard: vector.time.map { ShiftTime(start: $0[0], end: $0[1]) })
  #expect(change == vector.expected.map { TimeChange(early: $0.early, late: $0.late) })
}
