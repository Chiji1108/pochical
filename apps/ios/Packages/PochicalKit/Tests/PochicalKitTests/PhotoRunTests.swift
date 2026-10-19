import Foundation
import PochicalProto
import Testing

@testable import PochicalKit

private struct PhotoVectors: Decodable {
  struct Seen: VectorCase {
    struct Line: Decodable, Sendable {
      let photo, unsent, hidden, ownChat, writerBlocked: Bool
    }
    let name: String
    let line: Line
    let expected: Bool
  }

  struct Run: VectorCase {
    struct Step: Decodable, Sendable {
      struct Open: Decodable, Sendable {
        let held: [Int64]
        let tapped: Int64
      }
      struct Page: Decodable, Sendable {
        let seq: Int64
        let after: Bool
        let seqs: [Int64]
        let offset, total: Int
      }
      struct Gone: Decodable, Sendable {
        let seq: Int64
        let wasPhoto: Bool?
      }
      struct Line: Decodable, Sendable {
        let seq: Int64
        let photo: Bool
      }
      let open: Open?
      let page: Page?
      let show: Int64?
      let line: Int64?
      let gone: Gone?
      let lines: [Line]?
      let reconnected: Bool?
    }
    struct Expected: Decodable, Sendable, Equatable {
      struct Ask: Decodable, Sendable, Equatable {
        let seq: Int64
        let after: Bool
      }
      let seqs: [Int64]
      let offset, total: Int?
      let shown: Int64?
      let asks: [Ask]
    }
    struct Case: Decodable, Sendable {
      let step: Step
      let expected: Expected
    }
    let name: String
    let ahead: Int
    let steps: [Case]
  }

  let seen: [Seen]
  let run: [Run]
}

private func item(_ seq: Int64) -> ChatPhotoItem {
  ChatPhotoItem(
    seq: seq, photo: LinePhoto(id: "p\(seq)", width: 1, height: 1), authorID: "a",
    sentAt: Date(timeIntervalSince1970: 0))
}

@Test(arguments: try vectors("chat-photos", as: PhotoVectors.self).seen)
private func seenPhoto(_ test: PhotoVectors.Seen) {
  let line = test.line
  #expect(
    PhotoRun.seen(
      photo: line.photo, unsent: line.unsent, hidden: line.hidden, ownChat: line.ownChat,
      writerBlocked: line.writerBlocked) == test.expected)
}

@Test(arguments: try vectors("chat-photos", as: PhotoVectors.self).run)
private func photoRun(_ test: PhotoVectors.Run) {
  var run: PhotoRun?
  for (number, step) in test.steps.enumerated() {
    let given = step.step
    if let open = given.open {
      run = PhotoRun(held: open.held.map(item), tapped: open.tapped, ahead: test.ahead)
    }
    if let page = given.page {
      run?.take(
        ChatPhotosPage(
          threadID: "group", seq: page.seq, after: page.after, photos: page.seqs.map(item),
          offset: page.offset, total: page.total))
    }
    if let show = given.show { run?.show(show) }
    if let line = given.line { run?.added(item(line)) }
    if let gone = given.gone { run?.gone(gone.seq, wasPhoto: gone.wasPhoto) }
    if let lines = given.lines {
      run?.follow(
        PhotoLines(
          latest: lines.map(\.seq).max() ?? 0,
          lines: lines.map { PhotoLines.Line(seq: $0.seq, item: $0.photo ? item($0.seq) : nil) }))
    }
    if given.reconnected == true { run?.reconnected() }
    guard var now = run else {
      Issue.record("step \(number) before opening")
      return
    }
    let asks = now.asks().map { PhotoVectors.Run.Expected.Ask(seq: $0.seq, after: $0.after) }
    run = now
    let got = PhotoVectors.Run.Expected(
      seqs: now.photos.map(\.seq), offset: now.offset, total: now.total, shown: now.shown,
      asks: asks)
    #expect(got == step.expected, "step \(number)")
  }
}

/// A line of the place's own chat as the group sends it: a photo when
/// `photo` names one, else words.
private func chatLine(
  _ seq: UInt64, cursor: UInt64? = nil, photo: String? = nil, author: String = "u1",
  unsent: Bool = false
) -> Pochical_V1_Change {
  var change = Pochical_V1_Change()
  change.cursor = cursor ?? seq
  change.chatLine.threadID = groupThread
  change.chatLine.seq = seq
  change.chatLine.authorID = author
  change.chatLine.opID = "op\(seq)"
  change.chatLine.unsent = unsent
  if let photo {
    change.chatLine.photo.id = photo
    change.chatLine.photo.width = 1
    change.chatLine.photo.height = 1
  } else if !unsent {
    change.chatLine.text = "words"
  }
  return change
}

@Test func thePhotoOpenedLargeFollowsThePhotosOnTheDevice() throws {
  let database = try appDatabase()
  try database.write { db in
    // Words at 2 and 5, and at 3 a photo of someone the reader blocked.
    try GroupSync.take(
      [
        chatLine(1, photo: "p1"), chatLine(2), chatLine(3, photo: "p3", author: "blocked"),
        chatLine(4, photo: "p4"), chatLine(5),
      ], of: "g", in: db)
    let lines = { try Chats.photoLines(of: "g", thread: groupThread, blocked: ["blocked"], in: db) }
    let first = try lines()
    #expect(first.latest == 5)
    #expect(first.lines.map(\.seq) == [1, 3, 4])
    #expect(first.lines.compactMap(\.item?.seq) == [1, 4])

    var run = PhotoRun(held: first.lines.compactMap(\.item), tapped: 4)
    run.follow(first)
    run.take(
      ChatPhotosPage(
        threadID: groupThread, seq: 1, after: false, photos: [], offset: 0, total: 2))
    // 1 taken back, and a photo sent at 6.
    try GroupSync.take(
      [chatLine(1, cursor: 6, unsent: true), chatLine(6, cursor: 7, photo: "p6")], of: "g",
      in: db)
    run.follow(try lines())
    #expect(run.photos.map(\.seq) == [4, 6])
    #expect(run.total == 2)
    #expect(run.shown == 4)
  }
}

