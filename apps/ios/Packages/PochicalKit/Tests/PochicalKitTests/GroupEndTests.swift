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

  struct FirstDay: Decodable, Sendable {
    let today: String
    let expected: String
  }

  let firstDay: [FirstDay]
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

@Test(arguments: try vectors("group-end", as: GroupEndVectors.self).firstDay)
func anEndDateCanBeChosenFromTomorrowOn(_ vector: GroupEndVectors.FirstDay) throws {
  let today = try #require(Day(vector.today))
  #expect(GroupEnd.firstDay(today: today).key == vector.expected)
}

@Test func thePickerOffersTheGroupsOwnEndWhenThatIsBeforeTomorrow() {
  let today = Day(year: 2026, month: 11, day: 11)
  let tomorrow = Day(year: 2026, month: 11, day: 12)
  // No end yet, or one from tomorrow on: from tomorrow.
  #expect(GroupEnd.earliestDay(today: today, current: nil) == tomorrow)
  #expect(GroupEnd.earliestDay(today: today, current: tomorrow) == tomorrow)
  #expect(
    GroupEnd.earliestDay(today: today, current: Day(year: 2026, month: 12, day: 31)) == tomorrow)
  // One set yesterday for today stays shown as it is.
  #expect(GroupEnd.earliestDay(today: today, current: today) == today)
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

/// A date picker's day, in a device's own calendar and time zone, read as
/// the app reads it and sent as a group's end, comes back as that day.
@Test(arguments: [
  Calendar.Identifier.gregorian, .japanese, .buddhist, .republicOfChina, .hebrew,
  .islamicUmmAlQura, .persian,
])
func aDayPickedInAnyCalendarEndsTheGroupAsThatDayEnds(_ identifier: Calendar.Identifier) throws {
  for zone in ["Asia/Tokyo", "Pacific/Auckland", "Pacific/Honolulu", "America/New_York", "UTC"] {
    var device = Calendar(identifier: identifier)
    device.timeZone = try #require(TimeZone(identifier: zone))
    let picked = Day(year: 2026, month: 12, day: 31)
    // What the picker hands back for the day: a moment of it, by the
    // device's clock, late in it as much as at its start.
    let start = picked.date(in: device)
    for moment in [start, start.addingTimeInterval(23 * 3600 + 59 * 60)] {
      let day = Day(moment, in: device)
      #expect(day == picked, "\(identifier) \(zone)")
      let endsAtMs = GroupEnd.endsAt(day, in: device.timeZone)
      #expect(GroupEnd.endDay(endsAtMs, in: device.timeZone) == picked)
      // The end is the next day's first moment there, after every moment
      // of the day picked.
      #expect(Double(endsAtMs) / 1000 > moment.timeIntervalSince1970)
      #expect(
        Day(Date(timeIntervalSince1970: Double(endsAtMs) / 1000), in: device)
          == picked.adding(days: 1))
    }
  }
}

/// Every day of two years, in time zones whose clocks change: the end is
/// the next day's start, and shows as the day itself.
@Test(arguments: ["Asia/Tokyo", "America/New_York", "Asia/Beirut", "Pacific/Apia", "Africa/Cairo"])
func everyDaysEndShowsAsThatDay(_ identifier: String) throws {
  let zone = try #require(TimeZone(identifier: identifier))
  var day = Day(year: 2026, month: 1, day: 1)
  var last: Int64 = 0
  for _ in 0..<730 {
    let endsAtMs = GroupEnd.endsAt(day, in: zone)
    #expect(GroupEnd.endDay(endsAtMs, in: zone) == day)
    #expect(GroupEnd.endDay(endsAtMs + 1, in: zone) == day.adding(days: 1))
    // Later days end later, each day 23 to 25 hours long.
    #expect((23...25).contains((endsAtMs - last) / 3_600_000) || last == 0, "\(day)")
    last = endsAtMs
    day = day.adding(days: 1)
  }
}

/// The app's strings, as the notifications' extension reads them.
private let strings = [
  "GROUP_ENDS": "このグループはまもなく終了し、チャットや写真も消えます",
  "CHAT_GROUP_TEXT": "%1$@: %2$@",
  "CHAT_GROUP_PHOTO": "%@が写真を送りました",
  "CHAT_GROUP_MESSAGE": "%@がメッセージを送りました",
  "UPDATE_TO_SEE": "この通知を見るには、アプリをアップデートしてください",
]

private func said(
  _ key: String, _ args: [String], known: [String: String] = strings,
  zone: String = "Asia/Tokyo"
) throws -> String {
  PushWords(key: key, args: args).words(
    known: { known[$0] != nil }, format: { known[$0] ?? $0 },
    in: try #require(TimeZone(identifier: zone)), today: Day(year: 2026, month: 12, day: 30))
}

@Test func theNotificationThatAGroupEndsSaysTheChatLinesWordsByTheDevicesClock() throws {
  let tokyo = try #require(TimeZone(identifier: "Asia/Tokyo"))
  let line = LineNotice(kind: .endsSoon, endsAtMs: 1_798_729_200_000)
  let words = try said("GROUP_ENDS", ["1798729200000"])
  #expect(words == "このグループは12月31日に終了し、チャットや写真も消えます")
  #expect(
    words
      == line.words(
        by: "", subject: "", zone: tokyo, today: Day(year: 2026, month: 12, day: 30)))
  #expect(
    try said("GROUP_ENDS", ["1798729200000"], zone: "Pacific/Auckland")
      == "このグループは2027年1月1日に終了し、チャットや写真も消えます")
  // The system's own wording of it, its strings' format, names no day.
  let body = PushWords(key: "GROUP_ENDS", args: ["1798729200000"])
  #expect(!body.saysItsFormat(known: { strings[$0] != nil }))
}

/// An argument that is no moment: the strings' words, which name no day
/// and are true of any end, never the number nor a request to update.
@Test(arguments: [[], ["あした"], ["0"], ["-5"], ["1798729200000", "1798729200000"]])
func aGroupsEndWithNoMomentToReadNamesNoDay(_ args: [String]) throws {
  #expect(try said("GROUP_ENDS", args) == "このグループはまもなく終了し、チャットや写真も消えます")
  #expect(PushWords(key: "GROUP_ENDS", args: args).saysItsFormat(known: { strings[$0] != nil }))
}

@Test func anAppWithNoWordsForAGroupsEndAsksToUpdate() throws {
  var older = strings
  older["GROUP_ENDS"] = nil
  #expect(
    try said("GROUP_ENDS", ["1798729200000"], known: older)
      == "この通知を見るには、アプリをアップデートしてください")
}

@Test func otherBodiesSayTheirStringsFormats() throws {
  #expect(try said("CHAT_GROUP_TEXT", ["さくら", "今週どう？"]) == "さくら: 今週どう？")
  #expect(try said("CHAT_GROUP_PHOTO", ["さくら"]) == "さくらが写真を送りました")
  // Fewer arguments than the format reads: blanks, never a crash.
  #expect(try said("CHAT_GROUP_TEXT", ["さくら"]) == "さくら: ")
  #expect(try said("CHAT_GROUP_STICKER", ["さくら", "poodle"]) == "さくらがメッセージを送りました")
  // A line whose words are a moment's digits is no group's end.
  #expect(try said("CHAT_GROUP_TEXT", ["さくら", "1798729200000"]) == "さくら: 1798729200000")
  let known = PushWords(key: "CHAT_GROUP_TEXT", args: ["さくら", "今週どう？"])
  #expect(known.saysItsFormat(known: { strings[$0] != nil }))
  let later = PushWords(key: "CHAT_GROUP_STICKER", args: ["さくら", "poodle"])
  #expect(!later.saysItsFormat(known: { strings[$0] != nil }))
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
