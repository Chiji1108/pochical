import PochicalProto
import SQLiteData
import Testing

@testable import PochicalKit

struct LocalEditsVectors: Decodable, Sendable {
  struct Case: VectorCase {
    let name: String
    let steps: [Step]
  }

  /// One event, and what the device shows after it.
  struct Step: Decodable, Sendable {
    enum Event: Sendable {
      case edit(op: String, value: String?)
      case change(String?)
      case acked([String])
      case reset
    }

    struct Edit: Decodable, Sendable {
      let op: String
      let value: String?
    }

    enum Keys: String, CodingKey {
      case edit, change, acked, reset, shows
    }

    let event: Event
    let shows: String?

    init(from decoder: any Decoder) throws {
      let container = try decoder.container(keyedBy: Keys.self)
      shows = try container.decodeIfPresent(String.self, forKey: .shows)
      if let edit = try container.decodeIfPresent(Edit.self, forKey: .edit) {
        event = .edit(op: edit.op, value: edit.value)
      } else if container.contains(.change) {
        event = .change(try container.decodeIfPresent(String.self, forKey: .change))
      } else if let acked = try container.decodeIfPresent([String].self, forKey: .acked) {
        event = .acked(acked)
      } else {
        event = .reset
      }
    }
  }

  let cases: [Case]
}

/// A change to one day field, the value the vectors follow.
func dayChange(_ value: String?) -> Pochical_V1_Change {
  var day = Pochical_V1_DayValue()
  day.date = "2026-10-01"
  day.field = .pattern
  if let value {
    day.value = value
  }
  var change = Pochical_V1_Change()
  change.day = day
  return change
}

@Test(arguments: try vectors("local-edits", as: LocalEditsVectors.self).cases)
func localEdits(_ vector: LocalEditsVectors.Case) throws {
  let database = try appDatabase()
  for step in vector.steps {
    let shown = try database.write { db in
      switch step.event {
      case .edit(let op, let value):
        try OwnValues.edit(dayChange(value), opID: op, in: db)
      case .change(let value):
        try OwnValues.take(dayChange(value), in: db)
      case .acked(let ops):
        try OwnValues.acknowledge(ops, in: db)
      case .reset:
        try OwnValues.reset(in: db)
      }
      return try DayRow.find("2026-10-01").fetchOne(db)?.pattern
    }
    #expect(shown == step.shows, "after \(step.event)")
  }
}

@Test func readsTheValuesAsTheDayLogicTakesThem() throws {
  let database = try appDatabase()
  try database.write { db in
    var night = Pochical_V1_Pattern()
    night.name = "夜勤"
    night.start = "16:30"
    night.end = "09:30"
    night.nextDay = "after"
    var after = Pochical_V1_Pattern()
    after.name = "明け"
    for (id, pattern) in [("night", night), ("after", after)] {
      var value = Pochical_V1_PatternValue()
      value.id = id
      value.pattern = pattern
      var change = Pochical_V1_Change()
      change.pattern = value
      try OwnValues.take(change, in: db)
    }
    var order = Pochical_V1_PatternOrder()
    order.ids = ["after", "night"]
    var change = Pochical_V1_Change()
    change.patternOrder = order
    try OwnValues.take(change, in: db)

    var repeatOrder = Pochical_V1_RepeatOrder()
    repeatOrder.start = "2026-10-01"
    repeatOrder.sequence = ["night", "after"]
    repeatOrder.holidayCountry = "JP"
    var orders = Pochical_V1_RepeatOrders()
    orders.orders = [repeatOrder]
    change = Pochical_V1_Change()
    change.repeatOrders = orders
    try OwnValues.take(change, in: db)

    var people = Pochical_V1_DayValue()
    people.date = "2026-10-02"
    people.field = .people
    people.value = "c1 c2"
    change = Pochical_V1_Change()
    change.day = people
    try OwnValues.edit(change, opID: "a", in: db)
  }
  try database.read { db in
    #expect(try OwnValues.patterns(in: db).map(\.id) == ["after", "night"])
    #expect(try OwnValues.patterns(in: db).last?.time == ShiftTime(start: "16:30", end: "09:30"))
    #expect(
      try OwnValues.repeatOrders(in: db)
        == [RepeatOrder(sequence: ["night", "after"], start: Day("2026-10-01")!, holidayCountry: "JP")])
    let days = try OwnValues.ownDays(from: Day("2026-10-01")!, through: Day("2026-10-31")!, in: db)
    #expect(days == [Day("2026-10-02")!: OwnDay(people: ["c1", "c2"])])
  }
}

@Test func aDayWithEveryFieldClearedHasNoRow() throws {
  let database = try appDatabase()
  try database.write { db in
    try OwnValues.edit(dayChange("day"), opID: "a", in: db)
    try OwnValues.edit(dayChange(nil), opID: "b", in: db)
    #expect(try DayRow.fetchCount(db) == 0)
  }
}
