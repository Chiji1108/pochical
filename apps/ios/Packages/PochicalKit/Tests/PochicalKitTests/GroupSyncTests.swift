import PochicalDesign
import PochicalProto
import SQLiteData
import Testing

@testable import PochicalKit

private func change(_ cursor: UInt64, _ fill: (inout Pochical_V1_Change) -> Void)
  -> Pochical_V1_Change
{
  var change = Pochical_V1_Change()
  change.cursor = cursor
  fill(&change)
  return change
}

@Test func aGroupsMembersAndTheirShiftsComeFromItsSocket() throws {
  let database = try appDatabase()
  try database.write { db in
    var night = Pochical_V1_Pattern()
    night.name = "夜勤"
    night.emoji = "🌙"
    var order = Pochical_V1_RepeatOrder()
    order.start = "2026-10-01"
    order.sequence = ["night"]
    try GroupSync.take(
      [
        change(1) {
          $0.member.userID = "u1"
          $0.member.displayName = "さくら"
          $0.member.joinedAtMs = 1
        },
        change(2) {
          $0.memberPattern.userID = "u1"
          $0.memberPattern.pattern.id = "night"
          $0.memberPattern.pattern.pattern = night
        },
        change(3) {
          $0.memberRepeatOrders.userID = "u1"
          $0.memberRepeatOrders.orders.orders = [order]
        },
        change(4) {
          $0.memberDay.userID = "u1"
          $0.memberDay.day.date = "2026-10-03"
          $0.memberDay.day.field = .pattern
          $0.memberDay.day.value = Days.noShift
        },
        // A memo pushed to a group is never kept.
        change(5) {
          $0.memberDay.userID = "u1"
          $0.memberDay.day.date = "2026-10-02"
          $0.memberDay.day.field = .note
          $0.memberDay.day.value = "ひみつ"
        },
      ], of: "g1", in: db)
    #expect(try GroupSync.cursor(of: "g1", in: db) == 5)

    let october = (Day(year: 2026, month: 10, day: 1), Day(year: 2026, month: 10, day: 31))
    let members = try GroupSync.members(of: "g1", from: october.0, through: october.1, in: db)
    #expect(members.map(\.name) == ["さくら"])
    let shown = try #require(members.first).calendar.shown(
      from: Day(year: 2026, month: 10, day: 1), through: Day(year: 2026, month: 10, day: 3))
    // The order fills the days; the day cleared on purpose stays empty.
    #expect(shown[Day(year: 2026, month: 10, day: 1)]?.shift == "night")
    #expect(shown[Day(year: 2026, month: 10, day: 2)]?.note == nil)
    #expect(shown[Day(year: 2026, month: 10, day: 3)] == nil)

    try GroupSync.reset("g1", in: db)
    #expect(try GroupSync.members(of: "g1", from: october.0, through: october.1, in: db).isEmpty)
    #expect(try GroupSync.cursor(of: "g1", in: db) == 0)
  }
}
