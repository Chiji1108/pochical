import Foundation
import PochicalProto
import SQLiteData
import Testing

@testable import PochicalKit

struct GroupEndVectors: Decodable, Sendable {
  struct EndsAt: Decodable, Sendable {
    let day: String
    let zone: String
    let expected: Int64
  }

  struct EndDay: Decodable, Sendable {
    let ms: Int64
    let zone: String
    let expected: String
  }

  struct Words: Decodable, Sendable {
    let day: String
    let today: String
    let expected: String
  }

  struct Notice: Decodable, Sendable {
    let kind: LineNotice.Kind
    let by: String?
    let day: String?
    let today: String
    let expected: String
  }

  let endsAt: [EndsAt]
  let endDay: [EndDay]
  let words: [Words]
  let notices: [Notice]
}

@Test(arguments: try vectors("group-end", as: GroupEndVectors.self).endsAt)
func anEndDateEndsAsTheNextDayBeginsWhereItIsPicked(_ vector: GroupEndVectors.EndsAt) throws {
  let day = try #require(Day(vector.day))
  let zone = try #require(TimeZone(identifier: vector.zone))
  #expect(GroupEnd.endsAt(day, in: zone) == vector.expected)
}

@Test(arguments: try vectors("group-end", as: GroupEndVectors.self).endDay)
func anEndShowsAsTheDayItClosesByTheDevicesClock(_ vector: GroupEndVectors.EndDay) throws {
  let zone = try #require(TimeZone(identifier: vector.zone))
  #expect(GroupEnd.endDay(vector.ms, in: zone).key == vector.expected)
}

@Test(arguments: try vectors("group-end", as: GroupEndVectors.self).words)
func anEndDateSaysItsYearWhenItIsNotThisYears(_ vector: GroupEndVectors.Words) throws {
  let day = try #require(Day(vector.day))
  let today = try #require(Day(vector.today))
  #expect(GroupEnd.words(day, today: today) == vector.expected)
}

@Test(arguments: try vectors("group-end", as: GroupEndVectors.self).notices)
func theChatSaysAGroupsEnd(_ vector: GroupEndVectors.Notice) throws {
  // The line's end is the moment its day ends where the device is.
  let zone = try #require(TimeZone(identifier: "Asia/Tokyo"))
  let endsAtMs = try vector.day.map { GroupEnd.endsAt(try #require(Day($0)), in: zone) } ?? 0
  let notice = LineNotice(kind: vector.kind, endsAtMs: endsAtMs)
  let today = try #require(Day(vector.today))
  #expect(
    notice.words(by: vector.by ?? "", subject: "", zone: zone, today: today) == vector.expected)
}

/// The server's notification that a group ends soon (apns.ts payloadOf),
/// its alert's body `key` with `args`.
private func endsPayload(key: String = "GROUP_ENDS", args: Any? = ["1798729200000"])
  -> [AnyHashable: Any]
{
  var alert: [String: Any] = [
    "title-loc-key": "CHAT_TITLE", "title-loc-args": ["忘年会"], "loc-key": key,
  ]
  alert["loc-args"] = args
  return [
    "aps": ["alert": alert, "mutable-content": 1, "thread-id": "g1/group"],
    "groupId": "g1", "threadId": "group", "recipientId": "u1",
  ]
}

@Test func theNotificationThatAGroupEndsSaysTheChatLinesWordsByTheDevicesClock() throws {
  let tokyo = try #require(TimeZone(identifier: "Asia/Tokyo"))
  let auckland = try #require(TimeZone(identifier: "Pacific/Auckland"))
  let today = Day(year: 2026, month: 12, day: 30)
  let line = LineNotice(kind: .endsSoon, endsAtMs: 1_798_729_200_000)
  #expect(
    GroupEnd.notificationWords(payload: endsPayload(), in: tokyo, today: today)
      == "このグループは12月31日に終了し、チャットや写真も消えます")
  #expect(
    GroupEnd.notificationWords(payload: endsPayload(), in: tokyo, today: today)
      == line.words(by: "", subject: "", zone: tokyo, today: today))
  #expect(
    GroupEnd.notificationWords(payload: endsPayload(), in: auckland, today: today)
      == "このグループは2027年1月1日に終了し、チャットや写真も消えます")
}

@Test(arguments: [
  endsPayload(key: "CHAT_GROUP_TEXT", args: ["さくら", "1798729200000"]),
  endsPayload(key: "CHAT_TEXT"),
  endsPayload(args: nil),
  endsPayload(args: []),
  endsPayload(args: ["あした"]),
  endsPayload(args: ["0"]),
  endsPayload(args: ["-5"]),
  endsPayload(args: [1_798_729_200_000]),
  endsPayload(args: ["1798729200000", "1798729200000"]),
  ["groupId": "g1"],
].map(Payload.init))
func aNotificationOfAnythingElseOrWithNoMomentShowsAsItCame(_ payload: Payload) throws {
  let tokyo = try #require(TimeZone(identifier: "Asia/Tokyo"))
  let today = Day(year: 2026, month: 12, day: 30)
  #expect(GroupEnd.notificationWords(payload: payload.value, in: tokyo, today: today) == nil)
}

/// A notification's payload, which is not Sendable, as a test's argument.
struct Payload: @unchecked Sendable, CustomTestStringConvertible {
  let value: [AnyHashable: Any]
  var testDescription: String { String(describing: value["aps"] ?? value) }
}

private func change(_ cursor: UInt64, _ fill: (inout Pochical_V1_Change) -> Void)
  -> Pochical_V1_Change
{
  var change = Pochical_V1_Change()
  change.cursor = cursor
  fill(&change)
  return change
}

@Test func aGroupsEndComesFromItsSocketAndGoesWithIt() throws {
  let database = try appDatabase()
  try database.write { db in
    try Sync.take(
      [change(1) { $0.membership.groupID = "g1"; $0.membership.name = "忘年会" }], in: db)
    #expect(try GroupSync.endsAtMs(of: "g1", in: db) == 0)
    try GroupSync.take(
      [
        change(1) {
          $0.groupProfile.name = "忘年会"
          $0.groupProfile.endsAtMs = 1_798_729_200_000
        }
      ], of: "g1", in: db)
    #expect(try GroupSync.endsAtMs(of: "g1", in: db) == 1_798_729_200_000)

    // The user's socket making the list again leaves the group's end, which
    // its own log alone tells.
    try Sync.reset(in: db)
    try Sync.take(
      [change(2) { $0.membership.groupID = "g1"; $0.membership.name = "忘年会" }], in: db)
    #expect(try GroupSync.endsAtMs(of: "g1", in: db) == 1_798_729_200_000)

    // Taken away.
    try GroupSync.take([change(2) { $0.groupProfile.name = "忘年会" }], of: "g1", in: db)
    #expect(try GroupSync.endsAtMs(of: "g1", in: db) == 0)

    // The group ending reaches the device as a group left: its end goes
    // with the rest.
    try GroupSync.take(
      [change(3) { $0.groupProfile.endsAtMs = 1_798_729_200_000 }], of: "g1", in: db)
    try Sync.take(
      [change(3) { $0.membership.groupID = "g1"; $0.membership.left = true }], in: db)
    #expect(try GroupEndRow.fetchCount(db) == 0)
    #expect(try GroupRow.fetchCount(db) == 0)
  }
}

@Test func theChatsLinesOfAGroupsEndAreNotices() throws {
  let database = try appDatabase()
  try database.write { db in
    func line(
      _ seq: UInt64, by authorID: String, _ kind: Pochical_V1_ChatNotice.Kind, endsAtMs: Int64
    ) -> Pochical_V1_Change {
      change(seq) {
        $0.chatLine.threadID = groupThread
        $0.chatLine.seq = seq
        $0.chatLine.authorID = authorID
        $0.chatLine.content.notice.kind = kind
        $0.chatLine.content.notice.endsAtMs = endsAtMs
      }
    }
    try GroupSync.take(
      [
        line(1, by: "u1", .endSet, endsAtMs: 1_798_729_200_000),
        line(2, by: "u1", .endCleared, endsAtMs: 0),
        // The group's own line has no author.
        line(3, by: "", .endsSoon, endsAtMs: 1_798_729_200_000),
      ], of: "g1", in: db)
    let lines = try ChatLineRow.where { $0.groupID.eq("g1") }.order(by: \.seq).fetchAll(db)
    #expect(
      lines.map(\.content) == [
        .notice(LineNotice(kind: .endSet, endsAtMs: 1_798_729_200_000)),
        .notice(LineNotice(kind: .endCleared)),
        .notice(LineNotice(kind: .endsSoon, endsAtMs: 1_798_729_200_000)),
      ])
    #expect(lines.map(\.authorID) == ["u1", "u1", ""])
    // Neither the reader's nor anyone else's to count as unread.
    #expect(lines.allSatisfy { $0.writer(for: "u2") == .app })
  }
}
