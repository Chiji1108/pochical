import Foundation
import PochicalDesign
import PochicalProto
import SQLiteData
import Testing

@testable import PochicalKit

/// A chat of `count` lines as a long-running group holds it: replies to
/// earlier lines, five pins, a read mark near the end and a change waiting.
private func longChat(_ count: Int, in db: Database) throws {
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
  mark.readMark.lastReadSeq = UInt64(count - 10)
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
