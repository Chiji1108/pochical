import Foundation
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
      let open: Open?
      let page: Page?
      let show: Int64?
      let line: Int64?
      let gone: Gone?
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

@Test func followsTheChatsLines() {
  var run = PhotoRun(held: [item(3), item(5)], tapped: 5, ahead: 1)
  run.take(
    ChatPhotosPage(threadID: "group", seq: 5, after: true, photos: [], offset: 2, total: 2))
  run.take(
    ChatPhotosPage(threadID: "group", seq: 3, after: false, photos: [], offset: 0, total: 2))
  run.follow([(3, item(3)), (4, nil), (5, item(5))])
  // A new photo at the end, and one taken back.
  run.follow([(3, nil), (4, nil), (5, item(5)), (6, item(6))])
  #expect(run.photos.map(\.seq) == [5, 6])
  #expect(run.total == 2)
  #expect(run.place?.number == 1)
}
