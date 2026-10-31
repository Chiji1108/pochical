import Foundation
import PochicalDesign
import PochicalProto
import SQLiteData
import Testing

@testable import PochicalKit

/// A chat of `count` lines as a long-running group holds it: replies to
/// earlier lines, five pins, a read mark at `read` (near the end unless
/// said) and a change waiting.
private func longChat(_ count: Int, read: Int? = nil, in db: Database) throws {
  let lines = (1...count).map { seq in
    var change = Pochical_V1_Change()
    change.cursor = UInt64(seq)
    change.chatLine.threadID = groupThread
    change.chatLine.seq = UInt64(seq)
    change.chatLine.authorID = seq.isMultiple(of: 3) ? "me" : "u1"
    change.chatLine.content.words.text = "line \(seq) " + String(repeating: "あ", count: seq % 40)
    change.chatLine.sentAtMs = Int64(seq) * 60_000
    change.chatLine.opID = "op\(seq)"
    if seq > 1, seq.isMultiple(of: 10) {
      change.chatLine.replyTo = UInt64(seq / 2)
    }
    if seq.isMultiple(of: count / 5) {
      change.chatLine.pinnedOrder = UInt64(seq)
    }
    if seq.isMultiple(of: 7) {
      var reaction = Pochical_V1_ChatReaction()
      reaction.emoji = "👍"
      reaction.userIds = ["u1", "u2"]
      change.chatLine.reactions = [reaction]
    }
    return change
  }
  try GroupSync.take(lines, of: "g", in: db)
  var mark = Pochical_V1_Change()
  mark.cursor = UInt64(count + 1)
  mark.readMark.threadID = groupThread
  mark.readMark.userID = "me"
  mark.readMark.lastReadSeq = UInt64(read ?? count - 10)
  try GroupSync.take([mark], of: "g", in: db)
  var change = Pochical_V1_ChatChange()
  change.threadID = groupThread
  change.seq = UInt64(count / 2)
  change.text = "なおした"
  try Chats.edit(.change(change), in: "g", now: 1, db: db)
}

/// How long a long chat's state takes to read, as its screen reads it on
/// opening and on every change. Run with POCHICAL_BENCH=1, best in release:
/// `POCHICAL_BENCH=1 swift test -c release -Xswiftc -enable-testing
/// --filter longChatsState`.
@Test(
  .enabled(if: ProcessInfo.processInfo.environment["POCHICAL_BENCH"] != nil),
  arguments: [500, 3000, 10000])
func longChatsState(_ count: Int) throws {
  let database = try appDatabase()
  try database.write { db in try longChat(count, in: db) }
  try database.read { db in
    let read = { try Chats.state(of: groupThread, in: "g", me: "me", now: early, db: db) }
    #expect(try read().lines.count == Chat.pageSize)
    for _ in 0..<5 { _ = try read() }
    var times: [Duration] = []
    for _ in 0..<50 {
      let start = ContinuousClock.now
      _ = try read()
      times.append(ContinuousClock.now - start)
    }
    times.sort()
    let ms = { (duration: Duration) in
      String(format: "%.3f", duration / .milliseconds(1))
    }
    print(
      "Chats.state, \(count) lines: median \(ms(times[25])) ms,",
      "min \(ms(times[0])), p90 \(ms(times[45])) (50 runs)")
  }
}

/// How long a chat's row in the list takes to read with `count` unread
/// lines, as the list reads it on the main thread on opening and on every
/// change of the chat. Run as `longChatsState` is.
@Test(
  .enabled(if: ProcessInfo.processInfo.environment["POCHICAL_BENCH"] != nil),
  arguments: [500, 3000, 10000])
func longUnreadChatsSummary(_ count: Int) throws {
  let database = try appDatabase()
  try database.write { db in
    try longChat(count, read: 0, in: db)
    var unread = Pochical_V1_Change()
    unread.cursor = UInt64(count + 2)
    unread.unreadCount.groupID = "g"
    unread.unreadCount.threadID = groupThread
    unread.unreadCount.count = UInt32(count)
    unread.unreadCount.mentions = 1
    try Sync.take([unread], in: db)
  }
  try database.read { db in
    let read = { try Chats.summary(of: groupThread, in: "g", me: "me", now: early, db: db) }
    #expect(try read().mentioned)
    var times: [Duration] = []
    for _ in 0..<50 {
      let start = ContinuousClock.now
      _ = try read()
      times.append(ContinuousClock.now - start)
    }
    times.sort()
    let ms = { (duration: Duration) in
      String(format: "%.3f", duration / .milliseconds(1))
    }
    print(
      "Chats.summary, \(count) unread lines: median \(ms(times[25])) ms,",
      "min \(ms(times[0])), p90 \(ms(times[45])) (50 runs)")
  }
}

/// How long `count` messages take to cut into their words, links and
/// mentions, as a chat's lines are. Run as `longChatsState` is.
@Test(
  .enabled(if: ProcessInfo.processInfo.environment["POCHICAL_BENCH"] != nil),
  arguments: [3000])
func manyMessagesCut(_ count: Int) {
  let texts = (0..<count).map { "<@u\($0)> line https://pochical.app/\($0) あ" }
  let start = ContinuousClock.now
  let parts = texts.reduce(0) { $0 + textParts($1).count }
  #expect(parts == count * 4)
  print("textParts, \(count) messages: \(start.duration(to: .now) / .milliseconds(1)) ms")
}
