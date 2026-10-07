import Foundation
import PochicalDesign
import PochicalProto
import SQLiteData

// A group's chats on the device (spec/sync-protocol.md, Chat): the lines
// and read marks the group sent, and the member's own edits waiting in a
// chat outbox of their own, which the group's socket sends.

/// The group's own chat, 全体チャット.
public let groupThread = "group"

/// Two members' one-to-one chat: "direct:" and their ids in order, so
/// either of them names it alike (spec/vectors/chat.json, directThread).
public func directThread(_ a: String, _ b: String) -> String {
  let (first, second) = a.utf16.lexicographicallyPrecedes(b.utf16) ? (a, b) : (b, a)
  return "direct:\(first):\(second)"
}

/// A line of a chat as the group holds it.
@Table("chatLines")
public struct ChatLineRow: Hashable, Sendable, Identifiable {
  public var groupID: String
  public var threadID: String
  public var seq: Int64
  public var authorID: String
  public var text: String
  public var sentAtMs: Int64
  public var edited: Bool
  public var unsent: Bool
  /// The sending edit's op_id, to swap the line shown while it waited.
  public var opID: String
  /// Its reactions as JSON, `[LineReaction]`.
  var reactionsJSON = "[]"
  /// Pinned for everyone: the group's cursor when it was last pinned, the
  /// latest the greatest; 0 when not pinned.
  public var pinnedOrder: Int64 = 0
  /// The days a line of shared days shares, as JSON, `["YYYY-MM-DD"]`;
  /// none for words, and once unsent.
  var daysJSON = "[]"
  /// Its days are put to the vote.
  public var poll = false
  /// A poll's votes as JSON, `[DayVotes]`.
  var votesJSON = "[]"
  /// The day a poll was settled on, as YYYY-MM-DD; empty while open.
  var decidedKey = ""
  /// The photo sent as the line, as JSON, `LinePhoto`; empty for none.
  var photoJSON = ""
  /// Its first link's page, as JSON, `LinePreview`; empty for none.
  var previewJSON = ""
  /// Sent in a one-to-one chat by someone the reader had blocked: never
  /// delivered, and shown as nothing.
  public var hidden = false
  public var id: Int64 { seq }

  /// Its first link's page, under its words.
  public var preview: LinePreview? {
    get { try? JSONDecoder().decode(LinePreview.self, from: Data(previewJSON.utf8)) }
    set {
      previewJSON =
        newValue.flatMap { try? JSONEncoder().encode($0) }
        .flatMap { String(data: $0, encoding: .utf8) } ?? ""
    }
  }

  /// The photo sent as the line.
  public var photo: LinePhoto? {
    get { try? JSONDecoder().decode(LinePhoto.self, from: Data(photoJSON.utf8)) }
    set {
      photoJSON =
        newValue.flatMap { try? JSONEncoder().encode($0) }
        .flatMap { String(data: $0, encoding: .utf8) } ?? ""
    }
  }

  /// Who can come on each of a poll's days, in the order they said so.
  public var votes: [DayVotes] {
    get { (try? JSONDecoder().decode([DayVotes].self, from: Data(votesJSON.utf8))) ?? [] }
    set {
      votesJSON =
        (try? JSONEncoder().encode(newValue)).flatMap { String(data: $0, encoding: .utf8) }
        ?? "[]"
    }
  }

  /// The day a poll was settled on.
  public var decided: Day? {
    get { Day(decidedKey) }
    set { decidedKey = newValue?.key ?? "" }
  }

  /// The days it shares with everyone's shifts, in order.
  public var days: [Day] {
    get { sharedDays(from: daysJSON) }
    set { daysJSON = sharedDaysJSON(newValue) }
  }

  /// Each emoji on the line, in the order first chosen, with who chose it.
  public var reactions: [LineReaction] {
    get { (try? JSONDecoder().decode([LineReaction].self, from: Data(reactionsJSON.utf8))) ?? [] }
    set {
      reactionsJSON =
        (try? JSONEncoder().encode(newValue)).flatMap { String(data: $0, encoding: .utf8) }
        ?? "[]"
    }
  }
}

/// Who can come on one of a poll's days.
public struct DayVotes: Hashable, Sendable, Codable {
  public let day: Day
  public var userIDs: [String]

  public init(day: Day, userIDs: [String]) {
    self.day = day
    self.userIDs = userIDs
  }
}

extension [DayVotes] {
  /// `user` can come on `day`, or takes it back, the days kept in `order`.
  public func voting(_ day: Day, by user: String, on: Bool, order: [Day]) -> [DayVotes] {
    var byDay = Dictionary(map { ($0.day, $0.userIDs) }, uniquingKeysWith: { first, _ in first })
    var users = byDay[day, default: []].filter { $0 != user }
    if on { users.append(user) }
    byDay[day] = users
    return order.compactMap { day in
      byDay[day].flatMap { $0.isEmpty ? nil : DayVotes(day: day, userIDs: $0) }
    }
  }

  /// Who can come on `day`.
  public func voters(on day: Day) -> [String] {
    first { $0.day == day }?.userIDs ?? []
  }
}

/// Shared days as a line keeps them, from their JSON.
func sharedDays(from json: String) -> [Day] {
  ((try? JSONDecoder().decode([String].self, from: Data(json.utf8))) ?? []).compactMap(Day.init)
}

/// Shared days as JSON, for a line to keep.
func sharedDaysJSON(_ days: [Day]) -> String {
  (try? JSONEncoder().encode(days.map(\.key))).flatMap { String(data: $0, encoding: .utf8) }
    ?? "[]"
}

/// One emoji on a line and the members who chose it, in the order they did.
public struct LineReaction: Hashable, Sendable, Codable {
  public let emoji: String
  public var userIDs: [String]

  public init(emoji: String, userIDs: [String]) {
    self.emoji = emoji
    self.userIDs = userIDs
  }
}

extension [LineReaction] {
  /// The reactions with `userID`'s `emoji` put on or taken off: a new emoji
  /// goes last, and one nobody holds any more goes.
  func toggling(_ emoji: String, by userID: String, on: Bool) -> [LineReaction] {
    var reactions = self
    if let at = reactions.firstIndex(where: { $0.emoji == emoji }) {
      reactions[at].userIDs.removeAll { $0 == userID }
      if on { reactions[at].userIDs.append(userID) }
    } else if on {
      reactions.append(LineReaction(emoji: emoji, userIDs: [userID]))
    }
    return reactions.filter { !$0.userIDs.isEmpty }
  }
}

/// How far a member has read a chat.
@Table("readMarks")
public struct ReadMarkRow: Hashable, Sendable {
  public var groupID: String
  public var threadID: String
  public var userID: String
  public var lastReadSeq: Int64
}

/// One of the member's chat edits waiting for the group's Acked, in the
/// order made: a send shows at once as a line of theirs still waiting.
@Table("chatOutbox")
struct ChatOutboxRow: Hashable, Sendable {
  let id: Int
  var groupID: String
  var opID: String
  /// The edit as a `pochical.v1.ChatEdit`.
  var edit: Data
  var madeAtMs: Int64
}

/// How many lines of a chat the user has not read, as the group counted
/// them, from the user's own socket (spec/sync-protocol.md, Unread
/// summary): every group's, without a socket to each.
@Table("unreadCounts")
struct UnreadCountRow: Hashable, Sendable {
  var groupID: String
  var threadID: String
  var count: Int
}

extension DatabaseMigrator {
  mutating func registerChats() {
    registerMigration("Create the groups' chats") { db in
      try #sql(
        """
        CREATE TABLE "chatLines" (
          "groupID" TEXT NOT NULL,
          "threadID" TEXT NOT NULL,
          "seq" INTEGER NOT NULL,
          "authorID" TEXT NOT NULL,
          "text" TEXT NOT NULL,
          "sentAtMs" INTEGER NOT NULL,
          "edited" INTEGER NOT NULL,
          "unsent" INTEGER NOT NULL,
          "opID" TEXT NOT NULL,
          PRIMARY KEY ("groupID", "threadID", "seq")
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "readMarks" (
          "groupID" TEXT NOT NULL,
          "threadID" TEXT NOT NULL,
          "userID" TEXT NOT NULL,
          "lastReadSeq" INTEGER NOT NULL,
          PRIMARY KEY ("groupID", "threadID", "userID")
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "chatOutbox" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT,
          "groupID" TEXT NOT NULL,
          "opID" TEXT NOT NULL UNIQUE,
          "edit" BLOB NOT NULL,
          "madeAtMs" INTEGER NOT NULL
        ) STRICT
        """
      )
      .execute(db)
    }
    registerMigration("Keep the chats' unread counts") { db in
      try #sql(
        """
        CREATE TABLE "unreadCounts" (
          "groupID" TEXT NOT NULL,
          "threadID" TEXT NOT NULL,
          "count" INTEGER NOT NULL,
          PRIMARY KEY ("groupID", "threadID")
        ) STRICT
        """
      )
      .execute(db)
    }
    registerMigration("Keep the chats' reactions") { db in
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "reactionsJSON" TEXT NOT NULL DEFAULT '[]'
        """
      )
      .execute(db)
    }
    registerMigration("Keep the chats' pins") { db in
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "pinnedOrder" INTEGER NOT NULL DEFAULT 0
        """
      )
      .execute(db)
    }
    registerMigration("Keep the chats' shared days") { db in
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "daysJSON" TEXT NOT NULL DEFAULT '[]'
        """
      )
      .execute(db)
    }
    registerMigration("Keep the chats' polls") { db in
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "poll" INTEGER NOT NULL DEFAULT 0
        """
      )
      .execute(db)
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "votesJSON" TEXT NOT NULL DEFAULT '[]'
        """
      )
      .execute(db)
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "decidedKey" TEXT NOT NULL DEFAULT ''
        """
      )
      .execute(db)
    }
    registerMigration("Keep the chats' photos") { db in
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "photoJSON" TEXT NOT NULL DEFAULT ''
        """
      )
      .execute(db)
    }
    registerMigration("Keep the chats' link previews") { db in
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "previewJSON" TEXT NOT NULL DEFAULT ''
        """
      )
      .execute(db)
    }
    registerMigration("Keep lines hidden from the reader") { db in
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "hidden" INTEGER NOT NULL DEFAULT 0
        """
      )
      .execute(db)
    }
  }
}

/// What the group's socket brings of its chats, and the member's edits.
public enum Chats {
  /// A line or a read mark from the group's socket.
  static func take(_ change: Pochical_V1_Change, of groupID: String, in db: Database) throws {
    switch change.kind {
    case .chatLine(let line): try take(line, of: groupID, in: db)
    case .readMark(let mark):
      let row = ReadMarkRow(
        groupID: groupID, threadID: mark.threadID, userID: mark.userID,
        lastReadSeq: Int64(mark.lastReadSeq))
      try ReadMarkRow.where {
        $0.groupID.eq(groupID) && $0.threadID.eq(mark.threadID) && $0.userID.eq(mark.userID)
      }
      .delete().execute(db)
      try ReadMarkRow.insert { row }.execute(db)
    default: return
    }
  }

  private static func take(_ line: Pochical_V1_ChatLine, of groupID: String, in db: Database)
    throws
  {
    let seq = Int64(line.seq)
    let held = ChatLineRow.where {
      $0.groupID.eq(groupID) && $0.threadID.eq(line.threadID) && $0.seq.eq(seq)
    }
    // A photo taken back goes from the device too, as from the group.
    if line.unsent, let photo = try held.fetchOne(db)?.photo {
      ChatPhotos.forget(photo.id, in: groupID)
    }
    try held.delete().execute(db)
    var row = ChatLineRow(
      groupID: groupID, threadID: line.threadID, seq: seq, authorID: line.authorID,
      text: line.text, sentAtMs: line.sentAtMs, edited: line.edited, unsent: line.unsent,
      opID: line.opID)
    row.reactions = line.reactions.map { LineReaction(emoji: $0.emoji, userIDs: $0.userIds) }
    row.pinnedOrder = Int64(line.pinnedOrder)
    row.days = line.days.compactMap(Day.init)
    row.poll = line.poll
    row.votes = line.votes.compactMap { votes in
      Day(votes.day).map { DayVotes(day: $0, userIDs: votes.userIds) }
    }
    row.decidedKey = line.decided
    row.photo = line.hasPhoto ? linePhoto(line.photo) : nil
    row.preview = line.hasPreview ? LinePreview(line.preview) : nil
    row.hidden = line.hidden
    try ChatLineRow.insert { row }.execute(db)
  }

  /// A page of earlier lines, answering the device's request.
  public static func take(_ page: Pochical_V1_ChatPage, of groupID: String, in db: Database)
    throws
  {
    for line in page.lines {
      try take(line, of: groupID, in: db)
    }
  }

  /// A Reset of the group: its lines and marks come again; the outbox stays.
  static func reset(_ groupID: String, in db: Database) throws {
    try ChatLineRow.where { $0.groupID.eq(groupID) }.delete().execute(db)
    try ReadMarkRow.where { $0.groupID.eq(groupID) }.delete().execute(db)
  }

  /// Puts the member's edit in the group's chat outbox, to be sent and
  /// shown at once.
  public static func edit(
    _ kind: Pochical_V1_ChatEdit.OneOf_Kind, in groupID: String, now: Int64, db: Database
  ) throws {
    var edit = Pochical_V1_ChatEdit()
    edit.opID = UUID().uuidString.lowercased()
    edit.kind = kind
    let data = try edit.serializedData()
    try ChatOutboxRow.insert {
      ChatOutboxRow.Draft(groupID: groupID, opID: edit.opID, edit: data, madeAtMs: now)
    }
    .execute(db)
  }

  /// A chat's unread count from the user's socket.
  static func take(_ unread: Pochical_V1_UnreadCount, in db: Database) throws {
    let row = UnreadCountRow(
      groupID: unread.groupID, threadID: unread.threadID, count: Int(unread.count))
    try UnreadCountRow.where { $0.groupID.eq(row.groupID) && $0.threadID.eq(row.threadID) }
      .delete().execute(db)
    try UnreadCountRow.insert { row }.execute(db)
  }

  /// The group's chats that have a line, or one of the member's own on
  /// its way: the one-to-one chats a list shows.
  public static func threads(in groupID: String, db: Database) throws -> Set<String> {
    var threads = Set(
      try ChatLineRow.where { $0.groupID.eq(groupID) }.select(\.threadID).distinct()
        .fetchAll(db))
    for (edit, _) in try waitingEdits(of: groupID, in: db) {
      if case .send(let send) = edit.kind {
        threads.insert(send.threadID)
      }
    }
    return threads
  }

  /// A group left takes its counts with it.
  static func dropUnread(of groupID: String, in db: Database) throws {
    try UnreadCountRow.where { $0.groupID.eq(groupID) }.delete().execute(db)
  }

  /// A group left takes the member's waiting edits with it, so none is
  /// sent should they join again.
  static func dropWaiting(of groupID: String, in db: Database) throws {
    try ChatOutboxRow.where { $0.groupID.eq(groupID) }.delete().execute(db)
  }

  /// An edit that can never go, as a photo no longer on the device, stops
  /// waiting.
  static func drop(_ opID: String, in db: Database) throws {
    try ChatOutboxRow.where { $0.opID.eq(opID) }.delete().execute(db)
  }

  /// The edits an Acked names stop waiting.
  static func acknowledge(_ opIDs: [String], in db: Database) throws {
    try ChatOutboxRow.where { $0.opID.in(opIDs) }.delete().execute(db)
  }

  /// The group's newest waiting edit, nil when none waits.
  static func lastWaiting(of groupID: String, in db: Database) throws -> Int? {
    try ChatOutboxRow.where { $0.groupID.eq(groupID) }.order { $0.id.desc() }.fetchOne(db)?.id
  }

  /// The group's waiting edits after `id`, as frames of up to
  /// `editsPerFrame`, and the last one's id.
  static func frames(of groupID: String, after id: Int, in db: Database) throws -> (
    frames: [Pochical_V1_ClientFrame], last: Int
  ) {
    let rows = try ChatOutboxRow.where { $0.groupID.eq(groupID) && $0.id > id }
      .order(by: \.id).fetchAll(db)
    var frames: [Pochical_V1_ClientFrame] = []
    for chunk in stride(from: 0, to: rows.count, by: SyncLimits.editsPerFrame) {
      var frame = Pochical_V1_ClientFrame()
      frame.chatEdits.edits = try rows[chunk..<min(chunk + SyncLimits.editsPerFrame, rows.count)]
        .map { try Pochical_V1_ChatEdit(serializedBytes: $0.edit) }
      frames.append(frame)
    }
    return (frames, rows.last?.id ?? id)
  }
}

/// A chat as its screen shows it.
public struct ChatState: Hashable, Sendable {
  /// The lines from the latest back to the first gap, oldest first: what
  /// is known to follow on, the rest coming as pages.
  public var lines: [ChatLineRow]
  /// The member's lines still on their way, in the order written.
  public var waiting: [WaitingLine]
  /// The lines reach the chat's first.
  public var atStart: Bool
  /// Each member's read mark.
  public var marks: [String: Int64]
  /// How far the member's own read waiting in the outbox goes, 0 with none.
  public var ownRead: Int64
  /// The pinned lines, the latest first, the member's own pins and
  /// unpins on their way already in place; held however far back.
  public var pins: [ChatLineRow] = []

  public init(
    lines: [ChatLineRow], waiting: [WaitingLine], atStart: Bool, marks: [String: Int64],
    ownRead: Int64 = 0
  ) {
    self.lines = lines
    self.waiting = waiting
    self.atStart = atStart
    self.marks = marks
    self.ownRead = ownRead
  }

  /// How far `me` has read: their mark, or on to their read still waiting.
  public func lastRead(by me: String) -> Int64 {
    max(marks[me] ?? 0, ownRead)
  }

  /// How many of others' lines `me` has not read yet.
  public func unread(by me: String) -> Int {
    let read = lastRead(by: me)
    return lines.count { $0.seq > read && $0.authorID != me }
  }
}

/// A line of the member's not yet taken by the group.
public struct WaitingLine: Hashable, Sendable, Identifiable {
  public let opID: String
  public let text: String
  public let madeAtMs: Int64
  /// The days it shares, for a line of shared days.
  public var days: [Day] = []
  /// Its days are put to the vote.
  public var poll = false
  /// The photo it sends.
  public var photo: LinePhoto?
  /// Its first link's page.
  public var preview: LinePreview?
  public var id: String { opID }
}

extension Chats {
  /// The chat as its screen shows it: the lines on from the latest back to
  /// the first gap, the member's sends still waiting (and their changes
  /// and taking back already in place), and every read mark.
  public static func state(
    of threadID: String, in groupID: String, me: String? = nil, db: Database
  ) throws -> ChatState {
    let all = try ChatLineRow.where { $0.groupID.eq(groupID) && $0.threadID.eq(threadID) }
      .order { $0.seq.desc() }.fetchAll(db)
    var block: [ChatLineRow] = []
    for row in all {
      if let last = block.last, row.seq != last.seq - 1 {
        break
      }
      block.append(row)
    }
    let waitingEdits = try ChatOutboxRow.where { $0.groupID.eq(groupID) }.order(by: \.id)
      .fetchAll(db)
    let taken = Set(all.map(\.opID))
    var lines = Array(block.reversed())
    var waiting: [WaitingLine] = []
    var ownRead: Int64 = 0
    let unpinned: Int64 = 0
    var pinned = try ChatLineRow.where {
      $0.groupID.eq(groupID) && $0.threadID.eq(threadID) && $0.pinnedOrder > unpinned
        && !$0.unsent
    }
    .order { $0.pinnedOrder.desc() }.fetchAll(db).map { String($0.seq) }
    for row in waitingEdits {
      let edit = try Pochical_V1_ChatEdit(serializedBytes: row.edit)
      switch edit.kind {
      case .send(let send) where send.threadID == threadID && !taken.contains(edit.opID):
        waiting.append(
          WaitingLine(
            opID: edit.opID, text: send.text, madeAtMs: row.madeAtMs,
            days: send.days.compactMap(Day.init), poll: send.poll,
            photo: send.hasPhoto ? linePhoto(send.photo) : nil,
            preview: send.hasPreview ? LinePreview(send.preview) : nil))
      case .change(let change) where change.threadID == threadID:
        if let at = lines.firstIndex(where: { $0.seq == Int64(change.seq) }) {
          lines[at].text = change.text
          lines[at].edited = true
          if !change.keepsPreview {
            lines[at].preview = change.hasPreview ? LinePreview(change.preview) : nil
          }
        }
      case .unsend(let unsend) where unsend.threadID == threadID:
        if let at = lines.firstIndex(where: { $0.seq == Int64(unsend.seq) }) {
          lines[at].text = ""
          lines[at].unsent = true
          lines[at].reactions = []
          lines[at].days = []
          lines[at].votes = []
          lines[at].decided = nil
          lines[at].photo = nil
          lines[at].preview = nil
        }
        pinned = pinStep(pinned, unsend: String(unsend.seq)).pins
      case .pin(let pin) where pin.threadID == threadID:
        let id = String(pin.seq)
        pinned = (pin.on ? pinStep(pinned, pin: id) : pinStep(pinned, unpin: id)).pins
      case .vote(let vote) where vote.threadID == threadID:
        if let me, let day = Day(vote.day),
          let at = lines.firstIndex(where: { $0.seq == Int64(vote.seq) }), lines[at].decided == nil
        {
          lines[at].votes = lines[at].votes.voting(
            day, by: me, on: vote.on, order: lines[at].days)
        }
      case .decide(let decide) where decide.threadID == threadID:
        if let at = lines.firstIndex(where: { $0.seq == Int64(decide.seq) }) {
          lines[at].decided = Day(decide.day)
        }
        // Settling pins the poll (spec/vectors/chat.json, pins).
        pinned = pinStep(pinned, pin: String(decide.seq)).pins
      case .react(let react) where react.threadID == threadID:
        if let me, let at = lines.firstIndex(where: { $0.seq == Int64(react.seq) }) {
          lines[at].reactions = lines[at].reactions.toggling(react.emoji, by: me, on: react.on)
        }
      case .read(let read) where read.threadID == threadID:
        ownRead = max(ownRead, Int64(read.lastReadSeq))
      default: break
      }
    }
    let marks = try ReadMarkRow.where { $0.groupID.eq(groupID) && $0.threadID.eq(threadID) }
      .fetchAll(db)
    var state = ChatState(
      lines: lines, waiting: waiting, atStart: (lines.first?.seq ?? 1) <= 1,
      marks: Dictionary(marks.map { ($0.userID, $0.lastReadSeq) }, uniquingKeysWith: max),
      ownRead: ownRead)
    let pinnedSeqs = pinned.compactMap { Int64($0) }
    let heldRows = try ChatLineRow.where {
      $0.groupID.eq(groupID) && $0.threadID.eq(threadID) && $0.seq.in(pinnedSeqs)
    }
    .fetchAll(db)
    var held: [String: ChatLineRow] = [:]
    for row in heldRows {
      held[String(row.seq)] = row
    }
    state.pins = pinned.compactMap { id in
      // As the screen shows it: changed or taken back while waiting.
      lines.first { String($0.seq) == id } ?? held[id]
    }
    .filter { !$0.unsent }
    return state
  }

  /// Everyone who has been in the group, those who left too, for the
  /// names on their lines.
  public static func writers(in groupID: String, db: Database) throws -> [GroupMemberRow] {
    try GroupMemberRow.where { $0.groupID.eq(groupID) }.order(by: \.joinedAtMs).fetchAll(db)
  }
}

/// Who wrote a line, as the unread line counts them
/// (spec/vectors/chat.json, firstUnread).
public enum LineWriter: String, Sendable, Decodable {
  case others, me, app
}

/// The line a chat opens on under ここから新着: the first of the last
/// `unread` lines others wrote, the app's own lines and the reader's not
/// counted; nil with nothing unread.
public func firstUnread(_ writers: [LineWriter], unread: Int) -> Int? {
  guard unread > 0 else { return nil }
  var left = unread
  for index in writers.indices.reversed() where writers[index] == .others {
    left -= 1
    if left == 0 {
      return index
    }
  }
  return writers.firstIndex(of: .others)
}

/// How many of a chat's unread lines count, as what notifies: all of them
/// in a chat that is on; in one turned off only those mentioning `me`,
/// and those only while mentions always notify (spec/chat.md, Unread
/// lines; spec/vectors/unread.json).
public func notifyingUnread(
  _ unread: [String], muted: Bool, mentionsWhenMuted: Bool, me: String
) -> Int {
  guard muted else { return unread.count }
  guard mentionsWhenMuted else { return 0 }
  return unread.count { mentions(in: $0).contains(me) }
}

/// A chat as a list shows it: its latest line, and how many lines count
/// as unread.
public struct ChatSummary: Hashable, Sendable {
  /// The latest line the group holds.
  public var last: ChatLineRow?
  /// The member's latest line still on its way, newer than `last`.
  public var waiting: WaitingLine?
  public var unread: Int
  /// An unread line the device holds mentions the reader.
  public var mentioned: Bool

  public init(
    last: ChatLineRow? = nil, waiting: WaitingLine? = nil, unread: Int = 0,
    mentioned: Bool = false
  ) {
    self.last = last
    self.waiting = waiting
    self.unread = unread
    self.mentioned = mentioned
  }
}

extension Chats {
  /// A chat's latest line and its unread lines that count, for `me`: as
  /// the group counted them, or, while a read of theirs waits to be sent,
  /// others' lines the device holds past it.
  public static func summary(of threadID: String, in groupID: String, me: String, db: Database)
    throws -> ChatSummary
  {
    let reads = try waitingEdits(of: groupID, in: db)
    var ownRead: Int64 = 0
    var waiting: WaitingLine?
    for (edit, madeAtMs) in reads {
      switch edit.kind {
      case .read(let read) where read.threadID == threadID:
        ownRead = max(ownRead, Int64(read.lastReadSeq))
      case .send(let send) where send.threadID == threadID:
        waiting = WaitingLine(
          opID: edit.opID, text: send.text, madeAtMs: madeAtMs, days: send.days.compactMap(Day.init),
          poll: send.poll, photo: send.hasPhoto ? linePhoto(send.photo) : nil,
          preview: send.hasPreview ? LinePreview(send.preview) : nil)
      default: break
      }
    }
    let last = try ChatLineRow.where { $0.groupID.eq(groupID) && $0.threadID.eq(threadID) }
      .order { $0.seq.desc() }.fetchOne(db)
    // Shown as the group's line once it has come.
    if let sent = waiting,
      try ChatLineRow.where({ $0.groupID.eq(groupID) && $0.opID.eq(sent.opID) }).fetchCount(db)
        > 0
    {
      waiting = nil
    }
    let unread = try unread(of: threadID, in: groupID, me: me, ownRead: ownRead, db: db)
    let mentioned =
      unread > 0
      ? try unreadLines(of: threadID, in: groupID, me: me, ownRead: ownRead, db: db)
        .contains { mentions(in: $0).contains(me) }
      : false
    return ChatSummary(last: last, waiting: waiting, unread: unread, mentioned: mentioned)
  }

  /// The chat's unread lines that count: the group's count, which reaches
  /// every group without a socket to each, but, while the member's own
  /// read waits, the device's own, so reading clears it at once.
  private static func unread(
    of threadID: String, in groupID: String, me: String, ownRead: Int64, db: Database
  ) throws -> Int {
    guard ownRead > 0 else {
      // No chat can be turned off yet, so every unread line counts.
      return try UnreadCountRow.where { $0.groupID.eq(groupID) && $0.threadID.eq(threadID) }
        .fetchOne(db)?.count ?? 0
    }
    let lines = try unreadLines(of: threadID, in: groupID, me: me, ownRead: ownRead, db: db)
    return notifyingUnread(lines, muted: false, mentionsWhenMuted: true, me: me)
  }

  /// The words of others' lines the device holds past the reader's read.
  private static func unreadLines(
    of threadID: String, in groupID: String, me: String, ownRead: Int64, db: Database
  ) throws -> [String] {
    let mark =
      try ReadMarkRow.where {
        $0.groupID.eq(groupID) && $0.threadID.eq(threadID) && $0.userID.eq(me)
      }
      .fetchOne(db)?.lastReadSeq ?? 0
    let read = max(mark, ownRead)
    return try ChatLineRow.where {
      $0.groupID.eq(groupID) && $0.threadID.eq(threadID) && $0.seq > read
        && $0.authorID.neq(me)
    }
    .select(\.text).fetchAll(db)
  }

  /// The member's newest read waiting to be sent in each of the group's
  /// chats.
  private static func waitingReads(of groupID: String, in db: Database) throws -> [String: Int64] {
    var reads: [String: Int64] = [:]
    for (edit, _) in try waitingEdits(of: groupID, in: db) {
      if case .read(let read) = edit.kind {
        reads[read.threadID] = max(reads[read.threadID] ?? 0, Int64(read.lastReadSeq))
      }
    }
    return reads
  }

  /// Each group's unread lines that count, its chats' together, for the
  /// list of groups; a group with none is left out.
  public static func unreadByGroup(me: String, db: Database) throws -> [String: Int] {
    var counts: [String: Int] = [:]
    var reads: [String: [String: Int64]] = [:]
    for row in try UnreadCountRow.where({ $0.count > 0 }).fetchAll(db) {
      if reads[row.groupID] == nil {
        reads[row.groupID] = try waitingReads(of: row.groupID, in: db)
      }
      let unread = try unread(
        of: row.threadID, in: row.groupID, me: me,
        ownRead: reads[row.groupID]?[row.threadID] ?? 0, db: db)
      if unread > 0 {
        counts[row.groupID, default: 0] += unread
      }
    }
    return counts
  }

  /// The group's waiting edits in the order made, with when each was made.
  private static func waitingEdits(of groupID: String, in db: Database) throws
    -> [(Pochical_V1_ChatEdit, Int64)]
  {
    try ChatOutboxRow.where { $0.groupID.eq(groupID) }.order(by: \.id).fetchAll(db).map {
      (try Pochical_V1_ChatEdit(serializedBytes: $0.edit), $0.madeAtMs)
    }
  }
}

/// A photo as the wire carries it.
func linePhoto(_ photo: Pochical_V1_ChatPhoto) -> LinePhoto {
  LinePhoto(id: photo.id, width: Int(photo.width), height: Int(photo.height))
}
