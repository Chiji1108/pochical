import PochicalDesign
import PochicalProto
import SQLiteData
import Testing

@testable import PochicalKit

/// 日勤, 夜勤 with 明け after it and 休み, ordered 日勤 every day from
/// October 2026.
func calendarWithAnOrder() throws -> any DatabaseWriter {
  let database = try appDatabase()
  try database.write { db in
    for (id, nextDay, off) in [("day", nil, false), ("night", "after", false), ("after", nil, false), ("off", nil, true)] {
      var pattern = Pochical_V1_Pattern()
      pattern.name = id
      pattern.countsAsOff = off
      if let nextDay {
        pattern.nextDay = nextDay
      }
      var value = Pochical_V1_PatternValue()
      value.id = id
      value.pattern = pattern
      var change = Pochical_V1_Change()
      change.pattern = value
      try OwnValues.take(change, in: db)
    }
    var order = Pochical_V1_RepeatOrder()
    order.start = "2026-10-01"
    order.sequence = ["day"]
    order.holidayCountry = "JP"
    var orders = Pochical_V1_RepeatOrders()
    orders.orders = [order]
    var change = Pochical_V1_Change()
    change.repeatOrders = orders
    try OwnValues.take(change, in: db)
  }
  return database
}

private func outbox(_ db: Database) throws -> [Pochical_V1_DayValue] {
  try OutboxEdit.order(by: \.id).fetchAll(db).map { edit in
    try Pochical_V1_Change(serializedBytes: edit.change).day
  }
}

@Test func enteringTheOrdersOwnShiftEditsNothing() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    try OwnValues.enter("day", on: Day("2026-10-05")!, now: 1000, in: db)
    #expect(try outbox(db).isEmpty)
  }
}

@Test func aNextDayIsEnteredWithItsShift() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    try OwnValues.enter("night", on: Day("2026-10-05")!, now: 1000, in: db)
    let edits = try outbox(db)
    #expect(edits.map(\.date) == ["2026-10-05", "2026-10-06"])
    #expect(edits.map(\.value) == ["night", "after"])
    #expect(edits.allSatisfy { $0.field == .pattern })
    let days = try OwnValues.ownDays(
      from: Day("2026-10-01")!, through: Day("2026-10-31")!, in: db)
    #expect(days[Day("2026-10-06")!]?.shift == "after")
  }
}

@Test func clearingADayTheOrderFillsKeepsNoShift() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    try OwnValues.enter(nil, on: Day("2026-10-05")!, now: 1000, in: db)
    let edits = try outbox(db)
    #expect(edits.count == 1)
    #expect(edits[0].value == Days.noShift)
    #expect(edits[0].hasValue)
  }
}

@Test func fillingBlanksPutsTheShiftOnEach() throws {
  let database = try appDatabase()
  try database.write { db in
    try OwnValues.fill([Day("2026-10-02")!, Day("2026-10-03")!], with: "off", now: 1000, in: db)
    #expect(try outbox(db).map(\.date) == ["2026-10-02", "2026-10-03"])
  }
}

@Test func editsTickTheDevicesClock() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    try OwnValues.enter("night", on: Day("2026-10-05")!, now: 1000, in: db)
    try OwnValues.enter("off", on: Day("2026-10-10")!, now: 900, in: db)
    let clocks = try outbox(db).map(\.hlc)
    #expect(clocks.map(\.physicalMs) == [1000, 1000, 1000])
    #expect(clocks.map(\.counter) == [0, 1, 2])
    #expect(Set(clocks.map(\.deviceID)).count == 1)
    #expect(clocks[0].deviceID.count == 36)
  }
}

@Test func aDaysDetailEditsOnlyTheFieldsItChanges() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    let day = Day("2026-10-05")!
    try OwnValues.set(day, to: DayEntry(shift: "day", end: "20:00", note: "棚卸し"), now: 1000, in: db)
    let edits = try outbox(db)
    #expect(edits.map(\.field) == [.end, .note])
    #expect(try OwnValues.ownDays(from: day, through: day, in: db)[day]
      == OwnDay(end: "20:00", note: "棚卸し"))
  }
}

@Test func addsCoworkersAtTheEndOfTheList() throws {
  let database = try appDatabase()
  try database.write { db in
    let first = try OwnValues.addCoworker(named: "さとう", now: 1000, in: db)
    let second = try OwnValues.addCoworker(named: "たなか", now: 1000, in: db)
    #expect(try OwnValues.coworkers(in: db).map(\.id) == [first, second])
    #expect(try OwnValues.coworkers(in: db).map(\.name) == ["さとう", "たなか"])
  }
}

@Test func aMemoIsSetOnADayWithoutAShift() throws {
  let database = try appDatabase()
  try database.write { db in
    let day = Day("2026-10-05")!
    try OwnValues.setNote(day, to: "歯医者", now: 1000, in: db)
    try OwnValues.setNote(day, to: "歯医者", now: 1000, in: db)
    #expect(try outbox(db).map(\.field) == [.note])
    #expect(try OwnValues.ownDays(from: day, through: day, in: db)[day] == OwnDay(note: "歯医者"))
    try OwnValues.setNote(day, to: "", now: 1000, in: db)
    #expect(try OwnValues.ownDays(from: day, through: day, in: db).isEmpty)
  }
}

@Test func clearingADayKeepsItsMemo() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    let day = Day("2026-10-05")!
    try OwnValues.set(day, to: DayEntry(shift: "night", note: "棚卸し"), now: 1000, in: db)
    try OwnValues.enter(nil, on: day, now: 1000, in: db)
    #expect(try OwnValues.ownDays(from: day, through: day, in: db)[day]
      == OwnDay(shift: Days.noShift, note: "棚卸し"))
  }
}
