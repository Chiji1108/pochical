import Foundation
import ImageIO
import PochicalDesign
import PochicalProto
import SQLiteData
import Testing

@testable import PochicalKit

/// A device's time before the wait of any line these tests write is over.
let early: Int64 = 100_000

extension LineContent {
  /// Its words, for a line of words.
  var text: String? {
    if case .words(let words) = self { words.text } else { nil }
  }
}

extension ChatLineRow {
  var text: String? { content.text }
}

extension WaitingLine {
  var text: String? { content.text }
}

struct ChatVectors: Decodable, Sendable {
  struct FirstUnread: VectorCase {
    let name: String
    let lines: [LineWriter]
    let unread: Int
    let expected: Int?
  }

  struct DirectThread: VectorCase {
    let name: String
    let a: String
    let b: String
    let expected: String
  }

  struct Edited: VectorCase {
    let name: String
    let text: String
    let edit: String
    let expected: String
  }

  struct OpeningFrom: VectorCase {
    let name: String
    let latest: Int64
    let read: Int64?
    let expected: Int64
  }

  struct Writer: VectorCase {
    enum Kind: String, Decodable, Sendable {
      case words, notice, hidden
    }
    let name: String
    let author: String
    let me: String
    let kind: Kind
    let expected: LineWriter

    var content: LineContent {
      switch kind {
      case .words: .words(LineContent.Words(text: "了解"))
      case .notice: .notice(LineNotice(kind: .joined))
      case .hidden: .hidden
      }
    }
  }

  let firstUnread: [FirstUnread]
  let writer: [Writer]
  let directThread: [DirectThread]
  let edited: [Edited]
  struct FirstComing: VectorCase {
    struct Line: Decodable, Sendable {
      let seq: Int64
      let writer: LineWriter
    }
    let name: String
    let lines: [Line]
    let latest: Int64
    let read: Int64
    let expected: Int64?
  }

  struct ReadTo: VectorCase {
    struct Expected: Decodable, Sendable {
      let read: Int64
      let unread: Int
    }
    let name: String
    let lines: [FirstComing.Line]
    let read: Int64
    let shown: [Int64]
    let expected: Expected
  }

  struct Draft: VectorCase {
    struct Value: Decodable, Sendable {
      let text: String
      var replyTo: Int64?
      var editing: Int64?

      var kept: KeptDraft {
        KeptDraft(text: text, target: DraftTarget(replyTo: replyTo, editing: editing))
      }
    }
    struct Line: Decodable, Sendable {
      enum Kind: String, Decodable, Sendable {
        case words, unsent
      }
      let seq: Int64
      let kind: Kind
      var text: String?

      var content: LineContent {
        switch kind {
        case .words: .words(LineContent.Words(text: text ?? ""))
        case .unsent: .unsent
        }
      }
    }
    let name: String
    let draft: Value
    let lines: [Line]
    let expected: Value?
  }

  struct Window: VectorCase {
    struct Expected: Decodable, Sendable {
      let lines: [Int64]
      let heldFrom: Int64
      let heldBefore: Int
      let atEnd: Bool
      let unread: Int
    }
    let name: String
    let held: [[Int64]]
    let mine: [Int64]
    let read: Int64
    let from: Int64?
    let expected: Expected
  }

  struct PageAfter: VectorCase {
    let name: String
    let through: Int64
    let expected: Int64
  }

  let openingFrom: [OpeningFrom]
  let firstComing: [FirstComing]
  let readTo: [ReadTo]
  let window: [Window]
  let pageAfter: [PageAfter]

  struct Withdrawn: VectorCase {
    struct Shown: Decodable, Sendable {
      let id: String
      let groupId: String
      let threadId: String
      let seq: Int64
    }
    struct Read: Decodable, Sendable {
      let groupId: String
      let threadId: String
      let readTo: Int64?
    }
    let name: String
    let shown: [Shown]
    let read: Read
    let expected: [String]
  }
  let withdrawn: [Withdrawn]
  let draft: [Draft]

  struct AlbumRows: VectorCase {
    let name: String
    let count: Int
    let expected: [Int]
  }
  let albumRows: [AlbumRows]

  struct Order: VectorCase {
    struct Line: Decodable, Sendable {
      let id: String
      let at: Int64
      let failed: Bool?
    }
    let name: String
    let sent: [Line]
    let waiting: [Line]
    let expected: [String]
  }
  let order: [Order]
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).order)
func aChatsLinesInOrder(_ vector: ChatVectors.Order) {
  let timed = { (line: ChatVectors.Order.Line) in
    TimedLine(id: line.id, at: line.at, failed: line.failed ?? false)
  }
  #expect(
    chatOrder(sent: vector.sent.map(timed), waiting: vector.waiting.map(timed)) == vector.expected)
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).albumRows)
func anAlbumsRows(_ vector: ChatVectors.AlbumRows) {
  #expect(albumRows(vector.count) == vector.expected)
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).withdrawn)
func aReadTakesBackItsNotifications(_ vector: ChatVectors.Withdrawn) {
  let shown = vector.shown.map {
    NotifiedLine(id: $0.id, groupID: $0.groupId, threadID: $0.threadId, seq: $0.seq)
  }
  let read = vector.read
  #expect(
    withdrawn(shown, groupID: read.groupId, threadID: read.threadId, readTo: read.readTo)
      == vector.expected)
}

@Test func aNotificationShowsOnlyForTheUserSignedIn() {
  let payload: [AnyHashable: Any] = ["groupId": "g", "threadId": groupThread, "recipientId": "me"]
  #expect(isForSignedIn(payload, me: "me"))
  // The device went on as someone else since, or knows no one yet.
  #expect(!isForSignedIn(payload, me: "someone"))
  #expect(!isForSignedIn(payload, me: nil))
  // Sent with no recipient named.
  #expect(!isForSignedIn(["groupId": "g", "threadId": groupThread], me: "me"))
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).draft)
func draftKept(_ vector: ChatVectors.Draft) {
  let lines = Dictionary(
    uniqueKeysWithValues: vector.lines.map { ($0.seq, $0.content) })
  let kept = keptDraft(vector.draft.kept) { lines[$0] }
  #expect(kept == vector.expected?.kept)
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).firstComing)
func comingLinesStopAt(_ vector: ChatVectors.FirstComing) {
  let lines = vector.lines.map { (seq: $0.seq, writer: $0.writer) }
  #expect(firstComing(lines, after: vector.latest, read: vector.read) == vector.expected)
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).readTo)
func readsToTheLastLineShown(_ vector: ChatVectors.ReadTo) {
  let read = readTo(shown: vector.shown, read: vector.read)
  #expect(read == vector.expected.read)
  let lines = vector.lines.map { (seq: $0.seq, writer: $0.writer) }
  #expect(unreadCount(lines, read: read) == vector.expected.unread)
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).openingFrom)
func aChatOpensFrom(_ vector: ChatVectors.OpeningFrom) {
  #expect(openingFrom(latest: vector.latest, read: vector.read) == vector.expected)
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).window)
func theLinesLaidOut(_ vector: ChatVectors.Window) throws {
  let database = try appDatabase()
  try database.write { db in
    let seqs = vector.held.flatMap { $0[0]...$0[1] }
    try GroupSync.take(
      seqs.map { seq in
        var change = line(UInt64(seq), "\(seq)")
        if vector.mine.contains(seq) { change.chatLine.authorID = "me" }
        return change
      }, of: "g", in: db)
    var mark = Pochical_V1_Change()
    mark.cursor = UInt64(seqs.max() ?? 0) + 1
    mark.readMark.threadID = groupThread
    mark.readMark.userID = "me"
    mark.readMark.lastReadSeq = UInt64(vector.read)
    try GroupSync.take([mark], of: "g", in: db)
    let state = try Chats.state(of: groupThread, in: "g", me: "me", from: vector.from, now: early, db: db)
    let laidOut = [state.lines.first?.seq, state.lines.last?.seq].compactMap(\.self)
    #expect(laidOut == vector.expected.lines)
    #expect(state.lines.map(\.seq) == Array(vector.expected.lines[0]...vector.expected.lines[1]))
    #expect(state.heldFrom == vector.expected.heldFrom)
    #expect(state.heldBefore == vector.expected.heldBefore)
    #expect(state.atEnd == vector.expected.atEnd)
    #expect(state.unread(by: "me") == vector.expected.unread)
  }
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).pageAfter)
func thePageAfterTheLinesLaidOut(_ vector: ChatVectors.PageAfter) {
  #expect(pageAfter(through: vector.through) == vector.expected)
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).edited)
func anEditKeepsItsPageWhileItsFirstLinkStays(_ vector: ChatVectors.Edited) {
  #expect(keepsPreview(of: vector.text, editedTo: vector.edit) == (vector.expected == "kept"))
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).directThread)
func directThreadOfTwo(_ vector: ChatVectors.DirectThread) {
  #expect(directThread(vector.a, vector.b) == vector.expected)
}

@Test(arguments: try vectors("chat", as: ChatVectors.self).writer)
func writerOfALine(_ vector: ChatVectors.Writer) {
  let row = ChatLineRow(
    groupID: "g", threadID: groupThread, seq: 1, authorID: vector.author, sentAtMs: 0,
    opID: "op1", content: vector.content)
  #expect(row.writer(for: vector.me) == vector.expected)
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
  change.chatLine.content.words.text = text
  change.chatLine.opID = op.isEmpty ? "op\(seq)" : op
  return change
}

@Test func aChatShowsOnFromItsLatestLineToTheFirstGap() throws {
  let database = try appDatabase()
  try database.write { db in
    // 1–2 held from before, then a catch-up's latest page 5–6.
    try GroupSync.take([line(1, "a"), line(2, "b"), line(5, "e"), line(6, "f")], of: "g", in: db)
    var state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lines.map(\.seq) == [5, 6])
    #expect(!state.atStart)

    var page = Pochical_V1_ChatPage()
    page.threadID = groupThread
    page.lines = [line(3, "c"), line(4, "d")].map(\.chatLine)
    try Chats.take(page, of: "g", in: db)
    state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lines.map(\.seq) == [1, 2, 3, 4, 5, 6])
    #expect(state.atStart)
  }
}

@Test func aChatOpensOnItsLatestPageOrItsFirstUnreadLine() throws {
  let database = try appDatabase()
  try database.write { db in
    try GroupSync.take((1...130).map { line(UInt64($0), "\($0)") }, of: "g", in: db)
    let firstShown = { (me: String?, from: Int64?) in
      try Chats.state(of: groupThread, in: "g", me: me, from: from, now: early, db: db).lines.first?.seq
    }
    #expect(try firstShown(nil, nil) == 81)
    var mark = Pochical_V1_Change()
    mark.cursor = 131
    mark.readMark.threadID = groupThread
    mark.readMark.userID = "me"
    mark.readMark.lastReadSeq = 20
    try GroupSync.take([mark], of: "g", in: db)
    // Back to the first unread line, within Chat.openMax lines.
    #expect(try firstShown("me", nil) == 21)
    // Scrolled back, from wherever the screen asks.
    #expect(try firstShown(nil, 10) == 10)
    #expect(try !Chats.state(of: groupThread, in: "g", from: 10, now: early, db: db).atStart)
  }
}

@Test func aChatSaysWhatItHoldsBeforeTheLinesLaidOut() throws {
  let database = try appDatabase()
  try database.write { db in
    // 1–2 held from before, then 11–130 on to the latest without a gap.
    try GroupSync.take(
      [line(1, "a"), line(2, "b")] + (11...130).map { line(UInt64($0), "\($0)") }, of: "g",
      in: db)
    var state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    // The latest page, 81–130, the rest from 11 held before it.
    #expect(state.lines.first?.seq == 81)
    #expect(state.heldBefore == 70)
    #expect(state.heldFrom == 11)
    // Scrolled back to 31: 20 held before, as far as the gap.
    state = try Chats.state(of: groupThread, in: "g", from: 31, now: early, db: db)
    #expect(state.heldBefore == 20)
    // All laid out: nothing held before, the server asked before 11.
    state = try Chats.state(of: groupThread, in: "g", from: 11, now: early, db: db)
    #expect(state.heldBefore == 0)
    #expect(state.heldFrom == 11)
    #expect(!state.atStart)
  }
}

@Test func eachKindOfSendWaitsAsTheLineItWillBe() throws {
  let database = try appDatabase()
  try database.write { db in
    var words = Pochical_V1_ChatSendContent()
    words.words.text = "見て"
    var photos = Pochical_V1_ChatSendContent()
    photos.photos.photos = wirePhotos(["a", "b"])
    var days = Pochical_V1_ChatSendContent()
    days.days.days = ["2026-11-03"]
    var poll = Pochical_V1_ChatSendContent()
    poll.poll.days = ["2026-11-03", "2026-11-04"]
    let contents = [words, photos, days, poll, Pochical_V1_ChatSendContent()]
    for (at, content) in contents.enumerated() {
      var send = Pochical_V1_ChatSend()
      send.threadID = groupThread
      send.content = content
      try Chats.edit(.send(send), in: "g", now: 10 + Int64(at), db: db)
    }
    let state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    let november3 = Day(year: 2026, month: 11, day: 3)
    #expect(
      state.waiting.map(\.content) == [
        .words(LineContent.Words(text: "見て")),
        .photos(wirePhotos(["a", "b"]).map(LinePhoto.init)),
        .days([november3]),
        .poll(LineContent.Poll(days: [november3, Day(year: 2026, month: 11, day: 4)])),
        .hidden,
      ])
  }
}

@Test func theMembersEditsShowWhileTheyWait() throws {
  let database = try appDatabase()
  try database.write { db in
    try GroupSync.take([line(1, "はじめ")], of: "g", in: db)
    var send = Pochical_V1_ChatSend()
    send.threadID = groupThread
    send.content.words.text = "まだ届いてない"
    try Chats.edit(.send(send), in: "g", now: 10, db: db)
    var change = Pochical_V1_ChatChange()
    change.threadID = groupThread
    change.seq = 1
    change.text = "なおした"
    try Chats.edit(.change(change), in: "g", now: 11, db: db)

    var state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.waiting.map(\.text) == ["まだ届いてない"])
    #expect(state.lines.first?.content == .words(LineContent.Words(text: "なおした", edited: true)))

    // The group's line for the send takes the waiting one's place.
    let opID = try #require(state.waiting.first).opID
    try GroupSync.take([line(2, "まだ届いてない", op: opID)], of: "g", in: db)
    state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
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
    #expect(try Chats.state(of: groupThread, in: "g", now: early, db: db).unread(by: "me") == 1)

    // A read waiting to be sent counts at once.
    var read = Pochical_V1_ChatRead()
    read.threadID = groupThread
    read.lastReadSeq = 3
    try Chats.edit(.read(read), in: "g", now: 5, db: db)
    let state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lastRead(by: "me") == 3)
    #expect(state.unread(by: "me") == 0)
  }
}

@Test func aLineNeverDeliveredIsUnreadNowhere() throws {
  let database = try appDatabase()
  try database.write { db in
    var blocked = line(2, "")
    blocked.chatLine.content.hidden = Pochical_V1_ChatHidden()
    try GroupSync.take([line(1, "a"), blocked, line(3, "c")], of: "g", in: db)
    var read = Pochical_V1_ChatRead()
    read.threadID = groupThread
    read.lastReadSeq = 1
    try Chats.edit(.read(read), in: "g", now: 5, db: db)
    // The ↓'s count and the chat list's agree.
    let state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.unread(by: "me") == 1)
    #expect(try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db).unread == 1)
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
    send.content.words.text = "抜ける前に"
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
    var summary = try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db)
    #expect(summary.last?.seq == 3)
    #expect(summary.unread == 2)
    #expect(try Chats.unreadByGroup(me: "me", db: db) == ["g": 2, "other": 4])

    var send = Pochical_V1_ChatSend()
    send.threadID = groupThread
    send.content.words.text = "まだ"
    try Chats.edit(.send(send), in: "g", now: 5, db: db)
    var read = Pochical_V1_ChatRead()
    read.threadID = groupThread
    read.lastReadSeq = 3
    try Chats.edit(.read(read), in: "g", now: 6, db: db)
    summary = try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db)
    #expect(summary.waiting?.text == "まだ")
    #expect(summary.unread == 0)
    #expect(try Chats.unreadByGroup(me: "me", db: db) == ["other": 4])
  }
}

@Test func aChatsListShowsALineWaitingAsTheChatDoes() throws {
  let database = try appDatabase()
  try database.write { db in
    var send = Pochical_V1_ChatSend()
    send.threadID = groupThread
    send.content.words.text = "まだ"
    send.replyTo = 4
    try Chats.edit(.send(send), in: "g", now: 5, db: db)
    let opID = try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].opID
    try Chats.fail(opID, in: db)
    let waiting = try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting
    #expect(waiting.map(\.failed) == [true])
    #expect(try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db).waiting == waiting[0])
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

@Test func aGroupsChatsAreThoseWithALineOrASendOnItsWay() throws {
  let database = try appDatabase()
  try database.write { db in
    try GroupSync.take([line(1, "a")], of: "g", in: db)
    var send = Pochical_V1_ChatSend()
    send.threadID = directThread("me", "aya")
    send.content.words.text = "ふたりで"
    try Chats.edit(.send(send), in: "g", now: 1, db: db)
    #expect(try Chats.threads(in: "g", db: db) == [groupThread, "direct:aya:me"])
  }
}

struct MessageTextVectors: Decodable, Sendable {
  struct Parts: VectorCase {
    let name: String
    let text: String
    let expected: [TextPart]
  }

  struct Plain: Decodable, Sendable, CustomTestStringConvertible {
    let text: String
    let names: [String: String]
    let expected: String
    var testDescription: String { text }
  }

  struct Picked: VectorCase {
    let name: String
    let text: String
    let picked: [PickedMember]
    let expected: String
  }

  struct Query: VectorCase {
    let name: String
    let text: String
    let expected: String?
    let picked: String
  }

  let textParts: [Parts]
  let plainText: [Plain]
  let withMentions: [Picked]
  let mentionQuery: [Query]
}

@Test(arguments: try vectors("chat-text", as: MessageTextVectors.self).textParts)
func textPartsOfAMessage(_ vector: MessageTextVectors.Parts) {
  #expect(textParts(vector.text) == vector.expected)
}

@Test(arguments: try vectors("chat-text", as: MessageTextVectors.self).plainText)
func plainTextOfAMessage(_ vector: MessageTextVectors.Plain) {
  #expect(plainText(vector.text) { vector.names[$0] ?? "" } == vector.expected)
}

@Test(arguments: try vectors("chat-text", as: MessageTextVectors.self).withMentions)
func aMessageWithMentions(_ vector: MessageTextVectors.Picked) {
  #expect(withMentions(vector.text, picked: vector.picked) == vector.expected)
}

@Test(arguments: try vectors("chat-text", as: MessageTextVectors.self).mentionQuery)
func theNamesToListWhileWriting(_ vector: MessageTextVectors.Query) {
  #expect(mentionQuery(vector.text) == vector.expected)
  #expect(pickingMention(vector.text, name: "あや") == vector.picked)
}

@Test func aChatsSummaryMarksAnUnreadMentionOfTheReader() throws {
  let database = try appDatabase()
  try database.write { db in
    try GroupSync.take([line(1, "<@me> 来れる？"), line(2, "どう？")], of: "g", in: db)
    try Sync.take([unreadCount(1, 2)], in: db)
    #expect(try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db).mentioned)
    #expect(try !Chats.summary(of: groupThread, in: "g", me: "aya", now: early, db: db).mentioned)
  }
}

struct EmojiVectors: Decodable, Sendable {
  struct Case: VectorCase {
    let name: String
    let text: String
    let expected: Bool
  }

  let isEmoji: [Case]
}

@Test(arguments: try vectors("text", as: EmojiVectors.self).isEmoji)
func oneEmoji(_ vector: EmojiVectors.Case) {
  #expect(isEmoji(vector.text) == vector.expected)
}

struct MarkLetterVectors: Decodable, Sendable {
  struct Case: VectorCase {
    let name: String
    let before: String
    let after: String
    let limit: Int
    let expected: String
  }

  let markLetter: [Case]
}

@Test(arguments: try vectors("text", as: MarkLetterVectors.self).markLetter)
func aFullMarkLetterTakesWhatIsTyped(_ vector: MarkLetterVectors.Case) {
  #expect(markLetter(before: vector.before, after: vector.after, limit: vector.limit) == vector.expected)
}

@Test func aLinesReactionsComeWithItAndTheMembersShowAtOnce() throws {
  let database = try appDatabase()
  try database.write { db in
    var reacted = line(1, "21日どう？")
    var thumbs = Pochical_V1_ChatReaction()
    thumbs.emoji = "👍"
    thumbs.userIds = ["aya"]
    reacted.chatLine.reactions = [thumbs]
    try GroupSync.take([reacted], of: "g", in: db)
    var react = Pochical_V1_ChatReact()
    react.threadID = groupThread
    react.seq = 1
    react.emoji = "👍"
    react.on = true
    try Chats.edit(.react(react), in: "g", now: 1, db: db)
    react.emoji = "🎉"
    try Chats.edit(.react(react), in: "g", now: 2, db: db)
    let state = try Chats.state(of: groupThread, in: "g", me: "me", now: early, db: db)
    #expect(
      state.lines.first?.reactions == [
        LineReaction(emoji: "👍", userIDs: ["aya", "me"]),
        LineReaction(emoji: "🎉", userIDs: ["me"]),
      ])

    react.on = false
    try Chats.edit(.react(react), in: "g", now: 3, db: db)
    #expect(
      try Chats.state(of: groupThread, in: "g", me: "me", now: early, db: db).lines.first?.reactions
        == [LineReaction(emoji: "👍", userIDs: ["aya", "me"])])
  }
}

struct PinVectors: Decodable, Sendable {
  struct Step: Decodable, Sendable {
    let pin: String?
    let unpin: String?
    let unsend: String?
    let settle: String?
  }

  struct Expected: Decodable, Sendable {
    let pins: [String]
    let dropped: String?
  }

  struct Case: VectorCase {
    let name: String
    /// The chat's lines by name, the first at seq 1.
    let lines: [String]
    let pins: [String]
    let step: Step
    let expected: Expected

    /// The named line's seq.
    func seq(_ name: String) -> Int64 {
      guard let index = lines.firstIndex(of: name) else {
        Issue.record("\(name) is not among the lines of \(self.name)")
        return 0
      }
      return Int64(index) + 1
    }
  }

  let pins: [Case]
}

@Test(arguments: try vectors("chat", as: PinVectors.self).pins)
func pinsAfterAStep(_ vector: PinVectors.Case) {
  let step = vector.step
  let pins = vector.pins.map(vector.seq)
  let after =
    if let name = step.pin ?? step.settle {
      pinStep(pins, pin: vector.seq(name))
    } else if let name = step.unpin {
      pinStep(pins, unpin: vector.seq(name))
    } else {
      pinStep(pins, unsend: vector.seq(step.unsend ?? ""))
    }
  #expect(after.pins == vector.expected.pins.map(vector.seq))
  #expect(after.dropped == vector.expected.dropped.map(vector.seq))
}

@Test func aChatsPinsHoldLinesFarBackAndTheMembersShowAtOnce() throws {
  let database = try appDatabase()
  try database.write { db in
    var old = line(1, "ずっと前")
    old.chatLine.pinnedOrder = 9
    // 1 is held for its pin, apart from the latest 5–6.
    try GroupSync.take([old, line(5, "e"), line(6, "f")], of: "g", in: db)
    var pin = Pochical_V1_ChatPin()
    pin.threadID = groupThread
    pin.seq = 6
    pin.on = true
    try Chats.edit(.pin(pin), in: "g", now: 1, db: db)
    let state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lines.map(\.seq) == [5, 6])
    #expect(state.pins.map(\.seq) == [6, 1])
  }
}

@Test func aLineOfDaysKeepsItsDaysWhileWaitingAndLosesThemTakenBack() throws {
  let database = try appDatabase()
  try database.write { db in
    var days = line(1, "")
    days.chatLine.content.days.days = ["2026-10-10", "2026-10-12"]
    try GroupSync.take([days], of: "g", in: db)
    var send = Pochical_V1_ChatSend()
    send.threadID = groupThread
    send.content.days.days = ["2026-11-03"]
    try Chats.edit(.send(send), in: "g", now: 10, db: db)
    var unsend = Pochical_V1_ChatUnsend()
    unsend.threadID = groupThread
    unsend.seq = 1
    var state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lines.map(\.content) == [.days([Day(year: 2026, month: 10, day: 10), Day(year: 2026, month: 10, day: 12)])])
    #expect(state.waiting.map(\.content) == [.days([Day(year: 2026, month: 11, day: 3)])])

    try Chats.edit(.unsend(unsend), in: "g", now: 11, db: db)
    state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lines.map(\.content) == [.unsent])
  }
}

@Test func aPollsVotesAndItsSettlingShowWhileTheyWait() throws {
  let database = try appDatabase()
  try database.write { db in
    var poll = line(1, "")
    poll.chatLine.content.poll.days = ["2026-10-10", "2026-10-11"]
    var others = Pochical_V1_ChatVotes()
    others.day = "2026-10-11"
    others.userIds = ["u2"]
    poll.chatLine.content.poll.votes = [others]
    try GroupSync.take([poll], of: "g", in: db)
    var vote = Pochical_V1_ChatVote()
    vote.threadID = groupThread
    vote.seq = 1
    vote.day = "2026-10-11"
    vote.on = true
    try Chats.edit(.vote(vote), in: "g", now: 1, db: db)
    var state = try Chats.state(of: groupThread, in: "g", me: "me", now: early, db: db)
    let tenth = Day(year: 2026, month: 10, day: 11)
    var shown = try #require(pollShown(state.lines[0]))
    #expect(shown.votes.voters(on: tenth) == ["u2", "me"])

    var decide = Pochical_V1_ChatDecide()
    decide.threadID = groupThread
    decide.seq = 1
    decide.day = "2026-10-11"
    try Chats.edit(.decide(decide), in: "g", now: 2, db: db)
    state = try Chats.state(of: groupThread, in: "g", me: "me", now: early, db: db)
    shown = try #require(pollShown(state.lines[0]))
    #expect(shown.decided == tenth)
    #expect(state.pins.map(\.seq) == [1])
  }
}

@Test func aNoticeIsKeptAsOneAndALineOfNoKnownKindAsNothing() throws {
  let database = try appDatabase()
  try database.write { db in
    var notice = line(1, "")
    notice.chatLine.content.notice.kind = .removed
    notice.chatLine.content.notice.subjectID = "u3"
    var none = line(2, "")
    none.chatLine.clearContent()
    try GroupSync.take([notice, none], of: "g", in: db)
    let state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(
      state.lines.map(\.content) == [
        .notice(LineNotice(kind: .removed, subjectID: "u3")), .hidden,
      ])
    // Nor can a line of no kind be kept.
    #expect(throws: (any Error).self) {
      try #sql(
        """
        UPDATE "chatLines" SET "content" = '{"kind":"album"}' WHERE "seq" = 1
        """
      )
      .execute(db)
    }
  }
}

private func pollShown(_ line: ChatLineRow) -> LineContent.Poll? {
  if case .poll(let poll) = line.content { poll } else { nil }
}

/// Photos as the wire carries them, each `id` 1×1.
private func wirePhotos(_ ids: [String]) -> [Pochical_V1_ChatPhoto] {
  ids.map { id in
    var photo = Pochical_V1_ChatPhoto()
    photo.id = id
    photo.width = 1
    photo.height = 1
    return photo
  }
}

/// A send of photos to the place's own chat.
private func photoSend(_ ids: [String]) -> Pochical_V1_ChatSend {
  var send = Pochical_V1_ChatSend()
  send.threadID = groupThread
  send.content.photos.photos = wirePhotos(ids)
  return send
}

@Test func aPhotoLineKeepsItsPhotosWhileWaitingAndLosesThemTakenBack() throws {
  let database = try appDatabase()
  try database.write { db in
    var photos = line(1, "")
    photos.chatLine.content.photos.photos = wirePhotos(["p1", "p2", "p3"])
    try GroupSync.take([photos], of: "g", in: db)
    try Chats.edit(.send(photoSend(["p4", "p5"])), in: "g", now: 1, db: db)
    var state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    let sent = ["p1", "p2", "p3"].map { LinePhoto(id: $0, width: 1, height: 1) }
    #expect(state.lines.map(\.content) == [.photos(sent)])
    let waiting = ["p4", "p5"].map { LinePhoto(id: $0, width: 1, height: 1) }
    #expect(state.waiting.map(\.content) == [.photos(waiting)])

    var unsend = Pochical_V1_ChatUnsend()
    unsend.threadID = groupThread
    unsend.seq = 1
    try Chats.edit(.unsend(unsend), in: "g", now: 2, db: db)
    state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lines[0].content == .unsent)
  }
}

@Test func aWaitingLineKeepsWhichOfItsPhotosAreUpThroughSendingAgain() throws {
  let database = try appDatabase()
  try database.write { db in
    try Chats.edit(.send(photoSend(["p1", "p2", "p3"])), in: "g", now: 1000, db: db)
    let opID = try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].opID
    #expect(try Chats.photosToUpload(opID, now: 1000, in: db) == ["p1", "p2", "p3"])

    // Two up, then the third fails: sent again, only the third goes up.
    try Chats.photoUp("p1", of: opID, began: 2000, in: db)
    try Chats.photoUp("p2", of: opID, began: 3000, in: db)
    try Chats.fail(opID, in: db)
    try Chats.sendAgain(opID, now: 4000, in: db)
    #expect(try Chats.photosToUpload(opID, now: 4000, in: db) == ["p3"])
    #expect(try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].up == ["p1", "p2"])

    // Sent again once those up may have gone from the group, half its
    // wait after the latest began going up: all go up again.
    let lapsed = 3000 + Int64(Chat.unsentAfterMs) / 2
    #expect(try Chats.photosToUpload(opID, now: lapsed - 1, in: db) == ["p3"])
    #expect(try Chats.photosToUpload(opID, now: lapsed, in: db) == ["p1", "p2", "p3"])
    try Chats.photoUp("p1", of: opID, began: lapsed, in: db)
    #expect(try Chats.photosToUpload(opID, now: lapsed, in: db) == ["p2", "p3"])
  }
}

@Test func aPhotoIsShrunkToItsLongestSideWithoutItsMetadata() throws {
  // A 3000×1000 picture with a place in its EXIF.
  let context = CGContext(
    data: nil, width: 3000, height: 1000, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  context.setFillColor(red: 0.2, green: 0.5, blue: 0.3, alpha: 1)
  context.fill(CGRect(x: 0, y: 0, width: 3000, height: 1000))
  let out = NSMutableData()
  let destination = CGImageDestinationCreateWithData(out, "public.jpeg" as CFString, 1, nil)!
  CGImageDestinationAddImage(
    destination, context.makeImage()!,
    [kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 35.68]] as CFDictionary)
  CGImageDestinationFinalize(destination)

  let shrunk = try #require(ChatPhotos.shrink(out as Data))
  #expect(shrunk.width == 2048)
  #expect(shrunk.height == 683)
  // Its ThumbHash, landscape and the green it is.
  let hash = try #require(shrunk.thumbHash)
  #expect(hash.count <= Chat.photoThumbHashMaxBytes)
  let blur = try #require(ThumbHash.decode(hash))
  #expect(blur.width == 32 && blur.height < 32)
  #expect(abs(Int(blur.rgba[1]) - 128) < 8)
  let source = CGImageSourceCreateWithData(shrunk.jpeg as CFData, nil)!
  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
  #expect(properties?[kCGImagePropertyGPSDictionary] == nil)
}

@Test func aPhotoGoesWithASmallVersionOnlyWhenLarger() throws {
  let jpeg = { (width: Int, height: Int) -> Data in
    let context = CGContext(
      data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    let out = NSMutableData()
    let destination = CGImageDestinationCreateWithData(out, "public.jpeg" as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, context.makeImage()!, nil)
    CGImageDestinationFinalize(destination)
    return out as Data
  }
  let small = try #require(ChatPhotos.small(jpeg(1000, 2048)))
  let source = CGImageSourceCreateWithData(small as CFData, nil)!
  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
  #expect(properties?[kCGImagePropertyPixelHeight] as? Int == Chat.photoSmallEdge)
  #expect(ChatPhotos.small(jpeg(640, 640)) == nil)
}

@Test func aLinksPageIsAskedForButNotAnInvitations() {
  #expect(previewLink("ここ https://cafe.example/menu どう？") == "https://cafe.example/menu")
  #expect(previewLink("https://pochical.app/invite/ABCDEFGH") == nil)
  #expect(previewLink("リンクなし") == nil)
}

@Test func aWaitingChangeKeepsOrReplacesTheLinesPage() throws {
  let database = try appDatabase()
  try database.write { db in
    var sent = line(1, "ここ https://cafe.example")
    sent.chatLine.content.words.preview.url = "https://cafe.example"
    sent.chatLine.content.words.preview.title = "店"
    try GroupSync.take([sent], of: "g", in: db)
    var change = Pochical_V1_ChatChange()
    change.threadID = groupThread
    change.seq = 1
    change.text = "ここどう？ https://cafe.example"
    change.keepsPreview = true
    try Chats.edit(.change(change), in: "g", now: 1, db: db)
    var state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(preview(of: state.lines[0])?.title == "店")

    change.text = "やっぱりいいや"
    change.keepsPreview = false
    try Chats.edit(.change(change), in: "g", now: 2, db: db)
    state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lines[0].text == "やっぱりいいや")
    #expect(preview(of: state.lines[0]) == nil)
  }
}

private func preview(of line: ChatLineRow) -> LinePreview? {
  if case .words(let words) = line.content { words.preview } else { nil }
}

@Test func blocksComeFromTheUsersSocketAndGo() throws {
  let database = try appDatabase()
  try database.write { db in
    var block = Pochical_V1_Change()
    block.cursor = 1
    block.block.userID = "u2"
    block.block.on = true
    try Groups.take(block, in: db)
    #expect(try Blocks.all(in: db) == ["u2"])
    block.block.on = false
    try Groups.take(block, in: db)
    #expect(try Blocks.all(in: db).isEmpty)

    var hidden = line(1, "")
    hidden.chatLine.content.hidden = Pochical_V1_ChatHidden()
    try GroupSync.take([hidden], of: "g", in: db)
    #expect(try Chats.state(of: groupThread, in: "g", now: early, db: db).lines.map(\.content) == [.hidden])
    // Nor is it the chat's latest line in the list.
    #expect(try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db).last == nil)
  }
}

@Test func theOtherOfAOneToOneChat() {
  let thread = directThread("b", "a")
  #expect(otherIn(thread, me: "a") == "b")
  #expect(otherIn(thread, me: "b") == "a")
  #expect(otherIn(thread, me: "c") == nil)
  #expect(otherIn(groupThread, me: "a") == nil)
}

@Test func aChatTurnedOffCountsItsMentionsWhileMentionsNotify() throws {
  let database = try appDatabase()
  try database.write { db in
    var unread = Pochical_V1_Change()
    unread.cursor = 1
    unread.unreadCount.groupID = "g"
    unread.unreadCount.threadID = groupThread
    unread.unreadCount.count = 3
    unread.unreadCount.mentions = 1
    try Groups.take(unread, in: db)
    #expect(try Chats.unreadByGroup(me: "me", db: db) == ["g": 3])

    var mute = Pochical_V1_Change()
    mute.cursor = 2
    mute.chatMute.groupID = "g"
    mute.chatMute.threadID = groupThread
    mute.chatMute.muted = true
    try Groups.take(mute, in: db)
    #expect(try ChatNotifications.state(in: db).isMuted(groupThread, in: "g"))
    #expect(try Chats.unreadByGroup(me: "me", db: db) == ["g": 1])
    // A chat's own row still counts every unread line.
    #expect(try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db).unread == 3)

    var settings = Pochical_V1_Change()
    settings.cursor = 3
    settings.chatNotifications.mentionsWhenMuted = false
    try Groups.take(settings, in: db)
    #expect(try Chats.unreadByGroup(me: "me", db: db).isEmpty)

    mute.chatMute.muted = false
    try Groups.take(mute, in: db)
    #expect(try Chats.unreadByGroup(me: "me", db: db) == ["g": 3])
  }
}

@Test func aReplyKeepsTheLineItAnswers() throws {
  let database = try appDatabase()
  try database.write { db in
    var reply = line(2, "なに？")
    reply.chatLine.replyTo = 1
    try GroupSync.take([line(1, "はじめ"), reply], of: "g", in: db)
    #expect(try Chats.state(of: groupThread, in: "g", now: early, db: db).lines.map(\.replyTo) == [nil, 1])
  }
}

@Test func aReplysLineFarBackIsHeldForItsQuoteApartFromTheLines() throws {
  let database = try appDatabase()
  try database.write { db in
    // The latest 5–6, 6 answering 1, which the group sends along.
    var reply = line(6, "これ")
    reply.chatLine.replyTo = 1
    try GroupSync.take([line(1, "ずっと前"), line(5, "e"), reply], of: "g", in: db)
    var state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lines.map(\.seq) == [5, 6])
    #expect(state.quoted[1]?.text == "ずっと前")

    // A page's replies bring theirs in its quoted.
    var earlier = line(4, "それ")
    earlier.chatLine.replyTo = 2
    var page = Pochical_V1_ChatPage()
    page.threadID = groupThread
    page.lines = [earlier.chatLine]
    page.quoted = [line(2, "b").chatLine]
    try Chats.take(page, of: "g", in: db)
    state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lines.map(\.seq) == [4, 5, 6])
    #expect(state.quoted.mapValues(\.text) == [1: "ずっと前", 2: "b"])
  }
}

@Test func pinsAndQuotesBeforeTheLinesShowTheMembersWaitingEdits() throws {
  let database = try appDatabase()
  try database.write { db in
    // 1–3, a gap, then 11–130 on to the latest; the chat opens on 81–130.
    var beforeGap = line(2, "ギャップの前")
    beforeGap.chatLine.pinnedOrder = 1
    var held = line(20, "ひらく前")
    held.chatLine.pinnedOrder = 2
    var answersHeld = line(120, "それ")
    answersHeld.chatLine.replyTo = 30
    var answersBeforeGap = line(125, "あれ")
    answersBeforeGap.chatLine.replyTo = 3
    let lines =
      [line(1, "a"), beforeGap, line(3, "c")]
      + (11...130).map { seq in
        switch seq {
        case 20: held
        case 120: answersHeld
        case 125: answersBeforeGap
        default: line(UInt64(seq), "\(seq)")
        }
      }
    try GroupSync.take(lines, of: "g", in: db)
    for (seq, text) in [(UInt64(2), "なおした"), (20, "これもなおした")] {
      var change = Pochical_V1_ChatChange()
      change.threadID = groupThread
      change.seq = seq
      change.text = text
      try Chats.edit(.change(change), in: "g", now: 1, db: db)
    }
    for seq in [UInt64(3), 30] {
      var unsend = Pochical_V1_ChatUnsend()
      unsend.threadID = groupThread
      unsend.seq = seq
      try Chats.edit(.unsend(unsend), in: "g", now: 2, db: db)
    }

    var state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lines.first?.seq == 81)
    #expect(state.pins.map(\.seq) == [20, 2])
    #expect(
      state.pins.map(\.content) == [
        .words(LineContent.Words(text: "これもなおした", edited: true)),
        .words(LineContent.Words(text: "なおした", edited: true)),
      ])
    #expect(state.quoted.mapValues(\.content) == [3: .unsent, 30: .unsent])

    // Asked from past the latest, none held there: laid out as the chat
    // opens, its latest page, the rest of 11–130 held before it.
    state = try Chats.state(of: groupThread, in: "g", from: 200, now: early, db: db)
    #expect(state.lines.first?.seq == 81)
    #expect(state.heldBefore == 70)
    #expect(state.heldFrom == 11)
  }
}

@Test func aSendTheGroupTookLongAgoNoLongerWaits() throws {
  let database = try appDatabase()
  try database.write { db in
    var send = Pochical_V1_ChatSend()
    send.threadID = groupThread
    send.content.words.text = "とどいた"
    try Chats.edit(.send(send), in: "g", now: 1, db: db)
    let taken = try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].opID
    send.content.words.text = "まだ"
    try Chats.edit(.send(send), in: "g", now: 2, db: db)
    // Its line came first, then 129 more: it is far before the lines shown.
    try GroupSync.take(
      [line(1, "とどいた", op: taken)] + (2...130).map { line(UInt64($0), "\($0)") }, of: "g",
      in: db)

    let state = try Chats.state(of: groupThread, in: "g", now: early, db: db)
    #expect(state.lines.first?.seq == 81)
    #expect(state.waiting.map(\.text) == ["まだ"])
  }
}

struct LargeEmojiVectors: Decodable, Sendable {
  struct Case: VectorCase {
    let name: String
    let text: String
    let expected: Int
  }

  let largeEmoji: [Case]
}

@Test(arguments: try vectors("chat-text", as: LargeEmojiVectors.self).largeEmoji)
func emojiShownLarge(_ vector: LargeEmojiVectors.Case) {
  #expect(largeEmoji(vector.text) == vector.expected)
}

@Test func aPhotoThatCouldNotBeSentWaitsAsideUntilSentAgain() throws {
  let database = try appDatabase()
  try database.write { db in
    try Chats.edit(.send(photoSend(["p1"])), in: "g", now: 1, db: db)
    var words = Pochical_V1_ChatSend()
    words.threadID = groupThread
    words.content.words.text = "見て"
    try Chats.edit(.send(words), in: "g", now: 2, db: db)
    let opID = try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].opID

    try Chats.fail(opID, in: db)
    #expect(try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting.map(\.failed) == [true, false])
    // The words go on without it.
    let (frames, sent) = try Chats.frames(of: "g", after: 0, now: early, in: db)
    #expect(frames.flatMap(\.chatEdits.edits).map(\.send.content.words.text) == ["見て"])

    // Sent again, it comes after what was sent, as itself.
    try Chats.sendAgain(opID, now: 3, in: db)
    let again = try Chats.frames(of: "g", after: sent, now: early, in: db).frames.flatMap(\.chatEdits.edits)
    #expect(again.map(\.opID) == [opID])
    #expect(try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting.map(\.failed) == [false, false])
  }
}

@Test func aPhotoStoppedGoingUpIsNotSentUntilSentAgain() throws {
  let database = try appDatabase()
  try database.write { db in
    try Chats.edit(.send(photoSend(["p1"])), in: "g", now: 1, db: db)
    let opID = try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].opID
    #expect(try Chats.stillGoing(opID, now: early, in: db))

    // Stopped with ×: not sent, as one whose photo failed.
    try Chats.fail(opID, in: db)
    #expect(try !Chats.stillGoing(opID, now: early, in: db))
    #expect(try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting.map(\.failed) == [true])

    // Sent again, it goes once more.
    try Chats.sendAgain(opID, now: 2, in: db)
    #expect(try Chats.stillGoing(opID, now: early, in: db))

    // Taken back, nothing is left to go.
    try Chats.takeBack(opID, in: db)
    #expect(try !Chats.stillGoing(opID, now: early, in: db))
  }
}

@Test func aPhotoThatCouldNotBeSentLeavesNothingToSend() throws {
  let database = try appDatabase()
  try database.write { db in
    try Chats.edit(.send(photoSend(["p1"])), in: "g", now: 1, db: db)
    let waiting = try Chats.lastWaiting(of: "g", in: db)
    #expect(try Chats.lastToSend(of: "g", now: early, in: db) == waiting)

    // It waits for the member, so the socket closes without it.
    try Chats.fail(try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].opID, in: db)
    #expect(try Chats.lastWaiting(of: "g", in: db) == waiting)
    #expect(try Chats.lastToSend(of: "g", now: early, in: db) == nil)
  }
}

@Test func aDraftIsKeptWithTheChatAndOpensAsItsLinesAreNow() throws {
  let database = try appDatabase()
  try database.write { db in
    try GroupSync.take([line(1, "明日休み？"), line(2, "了解")], of: "g", in: db)
    try Chats.keepDraft(
      KeptDraft(text: "うん", target: .reply(1)), of: groupThread, in: "g", now: 1, db: db)
    #expect(try Chats.draft(of: groupThread, in: "g", db: db)?.target == .reply(1))
    #expect(try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db).draft?.text == "うん")

    // The line answered taken back meanwhile: the words stay, alone.
    var unsent = line(1, "")
    unsent.chatLine.content.unsent = Pochical_V1_ChatTakenBack()
    try GroupSync.take([unsent], of: "g", in: db)
    #expect(try Chats.draft(of: groupThread, in: "g", db: db) == OpenedDraft(text: "うん"))

    // An edit opens with the line it changes.
    try Chats.keepDraft(
      KeptDraft(text: "了解です", target: .edit(2)), of: groupThread, in: "g", now: 2, db: db)
    #expect(try Chats.draft(of: groupThread, in: "g", db: db)?.target?.editing?.seq == 2)

    // Emptied, it is gone.
    try Chats.keepDraft(KeptDraft(text: ""), of: groupThread, in: "g", now: 3, db: db)
    #expect(try Chats.draft(of: groupThread, in: "g", db: db) == nil)
  }
}

@Test func aDraftNeverAnswersALineAndChangesOneAtOnce() throws {
  let database = try appDatabase()
  try database.write { db in
    try GroupSync.take([line(1, "明日休み？"), line(2, "了解")], of: "g", in: db)
    // Turned from a reply to an edit, it is an edit alone.
    var draft = KeptDraft(text: "了解です", target: .reply(1))
    draft.target = .edit(2)
    try Chats.keepDraft(draft, of: groupThread, in: "g", now: 1, db: db)
    let opened = try Chats.draft(of: groupThread, in: "g", db: db)
    #expect(opened?.target?.editing?.seq == 2)
    #expect(opened?.target?.replyTo == nil)

    // Nor does the device keep one that does.
    #expect(throws: (any Error).self) {
      try ChatDraftRow.insert {
        ChatDraftRow(
          groupID: "g", threadID: "both", text: "x", replyTo: 1, editing: 2, savedAtMs: 1)
      }
      .execute(db)
    }
  }
}

@Test func aOneToOneChatWithOnlyADraftIsListed() throws {
  let database = try appDatabase()
  try database.write { db in
    let thread = directThread("me", "u2")
    try Chats.keepDraft(KeptDraft(text: "やあ"), of: thread, in: "g", now: 1, db: db)
    #expect(try Chats.threads(in: "g", db: db) == [thread])
  }
}

@Test func aLineThatWaitedTooLongIsNotSentByItself() throws {
  let database = try appDatabase()
  try database.write { db in
    var words = Pochical_V1_ChatSend()
    words.threadID = groupThread
    words.content.words.text = "明日休み？"
    try Chats.edit(.send(words), in: "g", now: 1000, db: db)
    words.content.words.text = "あとで"
    try Chats.edit(.send(words), in: "g", now: 5000, db: db)
    let limit = Int64(Chat.unsentAfterMs)

    // Read at its time, with nothing written: the chat, its row in the
    // list and the outbox say so alike, the moment its wait is over.
    let before = try Chats.state(of: groupThread, in: "g", now: 1000 + limit - 1, db: db)
    #expect(before.waiting.map(\.failed) == [false, false])
    #expect(before.failsAt == 1000 + limit)
    let after = try Chats.state(of: groupThread, in: "g", now: 1000 + limit, db: db)
    #expect(after.waiting.map(\.failed) == [true, false])
    #expect(after.failsAt == 5000 + limit)
    let listed = try Chats.summary(of: groupThread, in: "g", me: "me", now: 1000 + limit, db: db)
    #expect(listed.waiting?.text == "あとで")
    #expect(listed.failsAt == 5000 + limit)
    let edits = try Chats.frames(of: "g", after: 0, now: 1000 + limit, in: db).frames
      .flatMap(\.chatEdits.edits)
    #expect(edits.map(\.send.content.words.text) == ["あとで"])
    #expect(try Chats.lastToSend(of: "g", now: 5000 + limit, in: db) == nil)
  }
}

@Test func theChatListSaysTheLatestLineAsTheChatOrdersItsLines() throws {
  let database = try appDatabase()
  try database.write { db in
    try Chats.edit(.send(photoSend(["p1"])), in: "g", now: 1000, db: db)
    let opID = try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].opID
    try Chats.fail(opID, in: db)
    // Not sent and the latest: the list says so.
    #expect(
      try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db).waiting?.failed
        == true)

    // Someone answers after it: their line is the latest.
    var ok = line(1, "ok")
    ok.chatLine.sentAtMs = 2000
    try GroupSync.take([ok], of: "g", in: db)
    let summary = try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db)
    #expect(summary.waiting == nil)
    #expect(summary.last?.text == "ok")

    // A line still being sent is the newest, whenever it was written.
    var words = Pochical_V1_ChatSend()
    words.threadID = groupThread
    words.content.words.text = "見て"
    try Chats.edit(.send(words), in: "g", now: 1500, db: db)
    #expect(
      try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db).waiting?.text
        == "見て")
  }
}

@Test func aLineNotSentShowsOnlyWhereItFallsAmongTheLinesLaidOut() throws {
  let database = try appDatabase()
  try database.write { db in
    // 1–2 laid out, 5 held past a gap.
    var lines = [line(1, "a"), line(2, "b"), line(5, "e")]
    for index in lines.indices {
      lines[index].chatLine.sentAtMs = Int64(lines[index].chatLine.seq) * 1000
    }
    try GroupSync.take(lines, of: "g", in: db)
    var words = Pochical_V1_ChatSend()
    words.threadID = groupThread
    words.content.words.text = "あとで"
    try Chats.edit(.send(words), in: "g", now: 6000, db: db)
    try Chats.fail(try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].opID, in: db)

    let earlier = try Chats.state(of: groupThread, in: "g", from: 1, now: early, db: db)
    #expect(earlier.lines.map(\.seq) == [1, 2])
    #expect(earlier.waiting.isEmpty)
    let latest = try Chats.state(of: groupThread, in: "g", from: 5, now: early, db: db)
    #expect(latest.waiting.map(\.text) == ["あとで"])
  }
}

@Test func aLineWaitsByTheServersTimeWhateverTheDevicesClockDoes() throws {
  let database = try appDatabase()
  let hour: Int64 = 3_600_000
  let limit = Int64(Chat.unsentAfterMs)
  try database.write { db in
    var words = Pochical_V1_ChatSend()
    words.threadID = groupThread
    words.content.words.text = "明日休み？"
    try Chats.edit(.send(words), in: "g", now: 1000, db: db)

    // The device's clock jumps an hour ahead, and Welcome corrects it.
    try Sync.welcome(sentMs: 1000 + hour, receivedMs: 1000 + hour, serverMs: 1000, in: db)
    let before = try Chats.state(of: groupThread, in: "g", now: 1000 + hour + limit - 1, db: db)
    #expect(before.waiting.map(\.failed) == [false])
    // When by the device's own clock.
    #expect(before.failsAt == 1000 + hour + limit)
    let after = try Chats.state(of: groupThread, in: "g", now: 1000 + hour + limit, db: db)
    #expect(after.waiting.map(\.failed) == [true])
  }
}

@Test func aClockSetBackFailsNoLineEarlyOnceAWelcomeCorrectsIt() throws {
  let database = try appDatabase()
  let minute: Int64 = 60_000
  let limit = Int64(Chat.unsentAfterMs)
  try database.write { db in
    var words = Pochical_V1_ChatSend()
    words.threadID = groupThread
    words.content.words.text = "明日休み？"
    let made: Int64 = 1_000 * minute
    try Chats.edit(.send(words), in: "g", now: made, db: db)

    // Set back 15 minutes while offline, read meanwhile.
    let offline = try Chats.state(of: groupThread, in: "g", now: made - 15 * minute, db: db)
    #expect(offline.waiting.map(\.failed) == [false])
    // Back online a minute after writing: Welcome corrects the clock.
    try Sync.welcome(
      sentMs: made - 14 * minute, receivedMs: made - 14 * minute, serverMs: made + minute, in: db)
    let online = try Chats.state(of: groupThread, in: "g", now: made - 14 * minute, db: db)
    #expect(online.waiting.map(\.failed) == [false])
    let over = try Chats.state(of: groupThread, in: "g", now: made - 15 * minute + limit, db: db)
    #expect(over.waiting.map(\.failed) == [true])
  }
}

@Test func aLineTakenBackBeforeItWentOutLeavesNothingToTakeBack() throws {
  let database = try appDatabase()
  try database.write { db in
    var words = Pochical_V1_ChatSend()
    words.threadID = groupThread
    words.content.words.text = "まちがい"
    try Chats.edit(.send(words), in: "g", now: 1, db: db)
    let opID = try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].opID
    try Chats.fail(opID, in: db)

    try Chats.takeBack(opID, in: db)
    #expect(try Chats.lastWaiting(of: "g", in: db) == nil)
  }
}

@Test func aSendTheGroupRefusedStaysAsNotSentAndIsDeletedWithoutARecall() throws {
  let database = try appDatabase()
  try database.write { db in
    var words = Pochical_V1_ChatSend()
    words.threadID = groupThread
    words.content.words.text = "長すぎる"
    try Chats.edit(.send(words), in: "g", now: 1, db: db)
    words.content.words.text = "届く"
    try Chats.edit(.send(words), in: "g", now: 2, db: db)
    let frame = try Chats.frames(of: "g", after: 0, now: early, in: db).frames[0]
    let opIDs = try Chats.goOut(frame.chatEdits.edits, now: early, in: db).map(\.opID)

    try Chats.acknowledge(opIDs, refused: [opIDs[0]], in: db)
    let waiting = try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting
    #expect(waiting.map(\.opID) == [opIDs[0]])
    #expect(waiting.map(\.failed) == [true])

    // The group never had it: nothing is left to take back.
    try Chats.takeBack(opIDs[0], in: db)
    #expect(try Chats.lastWaiting(of: "g", in: db) == nil)
  }
}

@Test func aLineTakenBackAfterItsFrameWasMadeDoesNotGoOut() throws {
  let database = try appDatabase()
  try database.write { db in
    var words = Pochical_V1_ChatSend()
    words.threadID = groupThread
    words.content.words.text = "まちがい"
    try Chats.edit(.send(words), in: "g", now: 1, db: db)
    words.content.words.text = "明日休み？"
    try Chats.edit(.send(words), in: "g", now: 2, db: db)
    let frame = try Chats.frames(of: "g", after: 0, now: early, in: db).frames[0]

    try Chats.takeBack(frame.chatEdits.edits[0].opID, in: db)
    let going = try Chats.goOut(frame.chatEdits.edits, now: early, in: db)
    #expect(going.map(\.send.content.words.text) == ["明日休み？"])
    // Nothing to take back from the group: it never went out.
    let left = try Chats.frames(of: "g", after: 0, now: early, in: db).frames.flatMap(\.chatEdits.edits)
    #expect(left.map(\.send.content.words.text) == ["明日休み？"])
  }
}

@Test func aLineTheGroupTookWhoseAnswerWasLostStopsWaitingRatherThanFailing() throws {
  let database = try appDatabase()
  try database.write { db in
    var words = Pochical_V1_ChatSend()
    words.threadID = groupThread
    words.content.words.text = "届いた"
    try Chats.edit(.send(words), in: "g", now: 1000, db: db)
    let opID = try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].opID
    // Its line came, but not the Acked.
    try GroupSync.take([line(3, "届いた", op: opID)], of: "g", in: db)

    #expect(try Chats.lastWaiting(of: "g", in: db) == nil)
    let state = try Chats.state(
      of: groupThread, in: "g", now: 1000 + Int64(Chat.unsentAfterMs), db: db)
    #expect(state.waiting.isEmpty)
    #expect(state.lines.map(\.text) == ["届いた"])
  }
}

@Test func aLineTakenBackAfterItWentOutIsTakenBackFromTheGroupByItsOpID() throws {
  let database = try appDatabase()
  try database.write { db in
    var words = Pochical_V1_ChatSend()
    words.threadID = groupThread
    words.content.words.text = "まちがい"
    try Chats.edit(.send(words), in: "g", now: 1, db: db)
    let opID = try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting[0].opID
    let frame = try Chats.frames(of: "g", after: 0, now: early, in: db).frames[0]
    #expect(try Chats.goOut(frame.chatEdits.edits, now: early, in: db).map(\.opID) == [opID])

    try Chats.takeBack(opID, in: db)
    #expect(try Chats.state(of: groupThread, in: "g", now: early, db: db).waiting.isEmpty)
    // The group may have taken it, its answer not yet come: it is named.
    let recalls = try Chats.frames(of: "g", after: 0, now: early, in: db).frames.flatMap(\.chatEdits.edits)
    #expect(recalls.map(\.recall.sendOpID) == [opID])
    #expect(recalls.map(\.recall.threadID) == [groupThread])
    // A line of words carries no photo to delete.
    #expect(recalls.map(\.recall.photoIds) == [[]])
    // Should it come meanwhile, it shows taken back already.
    try GroupSync.take([line(7, "まちがい", op: opID)], of: "g", in: db)
    #expect(try Chats.state(of: groupThread, in: "g", now: early, db: db).lines.map(\.content) == [.unsent])
  }
}

@Test func aPhotoLineTakenBackAfterItWentOutNamesAllItsPhotos() throws {
  let database = try appDatabase()
  try database.write { db in
    try Chats.edit(.send(photoSend(["p1", "p2", "p3"])), in: "g", now: 1, db: db)
    let frame = try Chats.frames(of: "g", after: 0, now: 1, in: db).frames[0]
    let sent = try Chats.goOut(frame.chatEdits.edits, now: 1, in: db)

    try Chats.takeBack(sent[0].opID, in: db)
    // The group deletes them with the line, or at once without it.
    let recalls = try Chats.frames(of: "g", after: 0, now: 1, in: db).frames.flatMap(\.chatEdits.edits)
    #expect(recalls.map(\.recall.sendOpID) == [sent[0].opID])
    #expect(recalls.map(\.recall.photoIds) == [["p1", "p2", "p3"]])
  }
}

struct LookVectors: Decodable, Sendable {
  struct Look: Decodable, Sendable {
    let emoji: String
    let icon: String
    let symbol: String
  }

  struct GuessCase: VectorCase {
    let name: String
    let text: String
    let expected: Look
  }

  struct ColorCase: VectorCase {
    let name: String
    let used: [Int]
    let expected: Int
  }

  let guessLook: [GuessCase]
  let nextColor: [ColorCase]
}

@Test(arguments: try vectors("patterns", as: LookVectors.self).guessLook)
func aMarkGuessedFromTheName(_ vector: LookVectors.GuessCase) {
  let look = guessLook(vector.text)
  #expect(look.emoji == vector.expected.emoji)
  #expect(look.icon == vector.expected.icon)
  #expect(look.symbol == vector.expected.symbol)
}

@Test(arguments: try vectors("patterns", as: LookVectors.self).nextColor)
func aNewPatternsColor(_ vector: LookVectors.ColorCase) {
  #expect(nextColor(vector.used, slots: 12) == vector.expected)
}

@Test func aDeletedMembersLinesAreHeldWithNoName() throws {
  let database = try appDatabase()
  try database.write { db in
    var member = Pochical_V1_Change()
    member.cursor = 1
    member.member.userID = "u1"
    member.member.left = true
    member.member.deleted = true
    try GroupSync.take([member, line(1, "")], of: "g", in: db)
    let writer = try #require(try Chats.writers(in: "g", db: db).first)
    #expect(writer.deleted)
    #expect(writer.shownName == "削除されたアカウント")
  }
}

@Test func erasingLeavesTheDeviceAsNew() throws {
  let database = try appDatabase()
  try database.write { db in
    try GroupSync.take([line(1, "やあ")], of: "g", in: db)
    try LocalData.erase(in: db)
    #expect(try Chats.state(of: groupThread, in: "g", now: early, db: db).lines.isEmpty)
    #expect(try Int.fetchOne(db, sql: "SELECT count(*) FROM syncState") == 0)
  }
}

@Test func countsWhatTheDeviceHolds() throws {
  let database = try appDatabase()
  let fresh = try database.read { try Holdings.onDevice(in: $0) }
  #expect(fresh.isEmpty)
  try database.write { db in
    try db.execute(sql: #"INSERT INTO "days" ("date", "pattern") VALUES ('2026-10-01', 'day'), ('2026-10-02', '')"#)
    let held = try Holdings.onDevice(in: db)
    #expect(held == Holdings(shiftDays: 1))
    #expect(!held.isEmpty)
  }
}

@Test func theNotificationsOfLinesReadAreKnownFromTheMarkOrTheCount() throws {
  let database = try appDatabase()
  try database.write { db in
    let shown = [
      NotifiedLine(id: "a", groupID: "g", threadID: groupThread, seq: 4),
      NotifiedLine(id: "b", groupID: "g", threadID: groupThread, seq: 6),
      NotifiedLine(id: "c", groupID: "g", threadID: "direct:me:u1", seq: 3),
    ]
    #expect(try readNotified(shown, ReadState(me: "me", in: db)).isEmpty)
    // Read here up to 5: the group's first.
    var mark = Pochical_V1_Change()
    mark.cursor = 1
    mark.readMark.threadID = groupThread
    mark.readMark.userID = "me"
    mark.readMark.lastReadSeq = 5
    try GroupSync.take([mark], of: "g", in: db)
    #expect(try readNotified(shown, ReadState(me: "me", in: db)) == ["a"])
    // Read elsewhere: the one-to-one chat has nothing unread left.
    var count = Pochical_V1_UnreadCount()
    count.groupID = "g"
    count.threadID = "direct:me:u1"
    count.count = 0
    try Chats.take(count, in: db)
    #expect(try readNotified(shown, ReadState(me: "me", in: db)).sorted() == ["a", "c"])
  }
}

@Test func untilSentReturnsOnceTheOutboxHasNothingLeftToSend() async throws {
  let database = try appDatabase()
  var send = Pochical_V1_ChatSend()
  send.threadID = groupThread
  send.content.words.text = "行けそう"
  let edit = Pochical_V1_ChatEdit.OneOf_Kind.send(send)
  let now = SyncClient.nowMs()
  try await database.write { db in
    try Chats.edit(edit, in: "g", now: now, db: db)
    try Chats.edit(edit, in: "g", now: now, db: db)
  }
  let waiting = Task { await Chats.untilSent(of: "g", in: database) }
  let opIDs = try await database.read { db in
    try ChatOutboxRow.where { $0.groupID.eq("g") }.order(by: \.id).fetchAll(db).map(\.opID)
  }
  // The first acknowledged, the second failed: nothing is left to send.
  try await database.write { db in
    try Chats.acknowledge([opIDs[0]], refused: [], in: db)
    try Chats.fail(opIDs[1], in: db)
  }
  await waiting.value
}

@Test func untilSentReturnsAsTheLastLineToSendStopsGoingByItself() async throws {
  let database = try appDatabase()
  var send = Pochical_V1_ChatSend()
  send.threadID = groupThread
  send.content.words.text = "行けそう"
  let edit = Pochical_V1_ChatEdit.OneOf_Kind.send(send)
  let waitLeft: Int64 = 300
  let written = SyncClient.nowMs() - Int64(Chat.unsentAfterMs) + waitLeft
  try await database.write { db in
    try Chats.edit(edit, in: "g", now: written, db: db)
  }
  // Nothing written: its wait being over is what ends it.
  await Chats.untilSent(of: "g", in: database)
  #expect(SyncClient.nowMs() >= written + Int64(Chat.unsentAfterMs))
}

@MainActor @Test func aLineBeingSentIsPastStoppingAndAStopFirstKeepsItsLine() {
  // Its photos up with the line still going: sent, and × then stops
  // nothing.
  let uploads = PhotoUploads()
  uploads.began("p1", of: "l1", try: UUID()) {}
  #expect(uploads.stoppable("l1"))
  uploads.finished("p1", of: "l1")
  #expect(uploads.sent["p1"] == 1)
  #expect(uploads.send("l1") { true })
  #expect(!uploads.stoppable("l1"))
  #expect(!uploads.stop("l1"))
  #expect(uploads.sent["p1"] == 1)

  // Stopped with × just before: the line, marked not sent, does not go.
  var stillGoing = true
  uploads.began("p2", of: "l2", try: UUID()) {}
  if uploads.stop("l2") { stillGoing = false }
  #expect(!uploads.send("l2") { stillGoing })
  #expect(uploads.stoppable("l2"))

  // Going up again, as when sent again, it can be stopped once more.
  uploads.began("p1", of: "l1", try: UUID()) {}
  #expect(uploads.stoppable("l1"))
  uploads.forget("l1", photos: ["p1"])
  #expect(uploads.sent["p1"] == nil)
}
