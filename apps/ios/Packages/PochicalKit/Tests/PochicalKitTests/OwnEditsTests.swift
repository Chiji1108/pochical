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

@Test func patternsAreAddedLastAndDeletedFromTheList() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    let gym = Pattern(id: "gym", name: "ジム", emoji: "⭐️", symbol: "ジ", icon: "letter", color: 4)
    try OwnValues.save(gym, now: 1, in: db)
    #expect(try OwnValues.patterns(in: db).last?.id == "gym")

    try OwnValues.deletePattern("off", now: 2, in: db)
    #expect(try !OwnValues.patterns(in: db).map(\.id).contains("off"))
  }
}

@Test func aPatternInTheOrderInUseIsKeptAndItsDaysAreCounted() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    #expect(try OwnValues.isRepeating("day", in: db))
    #expect(try !OwnValues.isRepeating("night", in: db))
    // 夜勤 and the 明け it brings on the day after.
    try OwnValues.enter("night", on: Day("2026-10-05")!, now: 1, in: db)
    #expect(try OwnValues.daysShowing("night", in: db) == 1)
    #expect(try OwnValues.daysShowing("after", in: db) == 1)
    #expect(try OwnValues.daysShowing("off", in: db) == 0)
  }
}

@Test func coworkersAreRenamedReorderedAndDeletedWithTheirDaysCounted() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    let aya = try OwnValues.addCoworker(named: "あや", now: 1, in: db)
    let ken = try OwnValues.addCoworker(named: "けん", now: 2, in: db)
    try OwnValues.set(
      Day("2026-10-05")!, to: DayEntry(shift: "night", people: [aya]), now: 3, in: db)
    #expect(try OwnValues.daysWithCoworker(aya, in: db) == 1)
    #expect(try OwnValues.daysWithCoworker(ken, in: db) == 0)

    try OwnValues.renameCoworker(aya, to: "あやか", now: 4, in: db)
    try OwnValues.orderCoworkers([ken, aya], now: 5, in: db)
    #expect(try OwnValues.coworkers(in: db).map(\.name) == ["けん", "あやか"])

    try OwnValues.deleteCoworker(ken, now: 6, in: db)
    #expect(try OwnValues.coworkers(in: db).map(\.name) == ["あやか"])
  }
}

@Test func aStartedOrderTakesTheDaysFromItsStart() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    let before = Day("2026-10-20")!
    let after = Day("2026-11-03")!
    try OwnValues.enter("night", on: before, now: 1, in: db)
    try OwnValues.enter("night", on: after, now: 2, in: db)
    try OwnValues.setNote(after, to: "歯医者", now: 3, in: db)

    let switched = RepeatOrder(
      sequence: ["day", "off"], start: Day("2026-11-01")!, holidayCountry: "JP")
    try OwnValues.start(switched, now: 4, in: db)
    #expect(try OwnValues.repeatOrders(in: db).map(\.start.key) == ["2026-10-01", "2026-11-01"])
    // The day before the switch keeps its shift; after it, only the memo.
    #expect(try DayRow.find(before.key).fetchOne(db)?.pattern == "night")
    #expect(try DayRow.find(after.key).fetchOne(db)?.pattern == nil)
    #expect(try DayRow.find(after.key).fetchOne(db)?.note == "歯医者")
  }
}

@Test func periodsArePutMovedAndTakenOutKeepingTheDaysEntered() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    let entered = Day("2026-11-03")!
    try OwnValues.enter("night", on: entered, now: 1, in: db)
    let later = RepeatOrder(
      sequence: ["off"], start: Day("2026-12-01")!, holidayCountry: "JP")
    try OwnValues.put(later, now: 2, in: db)
    let between = RepeatOrder(
      sequence: ["day", "off"], start: Day("2026-11-01")!, holidayCountry: "JP")
    try OwnValues.put(between, now: 3, in: db)
    #expect(
      try OwnValues.repeatOrders(in: db).map(\.start.key)
        == ["2026-10-01", "2026-11-01", "2026-12-01"])
    // The day entered stays over the period put under it.
    #expect(try DayRow.find(entered.key).fetchOne(db)?.pattern == "night")

    var moved = between
    moved.start = Day("2026-11-05")!
    moved.anchor = between.start
    try OwnValues.put(moved, replacing: between.start, now: 4, in: db)
    #expect(
      try OwnValues.repeatOrders(in: db).map(\.start.key)
        == ["2026-10-01", "2026-11-05", "2026-12-01"])

    try OwnValues.setHolidaysOff(true, from: moved.start, now: 5, in: db)
    #expect(
      try OwnValues.repeatOrders(in: db).first { $0.start == moved.start }?.holidayShift == "off")

    try OwnValues.remove(moved.start, now: 6, in: db)
    #expect(try OwnValues.repeatOrders(in: db).map(\.start.key) == ["2026-10-01", "2026-12-01"])
  }
}

@Test func aNewJobTakesOverThePatternsKeepingThoseOnDaysBefore() throws {
  let database = try calendarWithAnOrder()
  try database.write { db in
    // 日勤 repeats from October; 夜勤 and its 明け were entered once.
    try OwnValues.enter("night", on: Day("2026-10-20")!, now: 1, in: db)
    let ids: Set<PatternID> = ["duty", "offDuty", "off"]
    let incoming = ["duty", "offDuty", "off"].compactMap(ReadyPatterns.pattern).map {
      Pattern($0, keeping: ids)
    }
    let start = Day("2026-11-01")!
    try OwnValues.changeJob(
      to: incoming, sequence: ["duty", "offDuty", "off"], start: start, anchor: start,
      holidayCountry: "JP", now: 2, in: db)
    let names = try OwnValues.patterns(in: db).map(\.name)
    // The new job's first; 日勤, 夜勤 and 明け stay for the days before.
    #expect(Array(names.prefix(3)) == ["当番", "非番", "休み"])
    #expect(Set(names.dropFirst(3)) == ["day", "night", "after"])
    #expect(try OwnValues.repeatOrders(in: db).last?.sequence.count == 3)
  }
}

@Test func theFirstRunGivesAKindOfWorksPatternsAndItsOrderFromTheMonthBefore() throws {
  let database = try appDatabase()
  try database.write { db in
    let ids: Set<PatternID> = ["duty", "offDuty", "off"]
    let incoming = ["duty", "offDuty", "off"].compactMap(ReadyPatterns.pattern).map {
      Pattern($0, keeping: ids)
    }
    try OwnValues.begin(
      with: incoming, sequence: ["duty", "offDuty", "off"], anchor: Day("2026-10-20")!,
      today: Day("2026-10-09")!, holidayCountry: "JP", now: 1, in: db)
    #expect(try OwnValues.patterns(in: db).map(\.name) == ["当番", "非番", "休み"])
    let orders = try OwnValues.repeatOrders(in: db)
    #expect(orders.count == 1)
    #expect(orders.first?.start == Day("2026-09-01"))
    #expect(orders.first?.anchor == Day("2026-10-20"))
  }
}

@Test func theFirstRunWithoutAnOrderGivesOnlyPatterns() throws {
  let database = try appDatabase()
  try database.write { db in
    let ids: Set<PatternID> = ["day", "off"]
    let incoming = ["day", "off"].compactMap(ReadyPatterns.pattern).map {
      Pattern($0, keeping: ids)
    }
    try OwnValues.begin(
      with: incoming, sequence: [], anchor: Day("2026-10-09")!, today: Day("2026-10-09")!,
      holidayCountry: "JP", now: 1, in: db)
    #expect(try OwnValues.patterns(in: db).count == 2)
    #expect(try OwnValues.repeatOrders(in: db).isEmpty)
  }
}
