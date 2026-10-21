import Foundation
import PochicalProto
import Testing

@testable import PochicalKit

private struct PhotoVectors: Decodable {
  struct Seen: VectorCase {
    struct Line: Decodable, Sendable {
      let kind: LineContent.Kind
      let hidden, ownChat, writerBlocked: Bool
    }
    let name: String
    let line: Line
    let expected: Bool
  }

  struct Run: VectorCase {
    struct Step: Decodable, Sendable {
      struct Open: Decodable, Sendable {
        let held: [String]
        let tapped: String
      }
      struct Lines: Decodable, Sendable {
        let cursor: UInt64
        let photos: [String]
        let gone: [Int64]?
        let blocked: [String]?
      }
      struct Page: Decodable, Sendable {
        let seq: Int64
        let after: Bool
        let photos: [String]
        let offset, total: Int
        let cursor: UInt64
      }
      let open: Open?
      let latest: Bool?
      let lines: Lines?
      let page: Page?
      let show: String?
      let reconnected: Bool?
    }
    struct Expected: Decodable, Sendable, Equatable {
      struct Ask: Decodable, Sendable, Equatable {
        let seq: Int64
        let after: Bool
      }
      let photos: [String]
      let shown: String?
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

/// A photo as the vectors name it: its line's seq and a letter for its
/// place in the line, `a` its first.
private func key(_ name: String) -> PhotoKey {
  let letter = name.unicodeScalars.last?.value ?? 0
  return PhotoKey(
    seq: Int64(name.dropLast()) ?? 0, index: Int(letter) - Int(("a" as Unicode.Scalar).value))
}

private func name(_ key: PhotoKey) -> String {
  "\(key.seq)\(Character(Unicode.Scalar(UInt8(97 + key.index))))"
}

/// The photo the vectors name, its writer `w` and its line's seq.
private func item(_ name: String) -> ChatPhotoItem {
  let key = key(name)
  return ChatPhotoItem(
    key: key, photo: LinePhoto(id: "p\(name)", width: 1, height: 1), authorID: "w\(key.seq)",
    sentAt: Date(timeIntervalSince1970: 0))
}

@Test(arguments: try vectors("chat-photos", as: PhotoVectors.self).seen)
private func seenPhoto(_ test: PhotoVectors.Seen) {
  let line = test.line
  // A line hidden from the reader comes as hidden, whatever it was.
  let kind = line.hidden ? .hidden : line.kind
  #expect(
    PhotoRun.seen(kind, ownChat: line.ownChat, writerBlocked: line.writerBlocked)
      == test.expected)
}

@Test(arguments: try vectors("chat-photos", as: PhotoVectors.self).run)
private func photoRun(_ test: PhotoVectors.Run) {
  var run: PhotoRun?
  for (number, step) in test.steps.enumerated() {
    let given = step.step
    if let open = given.open {
      run = PhotoRun(held: open.held.map(item), tapped: key(open.tapped), ahead: test.ahead)
    }
    if given.latest == true { run = PhotoRun(latest: test.ahead) }
    if let lines = given.lines {
      run?.follow(
        PhotoLines(
          cursor: lines.cursor, photos: lines.photos.map(key), gone: Set(lines.gone ?? []),
          blocked: Set(lines.blocked ?? [])))
    }
    if let page = given.page {
      run?.take(
        ChatPhotosPage(
          threadID: "group", seq: page.seq, after: page.after, photos: page.photos.map(item),
          offset: page.offset, total: page.total, cursor: page.cursor))
    }
    if let show = given.show { run?.show(key(show)) }
    if given.reconnected == true { run?.reconnected() }
    guard var now = run else {
      Issue.record("step \(number) before opening")
      return
    }
    let asks = now.asks().map { PhotoVectors.Run.Expected.Ask(seq: $0.seq, after: $0.after) }
    run = now
    let got = PhotoVectors.Run.Expected(
      photos: now.photos.map { name($0.key) }, shown: now.shown.map(name),
      place: now.place.map { [$0.number, $0.of] }, asks: asks)
    #expect(got == step.expected, "step \(number)")
  }
}

@Test func aPageFromTheWireNumbersEachLinesPhotosInItsOrder() {
  var wire = Pochical_V1_ChatPhotos()
  for seq in [4, 4, 4, 6] as [UInt64] {
    var entry = Pochical_V1_ChatPhotoEntry()
    entry.seq = seq
    entry.photo.id = "p\(wire.photos.count)"
    wire.photos.append(entry)
  }
  #expect(ChatPhotosPage(wire).photos.map { name($0.key) } == ["4a", "4b", "4c", "6a"])
}

/// A line of the place's own chat as the group sends it: photos when
/// `photos` names some, else words.
private func chatLine(
  _ seq: UInt64, cursor: UInt64? = nil, photos: [String] = [], author: String = "u1",
  unsent: Bool = false
) -> Pochical_V1_Change {
  var change = Pochical_V1_Change()
  change.cursor = cursor ?? seq
  change.chatLine.threadID = groupThread
  change.chatLine.seq = seq
  change.chatLine.authorID = author
  change.chatLine.opID = "op\(seq)"
  if unsent {
    change.chatLine.content.unsent = Pochical_V1_ChatTakenBack()
  } else if photos.isEmpty {
    change.chatLine.content.words.text = "words"
  } else {
    change.chatLine.content.photos.photos = photos.map { id in
      var photo = Pochical_V1_ChatPhoto()
      photo.id = id
      photo.width = 1
      photo.height = 1
      return photo
    }
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
    // Words at 2 and 5, at 3 a photo of someone the reader blocked, and
    // at 4 a line of two.
    try GroupSync.take(
      [
        chatLine(1, photos: ["p1"]), chatLine(2), chatLine(3, photos: ["p3"], author: "blocked"),
        chatLine(4, photos: ["p4a", "p4b"]), chatLine(5),
      ], of: "g", in: db)
    try BlockRow.upsert { BlockRow(userID: "blocked") }.execute(db)
    let lines = { try Chats.photoLines(of: "g", thread: groupThread, in: db) }
    let first = try lines()
    #expect(first.cursor == 5)
    #expect(first.photos.map(name) == ["1a", "4a", "4b"])
    #expect(first.gone.isEmpty)
    #expect(first.blocked == ["blocked"])

    let held = try ChatLineRow.where { $0.groupID.eq("g") }.order(by: \.seq).fetchAll(db)
      .flatMap { ChatPhotoItem.items(of: $0, blocked: first.blocked) }
    #expect(held.map(\.photo.id) == ["p1", "p4a", "p4b"])
    var run = PhotoRun(held: held, tapped: PhotoKey(seq: 4, index: 1))
    run.follow(first)
    run.take(page(4, after: false, [held[0]], offset: 0, total: 3, cursor: 5))
    #expect(run.place?.number == 3)
    #expect(run.place?.of == 3)

    // 4 taken back, and a photo sent at 6.
    try GroupSync.take(
      [chatLine(4, cursor: 6, unsent: true), chatLine(6, cursor: 7, photos: ["p6"])], of: "g",
      in: db)
    let now = try lines()
    #expect(now.cursor == 7)
    #expect(!now.samePhotos(as: first))
    run.follow(now)
    #expect(run.photos.map(\.photo.id) == ["p1"])
    #expect(run.shown == PhotoKey(seq: 1))
    #expect(run.place == nil)

    // A page the group counted before the change is dropped; one after it
    // says where the photo is now.
    run.take(page(1, after: true, Array(held[1...]), offset: 1, total: 3, cursor: 5))
    #expect(run.place == nil)
    let sixth = try #require(
      try ChatLineRow.where { $0.seq.eq(Int64(6)) }.fetchAll(db)
        .flatMap { ChatPhotoItem.items(of: $0, blocked: []) }.first)
    run.take(page(1, after: true, [sixth], offset: 1, total: 2, cursor: 7))
    run.take(page(1, after: false, [], offset: 0, total: 2, cursor: 7))
    #expect(run.photos.map(\.photo.id) == ["p1", "p6"])
    #expect(run.place?.number == 1)
    #expect(run.place?.of == 2)
  }
}
