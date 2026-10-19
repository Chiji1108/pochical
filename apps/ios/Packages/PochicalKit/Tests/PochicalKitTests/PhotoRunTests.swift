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
      struct Lines: Decodable, Sendable {
        let cursor: UInt64
        let photos: [Int64]
        let gone: [Int64]?
        let blocked: [String]?
      }
      struct Page: Decodable, Sendable {
        let seq: Int64
        let after: Bool
        let seqs: [Int64]
        let offset, total: Int
        let cursor: UInt64
      }
      let open: Open?
      let latest: Bool?
      let lines: Lines?
      let page: Page?
      let show: Int64?
      let reconnected: Bool?
    }
    struct Expected: Decodable, Sendable, Equatable {
      struct Ask: Decodable, Sendable, Equatable {
        let seq: Int64
        let after: Bool
      }
      let seqs: [Int64]
      let shown: Int64?
      let place: [Int]?
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

/// The photo of the line `seq`, its writer `w` and the seq, as the
/// vectors name them.
private func item(_ seq: Int64) -> ChatPhotoItem {
  ChatPhotoItem(
    seq: seq, photo: LinePhoto(id: "p\(seq)", width: 1, height: 1), authorID: "w\(seq)",
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
    if given.latest == true { run = PhotoRun(latest: test.ahead) }
    if let lines = given.lines {
      run?.follow(
        PhotoLines(
          cursor: lines.cursor, photos: lines.photos, gone: Set(lines.gone ?? []),
          blocked: Set(lines.blocked ?? [])))
    }
    if let page = given.page {
      run?.take(
        ChatPhotosPage(
          threadID: "group", seq: page.seq, after: page.after, photos: page.seqs.map(item),
          offset: page.offset, total: page.total, cursor: page.cursor))
    }
    if let show = given.show { run?.show(show) }
    if given.reconnected == true { run?.reconnected() }
    guard var now = run else {
      Issue.record("step \(number) before opening")
      return
    }
    let asks = now.asks().map { PhotoVectors.Run.Expected.Ask(seq: $0.seq, after: $0.after) }
    run = now
    let got = PhotoVectors.Run.Expected(
      seqs: now.photos.map(\.seq), shown: now.shown, place: now.place.map { [$0.number, $0.of] },
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

private func page(
  _ seq: Int64, after: Bool, _ photos: [ChatPhotoItem], offset: Int, total: Int, cursor: UInt64
) -> ChatPhotosPage {
  ChatPhotosPage(
    threadID: groupThread, seq: seq, after: after, photos: photos, offset: offset, total: total,
    cursor: cursor)
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
    try BlockRow.upsert { BlockRow(userID: "blocked") }.execute(db)
    let lines = { try Chats.photoLines(of: "g", thread: groupThread, in: db) }
    let first = try lines()
    #expect(first.cursor == 5)
    #expect(first.photos == [1, 4])
    #expect(first.gone.isEmpty)
    #expect(first.blocked == ["blocked"])

    let held = try ChatLineRow.where { $0.groupID.eq("g") }.order(by: \.seq).fetchAll(db)
      .compactMap { ChatPhotoItem($0, blocked: first.blocked) }
    var run = PhotoRun(held: held, tapped: 4)
    run.follow(first)
    run.take(page(4, after: false, [held[0]], offset: 0, total: 2, cursor: 5))
    #expect(run.place?.number == 2)
    #expect(run.place?.of == 2)

    // 1 taken back, and a photo sent at 6.
    try GroupSync.take(
      [chatLine(1, cursor: 6, unsent: true), chatLine(6, cursor: 7, photo: "p6")], of: "g",
      in: db)
    let now = try lines()
    #expect(now.cursor == 7)
    #expect(!now.samePhotos(as: first))
    run.follow(now)
    #expect(run.photos.map(\.seq) == [4])
    #expect(run.shown == 4)
    #expect(run.place == nil)

    // A page the group counted before the change is dropped; one after it
    // says where the photo is now.
    run.take(page(4, after: false, [held[0]], offset: 0, total: 2, cursor: 5))
    #expect(run.place == nil)
    let sixth = ChatPhotoItem(
      seq: 6, photo: LinePhoto(id: "p6", width: 1, height: 1), authorID: "u1", sentAt: .now)
    run.take(page(4, after: true, [sixth], offset: 1, total: 2, cursor: 7))
    run.take(page(4, after: false, [], offset: 0, total: 2, cursor: 7))
    #expect(run.photos.map(\.seq) == [4, 6])
    #expect(run.place?.number == 1)
    #expect(run.place?.of == 2)
  }
}
