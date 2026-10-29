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

  struct TriesCase: VectorCase {
    let name: String
    let events: [String]
    let expected: [Int?]
  }

  struct DefaultNetworkCase: VectorCase {
    let name: String
    let from: String?
    let steps: [String?]
    let expected: [String]
  }

  let waitMost: [WaitMost]
  let tries: [TriesCase]
  let defaultNetwork: [DefaultNetworkCase]
}

@Test(arguments: try vectors("reconnect", as: ReconnectVectors.self).defaultNetwork)
func defaultNetwork(_ vector: ReconnectVectors.DefaultNetworkCase) {
  var network = DefaultNetwork(now: vector.from)
  let heard = vector.steps.compactMap { network.becomes($0) }.map { "\($0)" }
  #expect(heard == vector.expected)
}

@Test(arguments: try vectors("reconnect", as: ReconnectVectors.self).waitMost)
func waitMost(_ vector: ReconnectVectors.WaitMost) {
  let most = reconnectWaitMost(tries: vector.tries, firstMs: vector.firstMs, mostMs: vector.mostMs)
  #expect(most == vector.expected)
}

@Test(arguments: try vectors("reconnect", as: ReconnectVectors.self).tries)
func reconnectTries(_ vector: ReconnectVectors.TriesCase) {
  var tries = ReconnectTries()
  var waits: [Int?] = []
  for event in vector.events {
    switch event {
    case "start", "networkChanged", "clockAhead":
      tries.atOnce()
      waits.append(nil)
    case "dropped": waits.append(tries.dropped())
    case "caughtUp": tries.caughtUp()
    case "welcomed": break
    default: Issue.record("unknown event \(event)")
    }
  }
  #expect(waits == vector.expected)
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

/// A database with values, waiting edits and cursors from both sockets.
private func synced(in db: Database) throws {
  try Sync.take([change("day", cursor: 4, ms: 9_000)], in: db)
  var member = Pochical_V1_Change()
  member.cursor = 5
  member.member.userID = "u1"
  member.member.displayName = "さくら"
  var line = Pochical_V1_Change()
  line.cursor = 5
  line.chatLine.threadID = "group"
  line.chatLine.seq = 1
  line.chatLine.authorID = "u1"
  line.chatLine.content.words.text = "おはよう"
  try GroupSync.take([member, line], of: "g1", in: db)
  try GroupSync.take([member], of: "support", in: db)
  try OwnValues.edit(dayChange("night"), opID: "a", in: db)
  var words = Pochical_V1_ChatSend()
  words.threadID = "t"
  words.content.words.text = "行けそう"
  try Chats.edit(.send(words), in: "g1", now: 1, db: db)
}

@Test func aDeviceSyncedUnderAnOlderSchemaTakesEverythingAgainKeepingItsValuesAndOutboxes() throws {
  let database = try appDatabase()
  try database.write { db in
    try synced(in: db)
    try SyncState.update { $0.schema = Sync.schema - 1 }.execute(db)

    try Sync.takeAllAgainIfOlder(in: db)
    #expect(try Sync.cursor(in: db) == 0)
    #expect(try GroupSync.cursor(of: "g1", in: db) == 0)
    #expect(try GroupSync.cursor(of: "support", in: db) == 0)
    #expect(try DayRow.find("2026-10-01").fetchOne(db)?.pattern == "night")
    #expect(try GroupMemberRow.where { $0.groupID.eq("g1") }.fetchCount(db) == 1)
    #expect(try OutboxEdit.all.fetchAll(db).map(\.opID) == ["a"])
    #expect(try Chats.lastWaiting(of: "g1", in: db) != nil)
    // Lines come again as pages: a catch-up brings each chat's latest alone.
    #expect(try ChatLineRow.where { $0.groupID.eq("g1") }.fetchCount(db) == 0)

    // Once taken again under the app's schema, its cursors move on as usual.
    try Sync.take([change("day", cursor: 6, ms: 9_000)], in: db)
    try Sync.takeAllAgainIfOlder(in: db)
    #expect(try Sync.cursor(in: db) == 6)
  }
}

@Test func aDeviceSyncedUnderTheAppsSchemaKeepsItsCursors() throws {
  let database = try appDatabase()
  try database.write { db in
    try synced(in: db)

    try Sync.takeAllAgainIfOlder(in: db)
    #expect(try Sync.cursor(in: db) == 4)
    #expect(try GroupSync.cursor(of: "g1", in: db) == 5)
    #expect(try GroupSync.cursor(of: "support", in: db) == 5)
    #expect(try ChatLineRow.where { $0.groupID.eq("g1") }.fetchCount(db) == 1)
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

@Test func theOutboxGoesInFramesOfOneKindInOrder() throws {
  let database = try appDatabase()
  try database.write { db in
    try OwnValues.edit(dayChange("day"), opID: "a", in: db)
    try OwnValues.edit(dayChange("night"), opID: "b", in: db)
    var order = Pochical_V1_PatternOrder()
    order.ids = ["night", "day"]
    var change = Pochical_V1_Change()
    change.patternOrder = order
    try OwnValues.edit(change, opID: "c", in: db)
    try OwnValues.edit(dayChange("off"), opID: "d", in: db)

    let (frames, last) = try Sync.frames(after: 0, in: db)
    #expect(frames.map { $0.dayEdits.edits.map(\.opID) } == [["a", "b"], [], ["d"]])
    #expect(frames[1].patternEdits.edits.map(\.opID) == ["c"])
    #expect(try Sync.frames(after: last, in: db).frames.isEmpty)
    #expect(try Sync.lastWaiting(in: db) == last)
  }
}

@Test func aFarAheadClockStartsAgainFromWhatWasTaken() throws {
  let database = try appDatabase()
  try database.write { db in
    try Sync.take([change("day", cursor: 1, ms: 5_000)], in: db)
    // The device's clock ran far ahead before the server corrected it.
    try OwnValues.edit(dayChange("night"), opID: "a", in: db)
    var state = try SyncState.current(in: db)
    state.lastMs = 900_000_000
    try SyncState.upsert { state }.execute(db)
    try OwnValues.edit(dayChange("off"), opID: "b", in: db)

    try Sync.restamp(now: 1_000, in: db)
    let edits = try Sync.frames(after: 0, in: db).frames[0].dayEdits.edits
    #expect(edits.map(\.value.hlc.physicalMs) == [5_000, 5_000])
    #expect(edits.map(\.value.hlc.counter) == [1, 2])
  }
}

@Test func theUsersGroupsComeWithTheirChangesAndGoWithAReset() throws {
  let database = try appDatabase()
  try database.write { db in
    var change = Pochical_V1_Change()
    change.cursor = 3
    change.membership.groupID = "g1"
    change.membership.name = "いとこ会"
    change.membership.mark.emoji = "🍉"
    change.membership.joinedAtMs = 1_000
    try Sync.take([change], in: db)
    #expect(
      try GroupRow.fetchAll(db)
        == [GroupRow(id: "g1", name: "いとこ会", emoji: "🍉", joinedAtMs: 1_000)])
    #expect(try Sync.cursor(in: db) == 3)

    try Sync.reset(in: db)
    #expect(try GroupRow.fetchCount(db) == 0)
  }
}

@Test func onlyTheGroupsLeftAreToldAsLeft() {
  var left = Pochical_V1_Change()
  left.membership.groupID = "g1"
  left.membership.left = true
  var joined = Pochical_V1_Change()
  joined.membership.groupID = "g2"
  var other = Pochical_V1_Change()
  other.profile.name = "ゆうき"
  #expect(Groups.left(in: [left, joined, other]) == ["g1"])
}

@Test func aGroupsIconLettersOrPhotoComeAsTheyAre() throws {
  let database = try appDatabase()
  try database.write { db in
    var icon = Pochical_V1_Change()
    icon.cursor = 1
    icon.membership.groupID = "g1"
    icon.membership.name = "家族"
    icon.membership.mark.icon = "house"
    icon.membership.mark.color = 3
    var letters = Pochical_V1_Change()
    letters.cursor = 2
    letters.membership.groupID = "g2"
    letters.membership.name = "ミニバス"
    letters.membership.mark.letter = "MB"
    letters.membership.mark.color = 8
    var photo = Pochical_V1_Change()
    photo.cursor = 3
    photo.membership.groupID = "g3"
    photo.membership.name = "いとこ会"
    photo.membership.mark.photoID = "p1"
    try Sync.take([icon, letters, photo], in: db)
    let marks = try GroupRow.order(by: \.id).fetchAll(db).map(\.mark)
    #expect(
      marks == [
        GroupMarkValue(icon: "house", color: 3), GroupMarkValue(letter: "MB", color: 8),
        GroupMarkValue(photoID: "p1"),
      ])
  }
}

@Test func aSocketReopensEachTimeItOpensAfterADrop() async {
  let statuses: [SyncStatus] = [
    .current, .catchingUp, .connecting, .connecting, .catchingUp, .current, .connecting, .current,
  ]
  let stream = AsyncStream<SyncStatus> { continuation in
    for status in statuses { continuation.yield(status) }
    continuation.finish()
  }
  var reopened = 0
  for await _ in stream.reopenings() { reopened += 1 }
  #expect(reopened == 2)
}

@Test func aSocketStillConnectingWhenWatchedReopensAsItOpens() async {
  let stream = AsyncStream<SyncStatus> { continuation in
    for status in [SyncStatus.connecting, .catchingUp, .current] { continuation.yield(status) }
    continuation.finish()
  }
  var reopened = 0
  for await _ in stream.reopenings() { reopened += 1 }
  #expect(reopened == 1)
}
