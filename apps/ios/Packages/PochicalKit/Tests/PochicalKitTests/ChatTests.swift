import PochicalProto
import SQLiteData
import Testing

@testable import PochicalKit

struct ChatVectors: Decodable, Sendable {
  struct FirstUnread: VectorCase {
    let name: String
    let lines: [LineWriter]
    let unread: Int
    let expected: Int?
  }

  let firstUnread: [FirstUnread]
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).firstUnread)
func firstUnreadLine(_ vector: ChatVectors.FirstUnread) {
  #expect(firstUnread(vector.lines, unread: vector.unread) == vector.expected)
}

private func line(_ seq: UInt64, _ text: String, op: String = "") -> Pochical_V1_Change {
  var change = Pochical_V1_Change()
  change.cursor = seq
  change.chatLine.threadID = groupThread
  change.chatLine.seq = seq
  change.chatLine.authorID = "u1"
  change.chatLine.text = text
  change.chatLine.opID = op.isEmpty ? "op\(seq)" : op
  return change
}

@Test func aChatShowsOnFromItsLatestLineToTheFirstGap() throws {
  let database = try appDatabase()
  try database.write { db in
    // 1–2 held from before, then a catch-up's latest page 5–6.
    try GroupSync.take([line(1, "a"), line(2, "b"), line(5, "e"), line(6, "f")], of: "g", in: db)
    var state = try Chats.state(of: groupThread, in: "g", db: db)
    #expect(state.lines.map(\.seq) == [5, 6])
    #expect(!state.atStart)

    var page = Pochical_V1_ChatPage()
    page.threadID = groupThread
    page.lines = [line(3, "c"), line(4, "d")].map(\.chatLine)
    try Chats.take(page, of: "g", in: db)
    state = try Chats.state(of: groupThread, in: "g", db: db)
    #expect(state.lines.map(\.seq) == [1, 2, 3, 4, 5, 6])
    #expect(state.atStart)
  }
}

@Test func theMembersEditsShowWhileTheyWait() throws {
  let database = try appDatabase()
  try database.write { db in
    try GroupSync.take([line(1, "はじめ")], of: "g", in: db)
    var send = Pochical_V1_ChatSend()
    send.threadID = groupThread
    send.text = "まだ届いてない"
    try Chats.edit(.send(send), in: "g", now: 10, db: db)
    var change = Pochical_V1_ChatChange()
    change.threadID = groupThread
    change.seq = 1
    change.text = "なおした"
    try Chats.edit(.change(change), in: "g", now: 11, db: db)

    var state = try Chats.state(of: groupThread, in: "g", db: db)
    #expect(state.waiting.map(\.text) == ["まだ届いてない"])
    #expect(state.lines.first?.text == "なおした")
    #expect(state.lines.first?.edited == true)

    // The group's line for the send takes the waiting one's place.
    let opID = try #require(state.waiting.first).opID
    try GroupSync.take([line(2, "まだ届いてない", op: opID)], of: "g", in: db)
    state = try Chats.state(of: groupThread, in: "g", db: db)
    #expect(state.waiting.isEmpty)
    #expect(state.lines.map(\.text) == ["なおした", "まだ届いてない"])
  }
}

@Test func othersLinesPastTheMarkAreUnreadUntilARead() throws {
  let database = try appDatabase()
  try database.write { db in
    var mine = line(3, "自分の")
    mine.chatLine.authorID = "me"
    try GroupSync.take([line(1, "a"), line(2, "b"), mine], of: "g", in: db)
    var mark = Pochical_V1_Change()
    mark.cursor = 4
    mark.readMark.threadID = groupThread
    mark.readMark.userID = "me"
    mark.readMark.lastReadSeq = 1
    try GroupSync.take([mark], of: "g", in: db)
    #expect(try Chats.state(of: groupThread, in: "g", db: db).unread(by: "me") == 1)

    // A read waiting to be sent counts at once.
    var read = Pochical_V1_ChatRead()
    read.threadID = groupThread
    read.lastReadSeq = 3
    try Chats.edit(.read(read), in: "g", now: 5, db: db)
    let state = try Chats.state(of: groupThread, in: "g", db: db)
    #expect(state.lastRead(by: "me") == 3)
    #expect(state.unread(by: "me") == 0)
  }
}

@Test func oneWhoLeftKeepsTheirNameOnTheirLines() throws {
  let database = try appDatabase()
  try database.write { db in
    var joined = Pochical_V1_Change()
    joined.cursor = 1
    joined.member.userID = "u1"
    joined.member.displayName = "さくら"
    var left = joined
    left.cursor = 2
    left.member.left = true
    try GroupSync.take([joined, left], of: "g", in: db)
    let today = Day.today
    #expect(try GroupSync.members(of: "g", from: today, through: today, in: db).isEmpty)
    #expect(try Chats.writers(in: "g", db: db).map(\.displayName) == ["さくら"])
  }
}

@Test func leavingAGroupDropsTheEditsWaitingForIt() throws {
  let database = try appDatabase()
  try database.write { db in
    var send = Pochical_V1_ChatSend()
    send.threadID = groupThread
    send.text = "抜ける前に"
    try Chats.edit(.send(send), in: "g", now: 1, db: db)
    var left = Pochical_V1_Change()
    left.cursor = 1
    left.membership.groupID = "g"
    left.membership.left = true
    try Sync.take([left], in: db)
    #expect(try Chats.lastWaiting(of: "g", in: db) == nil)
  }
}

struct MentionVector: Decodable, Sendable, CustomTestStringConvertible {
  let text: String
  let expected: [String]
  var testDescription: String { text }
}

struct MentionVectors: Decodable, Sendable {
  let mentions: [MentionVector]
}

@Test(arguments: try vectors("chat-text", as: MentionVectors.self).mentions)
func mentionsInAMessage(_ vector: MentionVector) {
  #expect(mentions(in: vector.text) == vector.expected)
}

struct UnreadVectors: Decodable, Sendable {
  struct Chat: Decodable, Sendable {
    let muted: Bool
    let read: [String]
    let unread: [String]
  }

  struct Group: Decodable, Sendable {
    let chats: [Chat]
  }

  struct Notifying: VectorCase {
    let name: String
    let mentionsWhenMuted: Bool
    let groups: [Group]
    let expected: Int
  }

  let notifying: [Notifying]
}

@Test(arguments: try vectors("unread", as: UnreadVectors.self).notifying)
func unreadThatNotifies(_ vector: UnreadVectors.Notifying) {
  let total = vector.groups.flatMap(\.chats).reduce(0) { total, chat in
    total
      + notifyingUnread(
        chat.unread, muted: chat.muted, mentionsWhenMuted: vector.mentionsWhenMuted, me: "me")
  }
  #expect(total == vector.expected)
}

private func unreadCount(_ cursor: UInt64, _ count: UInt32, in groupID: String = "g")
  -> Pochical_V1_Change
{
  var change = Pochical_V1_Change()
  change.cursor = cursor
  change.unreadCount.groupID = groupID
  change.unreadCount.threadID = groupThread
  change.unreadCount.count = count
  return change
}

@Test func aChatCountsAsTheGroupSaysUntilAReadOfTheMembersWaits() throws {
  let database = try appDatabase()
  try database.write { db in
    var mine = line(2, "自分の")
    mine.chatLine.authorID = "me"
    try GroupSync.take([line(1, "a"), mine, line(3, "c")], of: "g", in: db)
    // Every group's count comes from the user's own socket.
    try Sync.take([unreadCount(1, 2), unreadCount(2, 4, in: "other")], in: db)
    var summary = try Chats.summary(of: groupThread, in: "g", me: "me", db: db)
    #expect(summary.last?.seq == 3)
    #expect(summary.unread == 2)
    #expect(try Chats.unreadByGroup(me: "me", db: db) == ["g": 2, "other": 4])

    var send = Pochical_V1_ChatSend()
    send.threadID = groupThread
    send.text = "まだ"
    try Chats.edit(.send(send), in: "g", now: 5, db: db)
    var read = Pochical_V1_ChatRead()
    read.threadID = groupThread
    read.lastReadSeq = 3
    try Chats.edit(.read(read), in: "g", now: 6, db: db)
    summary = try Chats.summary(of: groupThread, in: "g", me: "me", db: db)
    #expect(summary.waiting?.text == "まだ")
    #expect(summary.unread == 0)
    #expect(try Chats.unreadByGroup(me: "me", db: db) == ["other": 4])
  }
}

@Test func aGroupLeftTakesItsCountsWithIt() throws {
  let database = try appDatabase()
  try database.write { db in
    var left = Pochical_V1_Change()
    left.cursor = 2
    left.membership.groupID = "g"
    left.membership.left = true
    try Sync.take([unreadCount(1, 3), left], in: db)
    #expect(try Chats.unreadByGroup(me: "me", db: db).isEmpty)
  }
}
