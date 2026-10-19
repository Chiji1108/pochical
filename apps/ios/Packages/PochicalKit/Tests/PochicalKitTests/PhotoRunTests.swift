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
      struct Line: Decodable, Sendable {
        let seq: Int64
        let photo: Bool
      }
      let open: Open?
      let latest: Bool?
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
    if given.latest == true { run = PhotoRun(latest: test.ahead) }
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
      run?.follow(lines.map { ($0.seq, $0.photo ? item($0.seq) : nil) })
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

