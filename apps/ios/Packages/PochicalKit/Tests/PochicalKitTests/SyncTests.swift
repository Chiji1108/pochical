import PochicalProto
import SQLiteData
import Testing

@testable import PochicalKit

struct ReconnectVectors: Decodable, Sendable {
  struct WaitMost: VectorCase {
    let name: String
    let tries: Int
    let firstMs: Int
    let mostMs: Int
    let expected: Int
  }

  let waitMost: [WaitMost]
}

@Test(arguments: try vectors("reconnect", as: ReconnectVectors.self).waitMost)
func waitMost(_ vector: ReconnectVectors.WaitMost) {
  let most = reconnectWaitMost(tries: vector.tries, firstMs: vector.firstMs, mostMs: vector.mostMs)
  #expect(most == vector.expected)
}

/// A change to one day field at `cursor`, with a clock.
private func change(_ value: String, cursor: UInt64, ms: Int64) -> Pochical_V1_Change {
  var change = dayChange(value)
  change.cursor = cursor
  var hlc = Pochical_V1_Hlc()
  hlc.physicalMs = ms
  hlc.deviceID = "other"
  change.day.hlc = hlc
  return change
}

@Test func takingChangesMovesTheCursorAndTheClock() throws {
  let database = try appDatabase()
  try database.write { db in
    #expect(try Sync.cursor(in: db) == 0)
    try Sync.take([change("day", cursor: 4, ms: 9_000), change("night", cursor: 7, ms: 5_000)], in: db)
    #expect(try Sync.cursor(in: db) == 7)
    #expect(try DayRow.find("2026-10-01").fetchOne(db)?.pattern == "night")
    // The next edit orders after the latest clock taken.
    let next = try OwnValues.nextClock(now: 1_000, in: db)
    #expect(next.physicalMs == 9_000)
    #expect(next.counter == 1)
  }
}

@Test func aResetStartsTheCursorAgainAndKeepsTheOutbox() throws {
  let database = try appDatabase()
  try database.write { db in
    try Sync.take([change("day", cursor: 4, ms: 9_000)], in: db)
    try OwnValues.edit(dayChange("night"), opID: "a", in: db)
    try Sync.reset(in: db)
    #expect(try Sync.cursor(in: db) == 0)
    #expect(try DayRow.find("2026-10-01").fetchOne(db)?.pattern == "night")
  }
}

@Test func welcomeCorrectsTheDevicesTime() throws {
  let database = try appDatabase()
  try database.write { db in
    try Sync.welcome(sentMs: 1_000, receivedMs: 1_200, serverMs: 5_000, in: db)
    let next = try OwnValues.nextClock(now: 1_300, in: db)
    #expect(next.physicalMs == 5_200)
  }
}
