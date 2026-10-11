import Foundation
import SQLiteData
import Testing

@testable import PochicalKit

// Who a widget is set to (spec/widgets.md, 次の休み with someone or a group):
// read from the groups the device holds, by the group they were picked
// under, and asked for again once either has left it.

/// A group of me, あや and けん, あや off tomorrow.
private func groupOfThree(_ db: Database, today: Day) throws {
  try GroupRow.insert { GroupRow(id: "g", name: "家族", emoji: "🏠", joinedAtMs: 1) }.execute(db)
  for (index, (user, name)) in [("me", "わたし"), ("aya", "あや"), ("ken", "けん")].enumerated() {
    try GroupMemberRow.insert {
      GroupMemberRow(groupID: "g", userID: user, displayName: name, joinedAtMs: Int64(index))
    }
    .execute(db)
  }
  try MemberPatternRow.insert {
    MemberPatternRow(
      groupID: "g", userID: "aya", id: "off", name: "休み", emoji: "🌿", symbol: "休",
      icon: "leaf", color: 1, countsAsOff: true)
  }
  .execute(db)
  try MemberDayRow.insert {
    MemberDayRow(groupID: "g", userID: "aya", date: today.adding(days: 1).key, pattern: "off")
  }
  .execute(db)
}

@Test func choicesKeepTheirGroupAndUser() {
  for choice in [WidgetChoice.group("g"), .member(groupID: "g", userID: "aya")] {
    #expect(WidgetChoice(id: choice.id) == choice)
  }
  #expect(WidgetChoice(id: "x:g") == nil)
}

@Test func choicesListEachGroupWithoutThePerson() throws {
  let database = try appDatabase()
  try database.write { db in
    try groupOfThree(db, today: .today)
    let choices = try widgetChoices(me: "me", in: db)
    #expect(choices.map(\.group.name) == ["家族"])
    #expect(choices[0].members.map(\.displayName) == ["あや", "けん"])
  }
}

@Test func someonePickedCountsTheirDaysAndAGroupItsOthers() throws {
  let database = try appDatabase()
  try database.write { db in
    let today = Day.today
    try groupOfThree(db, today: today)
    let aya = try #require(
      try widgetCompanion(.member(groupID: "g", userID: "aya"), me: "me", around: today, in: db))
    #expect(aya.with.kind == .person)
    #expect(aya.with.name == "あや")
    #expect(aya.people.map(\.userID) == ["aya"])
    #expect(aya.people[0].offDays(from: today, through: today.adding(days: 1)) == [today.adding(days: 1): true])
    let family = try #require(try widgetCompanion(.group("g"), me: "me", around: today, in: db))
    #expect(family.with.kind == .group)
    #expect(family.with.name == "家族")
    #expect(family.people.map(\.userID) == ["aya", "ken"])
    #expect(family.me.name == "わたし")
  }
}

@Test func oneWhoLeftIsAskedForAgain() throws {
  let database = try appDatabase()
  try database.write { db in
    let today = Day.today
    try groupOfThree(db, today: today)
    try GroupMemberRow.where { $0.userID.eq("aya") }.update { $0.left = true }.execute(db)
    #expect(
      try widgetCompanion(.member(groupID: "g", userID: "aya"), me: "me", around: today, in: db)
        == nil)
    #expect(try widgetCompanion(.group("gone"), me: "me", around: today, in: db) == nil)
  }
}
