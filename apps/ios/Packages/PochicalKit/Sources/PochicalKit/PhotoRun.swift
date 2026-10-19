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
/// how many the chat holds for the reader, as the group's change log stood
/// at `cursor`.
public struct ChatPhotosPage: Sendable {
  public let threadID: String
  public let seq: Int64
  public let after: Bool
  public let photos: [ChatPhotoItem]
  public let offset: Int
  public let total: Int
  public let cursor: UInt64

  public init(
    threadID: String, seq: Int64, after: Bool, photos: [ChatPhotoItem], offset: Int, total: Int,
    cursor: UInt64
  ) {
    self.threadID = threadID
    self.seq = seq
    self.after = after
    self.photos = photos
    self.offset = offset
    self.total = total
    self.cursor = cursor
  }

  public init(_ wire: Pochical_V1_ChatPhotos) {
    self.init(
      threadID: wire.threadID, seq: Int64(wire.seq), after: wire.after,
      photos: wire.photos.map(ChatPhotoItem.init), offset: Int(wire.offset),
      total: Int(wire.total), cursor: wire.cursor)
  }

  /// The lines the page speaks for, every photo the group has among them
  /// in it: before `seq` (all of them for the latest) back to its first
  /// photo, or to the chat's first; after it on to its last, or to the
  /// chat's latest.
  var covers: ClosedRange<Int64>? {
    let low: Int64
    let high: Int64
    if after {
      low = seq + 1
      high = offset + photos.count >= total ? .max : photos.last?.seq ?? seq
    } else {
      high = seq == 0 ? .max : seq - 1
      low = offset == 0 ? .min : photos.first?.seq ?? seq
    }
    return low <= high ? low...high : nil
  }
}

/// The photos a chat's photo opened large swipes through, and its list of
/// them (写真) scrolls through (spec/chat.md, Photos), as
/// spec/vectors/chat-photos.json pins them down. Those held start as the
/// lines laid out have them (listed, as none), and each page from the
/// group takes the place of those held over the lines it covers. Where the
/// photo shown is among all of them, and how many there are, is only what
/// the group says: a change to the chat's photos on the device forgets it
/// until the group says it again, and drops any page counted before it.
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
  /// How many photos the chat holds for the reader; nil until a page says.
  public private(set) var total: Int?
  /// The line of the photo shown; nil once none is left, which closes it.
  public private(set) var shown: Int64?
  /// How many of the chat's photos come before each held, by its line, as
  /// the group has said since the chat's photos last changed on the device.
  private var before: [Int64: Int] = [:]
  /// The chat's photos on the device as last followed, and the group's
  /// cursor as they last changed; nil until first followed, before which
  /// nothing is asked.
  private var followed: PhotoLines?
  private var changedAt: UInt64? { followed?.cursor }
  /// The pages asked for since then, each once.
  private var asked: Set<Ask> = []
  private let ahead: Int

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

  /// Opened with none held, as the list of the chat's photos is: the
  /// latest page asked for, and its latest photo shown once it comes.
  public init(latest ahead: Int = Chat.photoPageAhead) {
    photos = []
    shown = nil
    self.ahead = ahead
  }

  /// Where the photo shown is among those held.
  public var index: Int? { photos.firstIndex { $0.seq == shown } }

  /// The photo shown's place among all the chat's, from 1, and how many
  /// there are: nil until the group has said.
  public var place: (number: Int, of: Int)? {
    guard let shown, let before = before[shown], let total else { return nil }
    return (before + 1, max(total, before + 1))
  }

  /// The pages to ask for now, each once until the chat's photos change:
  /// the latest with none held; both sides of the photo shown while where
  /// it is is unknown; else an end's next once the photo shown is fewer
  /// than `ahead` from it.
  public mutating func asks() -> [Ask] {
    guard changedAt != nil else { return [] }
    var wanted: [Ask] = []
    if let first = photos.first, let last = photos.last {
      if let shown, let index {
        if before[shown] == nil {
          wanted = [Ask(seq: shown, after: false), Ask(seq: shown, after: true)]
        } else {
          if index < ahead, before[first.seq] ?? 1 > 0 {
            wanted.append(Ask(seq: first.seq, after: false))
          }
          if photos.count - 1 - index < ahead, !atEnd(last.seq) {
            wanted.append(Ask(seq: last.seq, after: true))
          }
        }
      }
    } else {
      wanted = [Ask(seq: 0, after: false)]
    }
    let new = wanted.filter { !asked.contains($0) }
    asked.formUnion(new)
    return new
  }

  /// The group has said no photo comes after the line `seq`.
  private func atEnd(_ seq: Int64) -> Bool {
    guard let before = before[seq], let total else { return false }
    return before + 1 >= total
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

  /// A page answering one of the asks: its photos in place of those held
  /// over the lines it covers. Dropped when counted before the chat's
  /// photos last changed on the device, or when it no longer meets those
  /// held.
  public mutating func take(_ page: ChatPhotosPage) {
    guard let changedAt, page.cursor >= changedAt else { return }
    if page.seq != 0 {
      guard let first = photos.first, let last = photos.last,
        first.seq <= page.seq, page.seq <= last.seq
      else { return }
    }
    if let covers = page.covers {
      before = before.filter { !covers.contains($0.key) }
      photos = (photos.filter { !covers.contains($0.seq) } + page.photos)
        .sorted { $0.seq < $1.seq }
    }
    for (index, photo) in page.photos.enumerated() {
      before[photo.seq] = page.offset + index
    }
    if !page.after, page.seq != 0 {
      before[page.seq] = page.offset + page.photos.count
    }
    total = page.total
    if let shown {
      moveOff(shown)
    } else {
      shown = photos.last?.seq
    }
  }

  /// Swiped to the photo of the line `seq`.
  public mutating func show(_ seq: Int64) {
    if photos.contains(where: { $0.seq == seq }) { shown = seq }
  }

  /// The chat's photos on the device now. Changed since last followed
  /// (or never followed): those the reader no longer sees out, the next
  /// shown in place of one gone (the one before at the end), and where
  /// they are among all of them forgotten until the group says it again.
  /// The same photos, at a later cursor, change nothing.
  public mutating func follow(_ lines: PhotoLines) {
    if let followed, lines.samePhotos(as: followed) { return }
    followed = lines
    before = [:]
    asked = []
    photos.removeAll { lines.gone.contains($0.seq) || lines.blocked.contains($0.authorID) }
    if let shown { moveOff(shown) }
  }

  /// The photo shown no longer held: the next shown in its place, the one
  /// before at the end, none once none is left.
  private mutating func moveOff(_ seq: Int64) {
    guard !photos.contains(where: { $0.seq == seq }) else { return }
    shown = (photos.first { $0.seq > seq } ?? photos.last)?.seq
  }
}

/// A chat's photos on the device as those open large, or listed, follow
/// them (`PhotoRun.follow`), read with the group's cursor they stand at.
public struct PhotoLines: Equatable, Sendable {
  /// The group's cursor as they were read.
  public let cursor: UInt64
  /// The lines whose photo the reader sees, in order.
  public let photos: [Int64]
  /// The lines taken back, or hidden from the reader.
  public let gone: Set<Int64>
  /// Whose photos fold away for the reader: those they blocked, in the
  /// place's own chat; none in a one-to-one chat.
  public let blocked: Set<String>

  public init(cursor: UInt64, photos: [Int64], gone: Set<Int64>, blocked: Set<String>) {
    self.cursor = cursor
    self.photos = photos
    self.gone = gone
    self.blocked = blocked
  }

  /// The same photos as `other`, whatever else the group changed since.
  public func samePhotos(as other: PhotoLines) -> Bool {
    photos == other.photos && gone == other.gone && blocked == other.blocked
  }
}

extension Chats {
  /// A chat's photos on the device, each the reader sees by the rule
  /// `ChatPhotoItem` keeps, read in one with the group's cursor.
  public static func photoLines(
    of groupID: String, thread threadID: String, in db: Database
  ) throws -> PhotoLines {
    let blocked = threadID == groupThread ? try Blocks.all(in: db) : []
    let lines = try ChatLineRow
      .where {
        $0.groupID.eq(groupID) && $0.threadID.eq(threadID)
          && ($0.photoJSON.neq("") || $0.unsent || $0.hidden)
      }
      .order(by: \.seq)
      .fetchAll(db)
    return PhotoLines(
      cursor: try GroupSync.cursor(of: groupID, in: db),
      photos: lines.compactMap { ChatPhotoItem($0, blocked: blocked)?.seq },
      gone: Set(lines.filter { $0.unsent || $0.hidden }.map(\.seq)),
      blocked: blocked)
  }
}
