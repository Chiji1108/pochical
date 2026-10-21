import Foundation
import GRDB
import PochicalDesign
import PochicalProto
import SQLiteData

/// Where one of a chat's photos is: its line's seq and its place in the
/// line, from 0, which orders the chat's photos.
public struct PhotoKey: Hashable, Sendable, Comparable {
  public let seq: Int64
  public let index: Int

  public init(seq: Int64, index: Int = 0) {
    self.seq = seq
    self.index = index
  }

  public static func < (a: PhotoKey, b: PhotoKey) -> Bool {
    (a.seq, a.index) < (b.seq, b.index)
  }
}

/// One of a chat's photos, as its photos alone come (ChatPhotos), and the
/// line that sent it.
public struct ChatPhotoItem: Hashable, Sendable, Identifiable {
  public let key: PhotoKey
  public let photo: LinePhoto
  public let authorID: String
  public let sentAt: Date
  public var seq: Int64 { key.seq }
  public var id: String { photo.id }

  public init(key: PhotoKey, photo: LinePhoto, authorID: String, sentAt: Date) {
    self.key = key
    self.photo = photo
    self.authorID = authorID
    self.sentAt = sentAt
  }

  /// The line's photos, when the reader sees them among the chat's: not
  /// those of someone in `blocked` in the place's own chat, where their
  /// lines fold away.
  public static func items(of line: ChatLineRow, blocked: Set<String>) -> [ChatPhotoItem] {
    guard
      PhotoRun.seen(
        line.content.kind, ownChat: line.threadID == groupThread,
        writerBlocked: blocked.contains(line.authorID)),
      case .photos(let photos) = line.content
    else { return [] }
    let sentAt = Date(timeIntervalSince1970: TimeInterval(line.sentAtMs) / 1000)
    return photos.enumerated().map { index, photo in
      ChatPhotoItem(
        key: PhotoKey(seq: line.seq, index: index), photo: photo, authorID: line.authorID,
        sentAt: sentAt)
    }
  }
}

/// A page of a chat's photos, answering a ChatPhotosRequest: those nearest
/// `seq` on the asked side, whole lines' oldest first, how many come
/// before them and how many the chat holds for the reader, as the group's
/// change log stood at `cursor`.
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

  /// The page as the wire carries it: one entry a photo, a line's one
  /// after another in its order.
  public init(_ wire: Pochical_V1_ChatPhotos) {
    var photos: [ChatPhotoItem] = []
    for entry in wire.photos {
      let seq = Int64(entry.seq)
      let index = photos.last?.seq == seq ? (photos.last?.key.index ?? 0) + 1 : 0
      photos.append(
        ChatPhotoItem(
          key: PhotoKey(seq: seq, index: index), photo: LinePhoto(entry.photo),
          authorID: entry.authorID,
          sentAt: Date(timeIntervalSince1970: TimeInterval(entry.sentAtMs) / 1000)))
    }
    self.init(
      threadID: wire.threadID, seq: Int64(wire.seq), after: wire.after, photos: photos,
      offset: Int(wire.offset), total: Int(wire.total), cursor: wire.cursor)
  }

  /// The lines the page speaks for, every photo the group has among them
  /// in it: before `seq` (all of them for the latest) back to its first
  /// line, or to the chat's first; after it on to its last, or to the
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

/// The photos a chat's photo opened large swipes through one by one, and
/// its list of them (写真) scrolls through (spec/chat.md, Photos), as
/// spec/vectors/chat-photos.json pins them down. Those held start as the
/// lines laid out have them (listed, as none), and each page from the
/// group takes the place of those held over the lines it covers. Where the
/// photo shown is among all of them, and how many there are, is only what
/// the group says: a change to the chat's photos on the device forgets it
/// until the group says it again, and drops any page counted before it.
public struct PhotoRun: Sendable {
  /// A page to ask the group for: the photos before the line `seq`, or
  /// after it.
  public struct Ask: Hashable, Sendable {
    public let seq: Int64
    public let after: Bool

    public init(seq: Int64, after: Bool) {
      self.seq = seq
      self.after = after
    }
  }

  /// The photos held, in order, whole lines' with no gap between.
  public private(set) var photos: [ChatPhotoItem]
  /// How many photos the chat holds for the reader; nil until a page says.
  public private(set) var total: Int?
  /// The photo shown; nil once none is left, which closes it.
  public private(set) var shown: PhotoKey?
  /// How many of the chat's photos come before each line held, as the
  /// group has said since the chat's photos last changed on the device.
  private var before: [Int64: Int] = [:]
  /// The chat's photos on the device as last followed, and the group's
  /// cursor as they last changed; nil until first followed, before which
  /// nothing is asked.
  private var followed: PhotoLines?
  private var changedAt: UInt64? { followed?.cursor }
  /// The pages asked for since then, each once.
  private var asked: Set<Ask> = []
  private let ahead: Int

  /// Whether the reader sees a line's photos among the chat's, by its
  /// kind: photos, not once taken back nor hidden from them, nor in the
  /// place's own chat when they have blocked its writer, whose lines fold
  /// away there.
  public static func seen(_ kind: LineContent.Kind, ownChat: Bool, writerBlocked: Bool) -> Bool {
    kind == .photos && !(ownChat && writerBlocked)
  }

  /// Opened on `tapped`, among the photos `held` of the lines laid out.
  public init(held: [ChatPhotoItem], tapped: PhotoKey, ahead: Int = Chat.photoPageAhead) {
    photos = held.contains { $0.key == tapped } ? held : []
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
  public var index: Int? { photos.firstIndex { $0.key == shown } }

  /// The photo shown's place among all the chat's, from 1, and how many
  /// there are: nil until the group has said.
  public var place: (number: Int, of: Int)? {
    guard let shown, let before = before(shown), let total else { return nil }
    return (before + 1, max(total, before + 1))
  }

  /// How many of the chat's photos come before `key`, as the group said.
  private func before(_ key: PhotoKey) -> Int? {
    before[key.seq].map { $0 + key.index }
  }

  /// The pages to ask for now, each once until the chat's photos change:
  /// the latest with none held; both sides of the photo shown's line
  /// while where it is is unknown; else an end's next once the photo shown
  /// is fewer than `ahead` from it.
  public mutating func asks() -> [Ask] {
    guard changedAt != nil else { return [] }
    var wanted: [Ask] = []
    if let first = photos.first, let last = photos.last {
      if let shown, let index {
        if before[shown.seq] == nil {
          wanted = [Ask(seq: shown.seq, after: false), Ask(seq: shown.seq, after: true)]
        } else {
          if index < ahead, before[first.seq] ?? 1 > 0 {
            wanted.append(Ask(seq: first.seq, after: false))
          }
          if photos.count - 1 - index < ahead, !atEnd(last.key) {
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

  /// The group has said no photo comes after `key`.
  private func atEnd(_ key: PhotoKey) -> Bool {
    guard let before = before(key), let total else { return false }
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
        .sorted { $0.key < $1.key }
    }
    for (index, photo) in page.photos.enumerated() where photo.key.index == 0 {
      before[photo.seq] = page.offset + index
    }
    if !page.after, page.seq != 0 {
      before[page.seq] = page.offset + page.photos.count
    }
    total = page.total
    if let shown {
      moveOff(shown)
    } else {
      shown = photos.last?.key
    }
  }

  /// Swiped to the photo `key`.
  public mutating func show(_ key: PhotoKey) {
    if photos.contains(where: { $0.key == key }) { shown = key }
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
  private mutating func moveOff(_ key: PhotoKey) {
    guard !photos.contains(where: { $0.key == key }) else { return }
    shown = (photos.first { $0.key > key } ?? photos.last)?.key
  }
}

/// A chat's photos on the device as those open large, or listed, follow
/// them (`PhotoRun.follow`), read with the group's cursor they stand at.
public struct PhotoLines: Equatable, Sendable {
  /// The group's cursor as they were read.
  public let cursor: UInt64
  /// The photos the reader sees, in order.
  public let photos: [PhotoKey]
  /// The lines taken back, or hidden from the reader.
  public let gone: Set<Int64>
  /// Whose photos fold away for the reader: those they blocked, in the
  /// place's own chat; none in a one-to-one chat.
  public let blocked: Set<String>

  public init(cursor: UInt64, photos: [PhotoKey], gone: Set<Int64>, blocked: Set<String>) {
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
  /// `ChatPhotoItem.items` keeps, read in one with the group's cursor.
  public static func photoLines(
    of groupID: String, thread threadID: String, in db: Database
  ) throws -> PhotoLines {
    let blocked = threadID == groupThread ? try Blocks.all(in: db) : []
    let lines = try ChatLineRow
      .where {
        $0.groupID.eq(groupID) && $0.threadID.eq(threadID)
          && $0.kind.in([LineContent.Kind.photos, .unsent, .hidden])
      }
      .order(by: \.seq)
      .fetchAll(db)
    let gone = lines.filter { line in
      switch line.content {
      case .unsent, .hidden: true
      case .words, .photos, .days, .poll, .notice: false
      }
    }
    return PhotoLines(
      cursor: try GroupSync.cursor(of: groupID, in: db),
      photos: lines.flatMap { ChatPhotoItem.items(of: $0, blocked: blocked).map(\.key) },
      gone: Set(gone.map(\.seq)),
      blocked: blocked)
  }
}
