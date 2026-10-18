import Foundation
import GRDB
import PochicalDesign
import PochicalProto
import SQLiteData

/// One of a chat's photos, as its photos alone come (ChatPhotos), and the
/// line that sent it.
public struct ChatPhotoItem: Hashable, Sendable, Identifiable {
  public let seq: Int64
  public let photo: LinePhoto
  public let authorID: String
  public let sentAt: Date
  public var id: String { photo.id }

  public init(seq: Int64, photo: LinePhoto, authorID: String, sentAt: Date) {
    self.seq = seq
    self.photo = photo
    self.authorID = authorID
    self.sentAt = sentAt
  }

  /// The line's photo, when the reader sees it among the chat's: not one
  /// of someone in `blocked` in the place's own chat, where their lines
  /// fold away.
  public init?(_ line: ChatLineRow, blocked: Set<String>) {
    guard let photo = line.photo,
      PhotoRun.seen(
        photo: true, unsent: line.unsent, hidden: line.hidden,
        ownChat: line.threadID == groupThread, writerBlocked: blocked.contains(line.authorID))
    else { return nil }
    self.init(
      seq: line.seq, photo: photo, authorID: line.authorID,
      sentAt: Date(timeIntervalSince1970: TimeInterval(line.sentAtMs) / 1000))
  }

  init(_ wire: Pochical_V1_ChatPhotoEntry) {
    self.init(
      seq: Int64(wire.seq), photo: LinePhoto(wire.photo), authorID: wire.authorID,
      sentAt: Date(timeIntervalSince1970: TimeInterval(wire.sentAtMs) / 1000))
  }
}

/// A page of a chat's photos, answering a ChatPhotosRequest: those nearest
/// `seq` on the asked side, oldest first, how many come before them and
/// how many the chat holds for the reader.
public struct ChatPhotosPage: Sendable {
  public let threadID: String
  public let seq: Int64
  public let after: Bool
  public let photos: [ChatPhotoItem]
  public let offset: Int
  public let total: Int

  public init(
    threadID: String, seq: Int64, after: Bool, photos: [ChatPhotoItem], offset: Int, total: Int
  ) {
    self.threadID = threadID
    self.seq = seq
    self.after = after
    self.photos = photos
    self.offset = offset
    self.total = total
  }

  public init(_ wire: Pochical_V1_ChatPhotos) {
    self.init(
      threadID: wire.threadID, seq: Int64(wire.seq), after: wire.after,
      photos: wire.photos.map(ChatPhotoItem.init), offset: Int(wire.offset),
      total: Int(wire.total))
  }
}

/// The photos a chat's photo opened large swipes through (spec/chat.md,
/// Photos), as spec/vectors/chat-photos.json pins them down: those the
/// device holds of all the chat's, from the lines laid out as it opens and
/// then a page at a time from the group as the person nears an end, where
/// they are among all of them, and the one shown. It follows the chat as
/// photos come and go while it is open.
public struct PhotoRun: Sendable {
  /// A page to ask the group for: the photos before `seq`, or after it.
  public struct Ask: Hashable, Sendable {
    public let seq: Int64
    public let after: Bool

    public init(seq: Int64, after: Bool) {
      self.seq = seq
      self.after = after
    }
  }

  /// The photos held, in the order of their lines, with no gap between.
  public private(set) var photos: [ChatPhotoItem]
  /// How many of the chat's photos come before those held; nil until a
  /// page says.
  public private(set) var offset: Int?
  /// How many photos the chat holds for the reader; nil until a page says.
  public private(set) var total: Int?
  /// The line of the photo shown; nil once none is left, which closes it.
  public private(set) var shown: Int64?
  private var asked: Set<Ask> = []
  private let ahead: Int
  /// The chat's lines on the device as last followed: whether each is a
  /// photo the reader sees.
  private var followed: [Int64: Bool]?

  /// Whether the reader sees a line's photo among the chat's: not once
  /// taken back, nor hidden from them, nor in the place's own chat when
  /// they have blocked its writer, whose lines fold away there.
  public static func seen(
    photo: Bool, unsent: Bool, hidden: Bool, ownChat: Bool, writerBlocked: Bool
  ) -> Bool {
    photo && !unsent && !hidden && !(ownChat && writerBlocked)
  }

  /// Opened on `tapped`, among the photos `held` of the lines laid out.
  public init(held: [ChatPhotoItem], tapped: Int64, ahead: Int = Chat.photoPageAhead) {
    photos = held.contains { $0.seq == tapped } ? held : held.filter { $0.seq == tapped }
    shown = photos.isEmpty ? nil : tapped
    self.ahead = ahead
  }

  /// Where the photo shown is among those held.
  public var index: Int? { photos.firstIndex { $0.seq == shown } }

  /// The photo shown's place among all the chat's, from 1, and how many
  /// there are: nil until a page says.
  public var place: (number: Int, of: Int)? {
    guard let offset, let total, let index else { return nil }
    return (offset + index + 1, max(total, offset + photos.count))
  }

  /// The pages to ask for now, each once until it comes: an end's next
  /// once the photo shown is fewer than `ahead` from it, and both ends
  /// while where the photos are is unknown.
  public mutating func asks() -> [Ask] {
    guard let index, let first = photos.first, let last = photos.last else { return [] }
    var wanted: [Ask] = []
    if let offset, let total {
      if offset > 0, index < ahead { wanted.append(Ask(seq: first.seq, after: false)) }
      if offset + photos.count < total, photos.count - 1 - index < ahead {
        wanted.append(Ask(seq: last.seq, after: true))
      }
    } else {
      wanted = [Ask(seq: first.seq, after: false), Ask(seq: last.seq, after: true)]
    }
    let new = wanted.filter { !asked.contains($0) }
    asked.formUnion(new)
    return new
  }

  /// An ask that could not be sent, to be asked again.
  public mutating func unasked(_ ask: Ask) {
    asked.remove(ask)
  }

  /// The socket opened again: the asks not yet answered, their answers
  /// perhaps lost with it, are asked again.
  public mutating func reconnected() {
    asked = []
  }

  /// A page answering one of the asks, dropped when its end is no longer
  /// the one asked from.
  public mutating func take(_ page: ChatPhotosPage) {
    asked.remove(Ask(seq: page.seq, after: page.after))
    guard let first = photos.first, let last = photos.last else { return }
    if page.after {
      guard page.seq == last.seq else { return }
      if offset == nil { offset = max(0, page.offset - photos.count) }
      photos += page.photos.filter { $0.seq > last.seq }
    } else {
      guard page.seq == first.seq else { return }
      offset = page.offset
      photos = page.photos.filter { $0.seq < first.seq } + photos
    }
    total = page.total
  }

  /// Swiped to the photo of the line `seq`.
  public mutating func show(_ seq: Int64) {
    if photos.contains(where: { $0.seq == seq }) { shown = seq }
  }

  /// A new line with a photo the reader sees: one more in all, and held
  /// when the last is.
  public mutating func added(_ item: ChatPhotoItem) {
    guard let last = photos.last, item.seq > last.seq, let total else { return }
    if let offset, offset + photos.count == total { photos.append(item) }
    self.total = total + 1
  }

  /// A line taken back or hidden: its photo out, if it was one, the next
  /// shown in its place (the one before at the end). `wasPhoto` is nil
  /// when the device did not hold the line, which leaves where the photos
  /// are unknown until the next page says.
  public mutating func gone(_ seq: Int64, wasPhoto: Bool?) {
    if let index = photos.firstIndex(where: { $0.seq == seq }) {
      photos.remove(at: index)
      total = total.map { $0 - 1 }
      if shown == seq {
        shown = photos.isEmpty ? nil : photos[min(index, photos.count - 1)].seq
      }
      return
    }
    guard wasPhoto != false, let first = photos.first, let last = photos.last,
      seq < first.seq || seq > last.seq
    else { return }
    guard wasPhoto == true else {
      offset = nil
      total = nil
      return
    }
    if seq < first.seq { offset = offset.map { $0 - 1 } }
    total = total.map { $0 - 1 }
  }

  /// The chat's lines on the device now, each with its photo when the
  /// reader sees it: a new line's photo past them all is `added`, and a
  /// photo taken back or hidden is `gone`. The first only notes them.
  public mutating func follow(_ lines: [(seq: Int64, item: ChatPhotoItem?)]) {
    let now = Dictionary(lines.map { ($0.seq, $0.item != nil) }, uniquingKeysWith: { $1 })
    defer { followed = now }
    guard let before = followed else { return }
    let latest = before.keys.max() ?? 0
    for line in lines {
      let was = before[line.seq]
      if let item = line.item {
        if was == nil, line.seq > latest { added(item) }
      } else if was == true || photos.contains(where: { $0.seq == line.seq }) {
        gone(line.seq, wasPhoto: true)
      }
    }
  }
}

extension Chats {
  /// A chat's lines on the device, each with its photo when the reader
  /// sees it, for the photo opened large to follow as they change.
  public static func photoLines(
    of groupID: String, thread threadID: String, blocked: Set<String>, in db: Database
  ) throws -> [(seq: Int64, item: ChatPhotoItem?)] {
    try ChatLineRow.where { $0.groupID.eq(groupID) && $0.threadID.eq(threadID) }
      .fetchAll(db)
      .map { ($0.seq, ChatPhotoItem($0, blocked: blocked)) }
  }
}
