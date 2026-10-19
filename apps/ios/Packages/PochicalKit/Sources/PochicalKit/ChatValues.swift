import Foundation
import GRDB
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

/// The other member of a one-to-one chat `me` is in; nil for the group
/// chat or a chat that is not theirs.
public func otherIn(_ threadID: String, me: String) -> String? {
  let parts = threadID.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
  guard parts.count == 3, parts[0] == "direct", parts.contains(me) else { return nil }
  return parts[1] == me ? parts[2] : parts[1]
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
  /// The line it answers (返信), by its seq in the same chat.
  public var replyTo: Int64?
  /// A line from the app, as JSON, `LineNotice`; empty for a message.
  var noticeJSON = ""
  /// The album a photo was sent in with others (spec/chat.md, Albums);
  /// empty for none.
  public var album = ""
  public var id: Int64 { seq }

  /// Whose line it is to `me`, for what is unread: the app's notices and
  /// a line never delivered to the reader are neither the reader's nor
  /// others' to count (`spec/vectors/chat.json`, writer).
  public func writer(for me: String) -> LineWriter {
    if !noticeJSON.isEmpty || hidden { return .app }
    return authorID == me ? .me : .others
  }

  /// What happened to the group, for a line from the app (spec/chat.md,
  /// Notices).
  public var notice: LineNotice? {
    get { try? JSONDecoder().decode(LineNotice.self, from: Data(noticeJSON.utf8)) }
    set {
      noticeJSON =
        newValue.flatMap { try? JSONEncoder().encode($0) }
        .flatMap { String(data: $0, encoding: .utf8) } ?? ""
    }
  }

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
  /// A line not sent (spec/chat.md, Lines on their way): its photo could
  /// not be uploaded, or it waited too long. It waits for the member to
  /// send it again or delete it.
  var failed = false
}

/// How many lines of a chat the user has not read, as the group counted
/// them, from the user's own socket (spec/sync-protocol.md, Unread
/// summary): every group's, without a socket to each.
@Table("unreadCounts")
struct UnreadCountRow: Hashable, Sendable {
  var groupID: String
  var threadID: String
  var count: Int
  /// How many of them mention the user.
  var mentions = 0
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

  mutating func registerChatReplies() {
    registerMigration("Keep the line each answers") { db in
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "replyTo" INTEGER
        """
      )
      .execute(db)
    }
    registerMigration("Keep the app's notices among the lines") { db in
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "noticeJSON" TEXT NOT NULL DEFAULT ''
        """
      )
      .execute(db)
    }
    registerMigration("Keep the photos that could not be sent") { db in
      try #sql(
        """
        ALTER TABLE "chatOutbox" ADD COLUMN "failed" INTEGER NOT NULL DEFAULT 0
        """
      )
      .execute(db)
    }
  }

  mutating func registerChatAlbums() {
    registerMigration("Keep the photos' albums") { db in
      try #sql(
        """
        ALTER TABLE "chatLines" ADD COLUMN "album" TEXT NOT NULL DEFAULT ''
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
    row.photo = line.hasPhoto ? LinePhoto(line.photo) : nil
    row.preview = line.hasPreview ? LinePreview(line.preview) : nil
    row.hidden = line.hidden
    row.replyTo = line.replyTo == 0 ? nil : Int64(line.replyTo)
    row.notice = line.hasNotice ? LineNotice(line.notice) : nil
    row.album = line.album
    try ChatLineRow.insert { row }.execute(db)
    try tookBack(line, of: groupID, in: db)
  }

  /// A page of earlier lines, answering the device's request, and the
  /// lines its replies answer from before it.
  public static func take(_ page: Pochical_V1_ChatPage, of groupID: String, in db: Database)
    throws
  {
    for line in page.quoted + page.lines {
      try take(line, of: groupID, in: db)
    }
  }

  /// A Reset of the group: its lines and marks come again; the outbox stays.
  static func reset(_ groupID: String, in db: Database) throws {
    try ChatLineRow.where { $0.groupID.eq(groupID) }.delete().execute(db)
    try ReadMarkRow.where { $0.groupID.eq(groupID) }.delete().execute(db)
  }

  /// Puts the member's edit in the group's chat outbox, to be sent and
  /// shown at once, as `opID` when it is named before (an album's first
  /// photo, which names the album).
  public static func edit(
    _ kind: Pochical_V1_ChatEdit.OneOf_Kind, in groupID: String, now: Int64,
    opID: String = UUID().uuidString.lowercased(), db: Database
  ) throws {
    var edit = Pochical_V1_ChatEdit()
    edit.opID = opID
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
      groupID: unread.groupID, threadID: unread.threadID, count: Int(unread.count),
      mentions: Int(unread.mentions))
    try UnreadCountRow.where { $0.groupID.eq(row.groupID) && $0.threadID.eq(row.threadID) }
      .delete().execute(db)
    try UnreadCountRow.insert { row }.execute(db)
  }

  /// The group's chats that have a line, one of the member's own on its
  /// way, or a draft: the one-to-one chats a list shows.
  public static func threads(in groupID: String, db: Database) throws -> Set<String> {
    var threads = Set(
      try ChatLineRow.where { $0.groupID.eq(groupID) }.select(\.threadID).distinct()
        .fetchAll(db))
    for (edit, _) in try waitingEdits(of: groupID, in: db) {
      if case .send(let send) = edit.kind {
        threads.insert(send.threadID)
      }
    }
    threads.formUnion(try draftThreads(in: groupID, db: db))
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

  /// A line not sent (spec/chat.md, Lines on their way): its photo could
  /// not be uploaded, the member stopped it going up (Photos), or it
  /// waited too long. It stays, marked, to send again or delete, and the
  /// edits after it go on.
  public static func fail(_ opID: String, in db: Database) throws {
    try ChatOutboxRow.where { $0.opID.eq(opID) }.update { $0.failed = true }.execute(db)
  }

  /// The line still waits to go: not sent yet, nor marked not sent, nor
  /// taken back.
  static func stillGoing(_ opID: String, in db: Database) throws -> Bool {
    try ChatOutboxRow.where { $0.opID.eq(opID) && !$0.failed }.fetchCount(db) > 0
  }

  /// Sends a line that could not be sent again, as the newest waiting
  /// edit, so the outbox takes it up after what it has sent.
  public static func sendAgain(_ opID: String, now: Int64, in db: Database) throws {
    guard let row = try ChatOutboxRow.where({ $0.opID.eq(opID) }).fetchOne(db) else { return }
    try ChatOutboxRow.where { $0.opID.eq(opID) }.delete().execute(db)
    try ChatOutboxRow.insert {
      ChatOutboxRow.Draft(groupID: row.groupID, opID: row.opID, edit: row.edit, madeAtMs: now)
    }
    .execute(db)
  }

  /// The edits an Acked names stop waiting.
  static func acknowledge(_ opIDs: [String], in db: Database) throws {
    try ChatOutboxRow.where { $0.opID.in(opIDs) }.delete().execute(db)
    try forgetTakenBack(opIDs, in: db)
  }

  /// The group's newest waiting edit, nil when none waits.
  static func lastWaiting(of groupID: String, in db: Database) throws -> Int? {
    try ChatOutboxRow.where { $0.groupID.eq(groupID) }.order { $0.id.desc() }.fetchOne(db)?.id
  }

  /// The group's newest edit still to be sent, nil when none is; one
  /// whose photo could not go waits for the member instead.
  static func lastToSend(of groupID: String, in db: Database) throws -> Int? {
    try ChatOutboxRow.where { $0.groupID.eq(groupID) && !$0.failed }.order { $0.id.desc() }
      .fetchOne(db)?.id
  }

  /// Returns once the group's chat outbox has nothing left to send, or as
  /// the task waiting is cancelled.
  public static func untilSent(of groupID: String, in database: any DatabaseReader) async {
    let outbox = ValueObservation.tracking { try lastToSend(of: groupID, in: $0) }
    do {
      for try await last in outbox.values(in: database) where last == nil {
        return
      }
    } catch {}
  }

  /// The group's waiting edits after `id`, as frames of up to
  /// `editsPerFrame`, and the last one's id.
  static func frames(of groupID: String, after id: Int, in db: Database) throws -> (
    frames: [Pochical_V1_ClientFrame], last: Int
  ) {
    let rows = try ChatOutboxRow.where { $0.groupID.eq(groupID) && $0.id > id && !$0.failed }
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
  /// How many lines the device holds before `lines`, on from them without
  /// a gap: laid out at once as the chat scrolls back, without asking.
  public var heldBefore = 0
  /// The first of the lines the device holds on from the latest without a
  /// gap, before which the server is asked for a page; none with no lines.
  public var heldFrom: Int64?
  /// Each member's read mark.
  public var marks: [String: Int64]
  /// How far the member's own read waiting in the outbox goes, 0 with none.
  public var ownRead: Int64
  /// The pinned lines, the latest first, the member's own pins and
  /// unpins on their way already in place; held however far back.
  public var pins: [ChatLineRow] = []
  /// The lines replies answer from before `lines`, by seq, for their
  /// quotes; held however far back, as the group sends them along.
  public var quoted: [Int64: ChatLineRow] = [:]

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
    unreadCount(lines.map { ($0.seq, $0.writer(for: me)) }, read: lastRead(by: me))
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
  /// The line it answers (返信), by its seq.
  public var replyTo: Int64?
  /// The album its photo goes in with others; empty for none.
  public var album = ""
  /// Not sent (its photo could not be uploaded, or it waited too long):
  /// to send again or delete.
  public var failed = false
  public var id: String { opID }

  /// The line `send` waits as, kept in the outbox as `row`.
  init(_ send: Pochical_V1_ChatSend, opID: String, row: ChatOutboxRow) {
    self.opID = opID
    text = send.text
    madeAtMs = row.madeAtMs
    days = send.days.compactMap(Day.init)
    poll = send.poll
    photo = send.hasPhoto ? LinePhoto(send.photo) : nil
    preview = send.hasPreview ? LinePreview(send.preview) : nil
    replyTo = send.replyTo == 0 ? nil : Int64(send.replyTo)
    album = send.album
    failed = row.failed
  }
}

/// The line before another of the same chat, to find where the latest run
/// of lines without a gap begins.
private enum Earlier: AliasName {}

extension Chats {
  /// The chat as its screen shows it: the lines on from the latest back to
  /// the first gap, the member's sends still waiting (and their changes
  /// and taking back already in place), and every read mark. The lines
  /// are those from `from` on; with none, as the chat opens: its latest
  /// page, back to `me`'s first unread line when that is earlier, at most
  /// `Chat.openMax` lines. Only the lines it returns are read.
  public static func state(
    of threadID: String, in groupID: String, me: String? = nil, from: Int64? = nil,
    db: Database
  ) throws -> ChatState {
    let thread = ChatLineRow.where { $0.groupID.eq(groupID) && $0.threadID.eq(threadID) }
    let unpinned: Int64 = 0
    var pinned = try thread.where { $0.pinnedOrder > unpinned && !$0.unsent }
      .order { $0.pinnedOrder.desc() }.select(\.seq).fetchAll(db).map { String($0) }
    var sends: [WaitingLine] = []
    var ownRead: Int64 = 0
    // The member's waiting edits to each line, in the order made.
    var edits: [Int64: [Pochical_V1_ChatEdit.OneOf_Kind]] = [:]
    for (edit, row) in try waitingEdits(of: groupID, in: db) {
      switch edit.kind {
      case .send(let send) where send.threadID == threadID:
        sends.append(WaitingLine(send, opID: edit.opID, row: row))
      case .change(let change) where change.threadID == threadID:
        edits[Int64(change.seq), default: []].append(.change(change))
      case .unsend(let unsend) where unsend.threadID == threadID:
        edits[Int64(unsend.seq), default: []].append(.unsend(unsend))
        pinned = pinStep(pinned, unsend: String(unsend.seq)).pins
      case .pin(let pin) where pin.threadID == threadID:
        let id = String(pin.seq)
        pinned = (pin.on ? pinStep(pinned, pin: id) : pinStep(pinned, unpin: id)).pins
      case .vote(let vote) where vote.threadID == threadID:
        edits[Int64(vote.seq), default: []].append(.vote(vote))
      case .decide(let decide) where decide.threadID == threadID:
        edits[Int64(decide.seq), default: []].append(.decide(decide))
        // Settling pins the poll (spec/vectors/chat.json, pins).
        pinned = pinStep(pinned, pin: String(decide.seq)).pins
      case .react(let react) where react.threadID == threadID:
        edits[Int64(react.seq), default: []].append(.react(react))
      case .read(let read) where read.threadID == threadID:
        ownRead = max(ownRead, Int64(read.lastReadSeq))
      default: break
      }
    }
    let shown = { (row: ChatLineRow) in showing(edits[row.seq] ?? [], on: row, me: me) }
    let taken =
      sends.isEmpty
      ? [] : Set(try thread.where { $0.opID.in(sends.map(\.opID)) }.select(\.opID).fetchAll(db))
    let waiting = sends.filter { !taken.contains($0.opID) }

    let latest = try thread.order { $0.seq.desc() }.select(\.seq).limit(1).fetchOne(db)
    let one: Int64 = 1
    let heldFrom = try thread.where { line in
      !ChatLineRow.as(Earlier.self).where {
        $0.groupID.eq(line.groupID) && $0.threadID.eq(line.threadID) && $0.seq.eq(line.seq - one)
      }
      .exists()
    }
    .order { $0.seq.desc() }.select(\.seq).limit(1).fetchOne(db)
    let marks = try ReadMarkRow.where { $0.groupID.eq(groupID) && $0.threadID.eq(threadID) }
      .fetchAll(db)
    let readMarks = Dictionary(marks.map { ($0.userID, $0.lastReadSeq) }, uniquingKeysWith: max)
    let start =
      from
      ?? openingFrom(latest: latest ?? 0, read: me.map { max(readMarks[$0] ?? 0, ownRead) })
    let laidFrom = max(heldFrom ?? start, start)
    let lines = try thread.where { $0.seq >= laidFrom }.order(by: \.seq).fetchAll(db).map(shown)
    var state = ChatState(
      lines: lines, waiting: waiting, atStart: (lines.first?.seq ?? 1) <= 1,
      marks: readMarks, ownRead: ownRead)
    // The run without a gap holds every seq from heldFrom to latest.
    if let heldFrom, let latest {
      state.heldBefore = Int(min(max(start - heldFrom, 0), latest - heldFrom + 1))
    }
    state.heldFrom = heldFrom

    let pinnedSeqs = pinned.compactMap { Int64($0) }
    var held: [Int64: ChatLineRow] = Dictionary(uniqueKeysWithValues: lines.map { ($0.seq, $0) })
    let replies: [Int64] = lines.compactMap(\.replyTo) + waiting.compactMap(\.replyTo)
    let answered = Set(replies.filter { held[$0] == nil })
    let elsewhere = Array(Set(pinnedSeqs).union(answered).filter { held[$0] == nil })
    if !elsewhere.isEmpty {
      for row in try thread.where({ $0.seq.in(elsewhere) }).fetchAll(db) {
        held[row.seq] = shown(row)
      }
    }
    state.pins = pinnedSeqs.compactMap { held[$0] }.filter { !$0.unsent }
    for seq in answered {
      state.quoted[seq] = held[seq]
    }
    return state
  }

  /// `row` as the screen shows it, with the member's waiting `edits` to it
  /// in place, in the order made.
  private static func showing(
    _ edits: [Pochical_V1_ChatEdit.OneOf_Kind], on row: ChatLineRow, me: String?
  ) -> ChatLineRow {
    var row = row
    for edit in edits {
      switch edit {
      case .change(let change):
        row.text = change.text
        row.edited = true
        if !change.keepsPreview {
          row.preview = change.hasPreview ? LinePreview(change.preview) : nil
        }
      case .unsend:
        row.text = ""
        row.unsent = true
        row.reactions = []
        row.days = []
        row.votes = []
        row.decided = nil
        row.photo = nil
        row.preview = nil
      case .vote(let vote):
        if let me, let day = Day(vote.day), row.decided == nil {
          row.votes = row.votes.voting(day, by: me, on: vote.on, order: row.days)
        }
      case .decide(let decide):
        row.decided = Day(decide.day)
      case .react(let react):
        if let me {
          row.reactions = row.reactions.toggling(react.emoji, by: me, on: react.on)
        }
      default: break
      }
    }
    return row
  }

  /// Everyone who has been in the group, those who left too, for the
  /// names on their lines.
  public static func writers(in groupID: String, db: Database) throws -> [GroupMemberRow] {
    try GroupMemberRow.where { $0.groupID.eq(groupID) }.order(by: \.joinedAtMs).fetchAll(db)
  }
}

/// The first line a chat lays out as it opens, from its latest line and
/// the reader's read mark (none for no reader): its latest page, back to
/// the first unread line when that is earlier, at most `Chat.openMax`
/// lines (spec/vectors/chat.json, openingFrom).
public func openingFrom(latest: Int64, read: Int64?) -> Int64 {
  let page = latest - Int64(Chat.pageSize) + 1
  let unread = (read ?? latest) + 1
  return max(latest - Int64(Chat.openMax) + 1, min(page, unread), 1)
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

/// The first of the lines come in while the chat is open that it stops at
/// under ここから新着 rather than going past: after both the `latest`
/// line it held and the reader's `read` mark, the first others wrote; its
/// seq, nil for none (spec/vectors/chat.json, firstComing).
public func firstComing(
  _ lines: [(seq: Int64, writer: LineWriter)], after latest: Int64, read: Int64
) -> Int64? {
  let from = max(latest, read)
  return lines.first { $0.seq > from && $0.writer == .others }?.seq
}

/// The reader's read mark as the chat's lines show: on to the latest of
/// those whose foot is on the screen (`shown`), never back, as a line once
/// on screen stays read (spec/vectors/chat.json, readTo).
public func readTo(shown: [Int64], read: Int64) -> Int64 {
  max(read, shown.max() ?? read)
}

/// A line as albums are found by: who wrote it, the album it was sent in
/// (empty for none), and whether it is still a photo, not taken back.
public struct AlbumLine<ID: Hashable>: Hashable {
  public let id: ID
  public let writer: String
  public let album: String
  public let photo: Bool

  public init(id: ID, writer: String, album: String, photo: Bool) {
    self.id = id
    self.writer = writer
    self.album = album
    self.photo = photo
  }
}

/// The albums a chat draws of its lines in order, each as its lines' ids:
/// lines one after another by the same writer with the same album that
/// are still photos, two or more (spec/vectors/chat.json, albums).
public func albums<ID>(_ lines: [AlbumLine<ID>]) -> [[ID]] {
  var albums: [[ID]] = []
  var run: [ID] = []
  var last: AlbumLine<ID>?
  for line in lines {
    let goesOn =
      line.photo && !line.album.isEmpty && last.map {
        $0.photo && $0.album == line.album && $0.writer == line.writer
      } == true
    if !goesOn {
      if run.count > 1 { albums.append(run) }
      run = []
    }
    if line.photo, !line.album.isEmpty { run.append(line.id) }
    last = line
  }
  if run.count > 1 { albums.append(run) }
  return albums
}

/// How many of an album's `count` photos go in each of its rows, top
/// first: two side by side, three as one over two, and past that rows of
/// two and three, as few as can be, the twos first (spec/vectors/chat.json,
/// albumRows).
public func albumRows(_ count: Int) -> [Int] {
  if count == 3 { return [1, 2] }
  let rows = (count + 2) / 3
  let twos = 3 * rows - count
  return Array(repeating: 2, count: twos) + Array(repeating: 3, count: rows - twos)
}

/// How many of others' lines are unread past the `read` mark, what ↓
/// counts (spec/vectors/chat.json, readTo).
public func unreadCount(_ lines: [(seq: Int64, writer: LineWriter)], read: Int64) -> Int {
  lines.count { $0.seq > read && $0.writer == .others }
}

/// How many of a chat's unread lines count, as what notifies, from their
/// words: `notifyingCount` with those mentioning `me` as its mentions
/// (spec/vectors/unread.json).
public func notifyingUnread(
  _ unread: [String], muted: Bool, mentionsWhenMuted: Bool, me: String
) -> Int {
  notifyingCount(
    count: unread.count, mentions: unread.count { mentions(in: $0).contains(me) }, muted: muted,
    mentionsWhenMuted: mentionsWhenMuted)
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
  /// What is being written in it, kept as it was left (spec/chat.md,
  /// Drafts).
  public var draft: KeptDraft?

  public init(
    last: ChatLineRow? = nil, waiting: WaitingLine? = nil, unread: Int = 0,
    mentioned: Bool = false, draft: KeptDraft? = nil
  ) {
    self.last = last
    self.waiting = waiting
    self.unread = unread
    self.mentioned = mentioned
    self.draft = draft
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
    for (edit, row) in reads {
      switch edit.kind {
      case .read(let read) where read.threadID == threadID:
        ownRead = max(ownRead, Int64(read.lastReadSeq))
      case .send(let send) where send.threadID == threadID:
        waiting = WaitingLine(send, opID: edit.opID, row: row)
      default: break
      }
    }
    // Lines never delivered to the reader are not theirs to see.
    let last = try ChatLineRow.where {
      $0.groupID.eq(groupID) && $0.threadID.eq(threadID) && !$0.hidden
    }
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
    return ChatSummary(
      last: last, waiting: waiting, unread: unread, mentioned: mentioned,
      draft: try keptDraft(of: threadID, in: groupID, db: db))
  }

  /// The chat's unread lines that count: the group's count, which reaches
  /// every group without a socket to each, but, while the member's own
  /// read waits, the device's own, so reading clears it at once. With the
  /// user's notifications, as what notifies; without, all of them, as a
  /// chat's own row shows.
  private static func unread(
    of threadID: String, in groupID: String, me: String, ownRead: Int64,
    notifications: ChatNotificationState = ChatNotificationState(), db: Database
  ) throws -> Int {
    let muted = notifications.isMuted(threadID, in: groupID)
    guard ownRead > 0 else {
      let row = try UnreadCountRow.where {
        $0.groupID.eq(groupID) && $0.threadID.eq(threadID)
      }
      .fetchOne(db)
      return notifyingCount(
        count: row?.count ?? 0, mentions: row?.mentions ?? 0, muted: muted,
        mentionsWhenMuted: notifications.mentionsWhenMuted)
    }
    let lines = try unreadLines(of: threadID, in: groupID, me: me, ownRead: ownRead, db: db)
    return notifyingUnread(
      lines, muted: muted, mentionsWhenMuted: notifications.mentionsWhenMuted, me: me)
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
    }
    .fetchAll(db).filter { $0.writer(for: me) == .others }.map(\.text)
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
    let notifications = try ChatNotifications.state(in: db)
    for row in try UnreadCountRow.where({ $0.count > 0 }).fetchAll(db) {
      if reads[row.groupID] == nil {
        reads[row.groupID] = try waitingReads(of: row.groupID, in: db)
      }
      let unread = try unread(
        of: row.threadID, in: row.groupID, me: me,
        ownRead: reads[row.groupID]?[row.threadID] ?? 0, notifications: notifications, db: db)
      if unread > 0 {
        counts[row.groupID, default: 0] += unread
      }
    }
    return counts
  }

  /// The group's waiting edits in the order made, each with its row.
  private static func waitingEdits(of groupID: String, in db: Database) throws
    -> [(Pochical_V1_ChatEdit, ChatOutboxRow)]
  {
    try ChatOutboxRow.where { $0.groupID.eq(groupID) }.order(by: \.id).fetchAll(db).map {
      (try Pochical_V1_ChatEdit(serializedBytes: $0.edit), $0)
    }
  }
}

/// A line from the app in 全体チャット (spec/chat.md, Notices): what changed
/// the group, its line's author being who did it.
public struct LineNotice: Codable, Hashable, Sendable {
  public enum Kind: String, Codable, Sendable {
    case joined, left, removed, inviteRemade, profileChanged
  }
  public var kind: Kind
  /// Who was taken out.
  public var subjectID = ""
  /// The group's new name, when it changed.
  public var name = ""
  /// The group's icon changed.
  public var markChanged = false

  init(kind: Kind, subjectID: String = "", name: String = "", markChanged: Bool = false) {
    self.kind = kind
    self.subjectID = subjectID
    self.name = name
    self.markChanged = markChanged
  }

  init?(_ wire: Pochical_V1_ChatNotice) {
    let kinds: [Pochical_V1_ChatNotice.Kind: Kind] = [
      .joined: .joined, .left: .left, .removed: .removed, .inviteRemade: .inviteRemade,
      .profileChanged: .profileChanged,
    ]
    guard let kind = kinds[wire.kind] else { return nil }
    self.init(
      kind: kind, subjectID: wire.subjectID, name: wire.name, markChanged: wire.markChanged)
  }

  /// Its words, `by` and `subject` the names the group shows now (/design's
  /// notices).
  public func words(by: String, subject: String) -> String {
    switch kind {
    case .joined: "\(by)がグループに参加しました"
    case .left: "\(by)がグループを抜けました"
    case .removed: "\(by)が\(subject)をグループから外しました"
    case .inviteRemade: "\(by)が招待リンクを作り直しました"
    case .profileChanged:
      if !name.isEmpty && markChanged {
        "\(by)がグループ名を「\(name)」にして、アイコンを変更しました"
      } else if !name.isEmpty {
        "\(by)がグループ名を「\(name)」に変更しました"
      } else {
        "\(by)がグループのアイコンを変更しました"
      }
    }
  }
}
