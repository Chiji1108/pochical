import PochicalProto
import SQLiteData
import Testing

@testable import PochicalKit

// heldBackBy is the server's to check: only it keeps clears.
struct OrderClearsVectors: Decodable, Sendable {
  struct GivesWay: VectorCase {
    let name: String
    let floor: OrderFloor
    let date: String
    let field: String
    let set: Clock
    let expected: Bool
  }

  let givesWay: [GivesWay]
}

/// A DayField named as the vectors name it, without the DAY_FIELD_ prefix.
private func dayField(_ name: String) -> Pochical_V1_DayField {
  let fields: [String: Pochical_V1_DayField] = [
    "PATTERN": .pattern, "START": .start, "END": .end, "NOTE": .note, "PEOPLE": .people,
  ]
  return fields[name] ?? .unspecified
}

@Test(arguments: try vectors("order-clears", as: OrderClearsVectors.self).givesWay)
func givesWay(_ vector: OrderClearsVectors.GivesWay) {
  let given = givesWay(
    date: vector.date, field: dayField(vector.field), set: vector.set, floor: vector.floor)
  #expect(given == vector.expected)
}

/// A day's pattern as the server sends it, set at `ms` by `device`.
private func serverPattern(_ pattern: String, on date: String, ms: Int64, device: String)
  -> Pochical_V1_Change
{
  var day = Pochical_V1_DayValue()
  day.date = date
  day.field = .pattern
  day.value = pattern
  day.hlc.physicalMs = ms
  day.hlc.deviceID = device
  var change = Pochical_V1_Change()
  change.day = day
  return change
}

@Test func aWaitingNewOrderHidesOnlyWhatWasSetBeforeIt() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    let start = Day("2026-11-01")!
    try OwnValues.take(serverPattern("night", on: "2026-11-03", ms: 1_000, device: "ipad"), in: db)
    try OwnValues.start(
      RepeatOrder(sequence: ["day", "off"], start: start, holidayCountry: "JP"), now: 5_000, in: db)
    #expect(try DayRow.find("2026-11-03").fetchOne(db)?.pattern == nil)

    // While the order waits, another device's day set before it stays
    // hidden, and one set after it shows.
    try OwnValues.take(serverPattern("off", on: "2026-11-04", ms: 2_000, device: "ipad"), in: db)
    try OwnValues.take(serverPattern("night", on: "2026-11-05", ms: 9_000, device: "ipad"), in: db)
    #expect(try DayRow.find("2026-11-04").fetchOne(db)?.pattern == nil)
    #expect(try DayRow.find("2026-11-05").fetchOne(db)?.pattern == "night")

    // Acknowledged without the server's clears, as when newer orders won:
    // the days show the server's values again.
    let waiting = try OutboxEdit.all.fetchAll(db).map(\.opID)
    try OwnValues.acknowledge(waiting, in: db)
    #expect(try DayRow.find("2026-11-03").fetchOne(db)?.pattern == "night")
    #expect(try DayRow.find("2026-11-04").fetchOne(db)?.pattern == "off")
    #expect(try DayRow.find("2026-11-05").fetchOne(db)?.pattern == "night")
  }
}

@Test func afterItsAckedADayNewerThanTheOrderKeptByTheServerShows() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    try OwnValues.start(
      RepeatOrder(sequence: ["day", "off"], start: Day("2026-11-01")!, holidayCountry: "JP"),
      now: 5_000, in: db)
    try OwnValues.take(serverPattern("night", on: "2026-11-05", ms: 9_000, device: "ipad"), in: db)
    try OwnValues.acknowledge(try OutboxEdit.all.fetchAll(db).map(\.opID), in: db)
    #expect(try OutboxEdit.all.fetchCount(db) == 0)
    #expect(try DayRow.find("2026-11-05").fetchOne(db)?.pattern == "night")
  }
}

@Test func aRestampedOrderTakesBackWhatItsNewClockComesAfter() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    try OwnValues.start(
      RepeatOrder(sequence: ["day", "off"], start: Day("2026-11-01")!, holidayCountry: "JP"),
      now: 5_000, in: db)
    try OwnValues.take(serverPattern("night", on: "2026-11-05", ms: 9_000, device: "ipad"), in: db)
    #expect(try DayRow.find("2026-11-05").fetchOne(db)?.pattern == "night")

    // CODE_CLOCK_AHEAD: the waiting order takes a clock after the 9_000 day.
    try Sync.restamp(now: 20_000, in: db)
    #expect(try DayRow.find("2026-11-05").fetchOne(db)?.pattern == nil)
  }
}
