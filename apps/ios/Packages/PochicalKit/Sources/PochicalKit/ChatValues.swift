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
  /// The photos sent as the line, as JSON, `[LinePhoto]`; none for
  /// anything else, and once unsent.
  var photosJSON = "[]"
  /// Its first link's page, as JSON, `LinePreview`; empty for none.
  var previewJSON = ""
  /// Sent in a one-to-one chat by someone the reader had blocked: never
  /// delivered, and shown as nothing.
  public var hidden = false
  /// The line it answers (返信), by its seq in the same chat.
  public var replyTo: Int64?
  /// A line from the app, as JSON, `LineNotice`; empty for a message.
  var noticeJSON = ""
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

  /// The photos sent as the line, in the order sent: one, or several
  /// drawn as an album (spec/chat.md, Albums).
  public var photos: [LinePhoto] {
    get { (try? JSONDecoder().decode([LinePhoto].self, from: Data(photosJSON.utf8))) ?? [] }
    set {
      photosJSON =
        (try? JSONEncoder().encode(newValue)).flatMap { String(data: $0, encoding: .utf8) }
        ?? "[]"
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
  /// When it was written, or sent again, by the server's time.
  var madeAtMs: Int64
  /// A line not sent (spec/chat.md, Lines on their way): one of its
  /// photos could not be uploaded, or the member stopped them going up. It
  /// waits for the member to send it again or delete it. One that waited
  /// too long is not sent by its time alone (`notSent`).
  var failed = false
  /// It has gone out on a socket, so the group may have taken it though
  /// no answer came; one that never went, the group cannot have.
  var wentOut = false
  /// Which of its line's photos are up, as JSON, `PhotosUp`.
  var upJSON = "{}"

  /// Which of its line's photos are up, and when the latest went up.
  var up: PhotosUp {
    get { (try? JSONDecoder().decode(PhotosUp.self, from: Data(upJSON.utf8))) ?? PhotosUp() }
    set {
      upJSON =
        (try? JSONEncoder().encode(newValue)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }
  }

  /// When the line `edit` sends stops going by itself, by the server's
  /// time: once it has waited `Chat.unsentAfterMs` since it was written.
  /// Nil for an edit that sends no line, which waits on.
  func failsAt(_ edit: Pochical_V1_ChatEdit) -> Int64? {
    guard case .send = edit.kind else { return nil }
    return madeAtMs + Int64(Chat.unsentAfterMs)
  }

  /// The row, waiting to send `edit`, is not sent at the server's time
  /// `now`: marked so, or a line whose wait is over. Read from its time,
  /// it is so from the moment the wait is over, whatever runs then.
  func notSent(_ edit: Pochical_V1_ChatEdit, at now: Int64) -> Bool {
    failed || failsAt(edit).map { $0 <= now } == true
  }
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
          "reactionsJSON" TEXT NOT NULL DEFAULT '[]',
          "pinnedOrder" INTEGER NOT NULL DEFAULT 0,
          "daysJSON" TEXT NOT NULL DEFAULT '[]',
          "poll" INTEGER NOT NULL DEFAULT 0,
          "votesJSON" TEXT NOT NULL DEFAULT '[]',
          "decidedKey" TEXT NOT NULL DEFAULT '',
          "previewJSON" TEXT NOT NULL DEFAULT '',
          "hidden" INTEGER NOT NULL DEFAULT 0,
          "replyTo" INTEGER,
          "noticeJSON" TEXT NOT NULL DEFAULT '',
          "photosJSON" TEXT NOT NULL DEFAULT '[]',
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
          "madeAtMs" INTEGER NOT NULL,
          "failed" INTEGER NOT NULL DEFAULT 0,
          "wentOut" INTEGER NOT NULL DEFAULT 0,
          "upJSON" TEXT NOT NULL DEFAULT '{}'
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "unreadCounts" (
          "groupID" TEXT NOT NULL,
          "threadID" TEXT NOT NULL,
          "count" INTEGER NOT NULL,
          "mentions" INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY ("groupID", "threadID")
        ) STRICT
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
    // Photos taken back go from the device too, as from the group.
    if line.unsent {
      for photo in try held.fetchOne(db)?.photos ?? [] {
        ChatPhotos.forget(photo.id, in: PhotoShelf(place: groupID))
      }
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
    row.photos = line.photos.map(LinePhoto.init)
    row.preview = line.hasPreview ? LinePreview(line.preview) : nil
    row.hidden = line.hidden
    row.replyTo = line.replyTo == 0 ? nil : Int64(line.replyTo)
    row.notice = line.hasNotice ? LineNotice(line.notice) : nil
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
  /// shown at once, made at the device's time `now`.
  public static func edit(
    _ kind: Pochical_V1_ChatEdit.OneOf_Kind, in groupID: String, now: Int64, db: Database
  ) throws {
    var edit = Pochical_V1_ChatEdit()
    edit.opID = UUID().uuidString.lowercased()
    edit.kind = kind
    let data = try edit.serializedData()
    let madeAt = try SyncState.corrected(now, in: db)
    try ChatOutboxRow.insert {
      ChatOutboxRow.Draft(groupID: groupID, opID: edit.opID, edit: data, madeAtMs: madeAt)
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

  /// A line not sent (spec/chat.md, Lines on their way): one of its photos
  /// could not be uploaded, or the member stopped them going up (Photos).
  /// It stays, marked, to send again or delete, and the edits after it go
  /// on.
  public static func fail(_ opID: String, in db: Database) throws {
    try ChatOutboxRow.where { $0.opID.eq(opID) }.update { $0.failed = true }.execute(db)
  }

  /// The line still waits to go at the device's time `now`: not sent yet,
  /// nor not sent, nor taken back.
  static func stillGoing(_ opID: String, now: Int64, in db: Database) throws -> Bool {
    let now = try SyncState.corrected(now, in: db)
    return try ChatOutboxRow.where { $0.opID.eq(opID) }.fetchAll(db).contains {
      try !$0.notSent(Pochical_V1_ChatEdit(serializedBytes: $0.edit), at: now)
    }
  }

  /// The group's edits after `id` still to send at the device's time
  /// `now`, in the order made, and the last one's id, past those not sent,
  /// which wait for the member instead.
  static func toSend(of groupID: String, after id: Int = 0, now: Int64, in db: Database) throws
    -> (rows: [(Pochical_V1_ChatEdit, ChatOutboxRow)], last: Int)
  {
    let now = try SyncState.corrected(now, in: db)
    let rows = try ChatOutboxRow.where { $0.groupID.eq(groupID) && $0.id > id }.order(by: \.id)
      .fetchAll(db)
    let going = try rows.map { (try Pochical_V1_ChatEdit(serializedBytes: $0.edit), $0) }
      .filter { !$1.notSent($0, at: now) }
    return (going, rows.last?.id ?? id)
  }

  /// Sends a line that could not be sent again, as the newest waiting
  /// edit made at the device's time `now`, so the outbox takes it up after
  /// what it has sent.
  public static func sendAgain(_ opID: String, now: Int64, in db: Database) throws {
    guard let row = try ChatOutboxRow.where({ $0.opID.eq(opID) }).fetchOne(db) else { return }
    try ChatOutboxRow.where { $0.opID.eq(opID) }.delete().execute(db)
    let madeAt = try SyncState.corrected(now, in: db)
    try ChatOutboxRow.insert {
      ChatOutboxRow.Draft(
        groupID: row.groupID, opID: row.opID, edit: row.edit, madeAtMs: madeAt,
        wentOut: row.wentOut, upJSON: row.upJSON)
    }
    .execute(db)
  }

  /// Of a frame's edits about to go out on a socket at the device's time
  /// `now`, those still going (not taken back nor not sent since the frame
  /// was made), each marked as gone out before it goes, so one taken back
  /// from then on is taken back from the group too (`takeBack`).
  static func goOut(_ edits: [Pochical_V1_ChatEdit], now: Int64, in db: Database) throws
    -> [Pochical_V1_ChatEdit]
  {
    let now = try SyncState.corrected(now, in: db)
    let rows = try ChatOutboxRow.where { $0.opID.in(edits.map(\.opID)) }.fetchAll(db)
    let opIDs = Set(
      try rows.filter { try !$0.notSent(Pochical_V1_ChatEdit(serializedBytes: $0.edit), at: now) }
        .map(\.opID))
    try ChatOutboxRow.where { $0.opID.in(Array(opIDs)) }.update { $0.wentOut = true }.execute(db)
    return edits.filter { opIDs.contains($0.opID) }
  }

  /// The edits an Acked names stop waiting.
  static func acknowledge(_ opIDs: [String], in db: Database) throws {
    try ChatOutboxRow.where { $0.opID.in(opIDs) }.delete().execute(db)
  }

  /// The group's newest waiting edit, nil when none waits.
  static func lastWaiting(of groupID: String, in db: Database) throws -> Int? {
    try ChatOutboxRow.where { $0.groupID.eq(groupID) }.order { $0.id.desc() }.fetchOne(db)?.id
  }

  /// The group's newest edit still to be sent at the device's time `now`,
  /// nil when none is; one not sent waits for the member instead.
  static func lastToSend(of groupID: String, now: Int64, in db: Database) throws -> Int? {
    try toSend(of: groupID, now: now, in: db).rows.last?.1.id
  }

  /// When the next of the group's lines still to send stops going by
  /// itself, by the device's clock; nil with none.
  static func nextFailing(of groupID: String, now: Int64, in db: Database) throws -> Int64? {
    let offset = try SyncState.current(in: db).offsetMs
    let due = try toSend(of: groupID, now: now, in: db).rows.compactMap { $1.failsAt($0) }.min()
    return due.map { $0 - offset }
  }

  /// Returns once the group's chat outbox has nothing left to send, or as
  /// the task waiting is cancelled; read again as the outbox changes, and
  /// as a line still to send stops going by itself.
  public static func untilSent(of groupID: String, in database: any DatabaseReader) async {
    await waitUntil(in: database) { db, now in
      guard try lastToSend(of: groupID, now: now, in: db) != nil else { return (true, nil) }
      return (false, try nextFailing(of: groupID, now: now, in: db))
    }
  }

  /// The group's edits after `id` still to send at the device's time
  /// `now`, as frames of up to `editsPerFrame`, and the last waiting one's
  /// id, past those not sent.
  static func frames(of groupID: String, after id: Int, now: Int64, in db: Database) throws -> (
    frames: [Pochical_V1_ClientFrame], last: Int
  ) {
    let (rows, last) = try toSend(of: groupID, after: id, now: now, in: db)
    let edits = rows.map(\.0)
    var frames: [Pochical_V1_ClientFrame] = []
    for chunk in stride(from: 0, to: edits.count, by: SyncLimits.editsPerFrame) {
      var frame = Pochical_V1_ClientFrame()
      frame.chatEdits.edits = Array(
        edits[chunk..<min(chunk + SyncLimits.editsPerFrame, edits.count)])
      frames.append(frame)
    }
    return (frames, last)
  }
}

/// Returns once `read` says it is done, or as the task waiting is
/// cancelled: read at the device's time, now, again as what it reads
/// changes, and at the time it says it may be done by time alone (by the
/// device's clock), as a line's wait is over without anything changing.
func waitUntil(
  in database: any DatabaseReader,
  _ read: @escaping @Sendable (Database, _ now: Int64) throws -> (done: Bool, wakeAt: Int64?)
) async {
  let (wakes, wake) = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
  let watching = Task {
    let changes = ValueObservation.tracking { try read($0, SyncClient.nowMs()) }
    do {
      for try await _ in changes.values(in: database) { wake.yield() }
    } catch {}
    wake.finish()
  }
  var timer: Task<Void, Never>?
  defer {
    watching.cancel()
    timer?.cancel()
  }
  for await _ in wakes {
    guard let now = try? await database.read({ try read($0, SyncClient.nowMs()) }), !now.done
    else { return }
    timer?.cancel()
    timer = now.wakeAt.map { at in
      Task {
        try? await Task.sleep(for: .milliseconds(max(at - SyncClient.nowMs(), 0)))
        if !Task.isCancelled { wake.yield() }
      }
    }
  }
}

/// A chat as its screen shows it.
public struct ChatState: Hashable, Sendable {
  /// The lines laid out, oldest first: from the first laid out on to the
  /// end of the run without a gap they are in, what is known to follow
  /// on, the rest coming as pages (spec/vectors/chat.json, window).
  public var lines: [ChatLineRow]
  /// The member's lines still on their way, in the order written: those
  /// still being sent, and those not sent that fall among `lines`.
  public var waiting: [WaitingLine]
  /// When the next of `waiting` still being sent stops going by itself,
  /// by the device's clock, for the chat to show it not sent then; none
  /// with none.
  public var failsAt: Int64?
  /// The lines reach the chat's first.
  public var atStart: Bool
  /// How many lines the device holds before `lines`, on from them without
  /// a gap: laid out at once as the chat scrolls back, without asking.
  public var heldBefore = 0
  /// The first of the run without a gap the lines are in, before which
  /// the server is asked for a page; none with no lines.
  public var heldFrom: Int64?
  /// The lines reach the latest the device holds; else the page after
  /// them is asked as their foot nears (`pageAfter`).
  public var atEnd = true
  /// How many of others' lines after `lines` the reader has not read,
  /// each the device does not hold yet counted as unread.
  public var unreadAfter = 0
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

  /// How many of others' lines `me` has not read yet, those after the
  /// lines laid out too (counted for the reader the state was read for).
  public func unread(by me: String) -> Int {
    unreadCount(lines.map { ($0.seq, $0.writer(for: me)) }, read: lastRead(by: me)) + unreadAfter
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
  /// The photos it sends, in order; none for anything else.
  public var photos: [LinePhoto] = []
  /// Those of its photos already up, by id.
  public var up: Set<String> = []
  /// Its first link's page.
  public var preview: LinePreview?
  /// The line it answers (返信), by its seq.
  public var replyTo: Int64?
  /// Not sent (a photo could not be uploaded, or it waited too long):
  /// to send again or delete.
  public var failed = false
  public var id: String { opID }

  /// The line `send` waits as, kept in the outbox as `row`, not sent or
  /// not (`failed`).
  init(_ send: Pochical_V1_ChatSend, opID: String, row: ChatOutboxRow, failed: Bool) {
    self.opID = opID
    text = send.text
    madeAtMs = row.madeAtMs
    days = send.days.compactMap(Day.init)
    poll = send.poll
    photos = send.photos.map(LinePhoto.init)
    up = row.up.ids
    preview = send.hasPreview ? LinePreview(send.preview) : nil
    replyTo = send.replyTo == 0 ? nil : Int64(send.replyTo)
    self.failed = failed
  }
}

/// A line placed in a chat by its time: one the group holds, by when it
/// took it, or one of the member's still waiting, by when it was written,
/// and whether it is not sent.
public struct TimedLine<ID> {
  public var id: ID
  public var at: Int64
  public var failed = false

  public init(id: ID, at: Int64, failed: Bool = false) {
    self.id = id
    self.at = at
    self.failed = failed
  }
}

/// The chat's lines in the order shown (spec/chat.md, Lines on their
/// way): the group's in the order it took them, each of the member's not
/// sent where it was written, before the first of the group's whose time
/// is later, and theirs still being sent last, as the newest; each kind of
/// theirs in the order written (spec/vectors/chat.json, order). The chat
/// list's latest line is the last of them.
public func chatOrder<ID>(sent: [TimedLine<ID>], waiting: [TimedLine<ID>]) -> [ID] {
  var failed = waiting.filter(\.failed)[...]
  var order: [ID] = []
  for line in sent {
    let later = failed.firstIndex { $0.at >= line.at } ?? failed.endIndex
    order += failed[..<later].map(\.id)
    failed = failed[later...]
    order.append(line.id)
  }
  order += failed.map(\.id)
  order += waiting.filter { !$0.failed }.map(\.id)
  return order
}

/// The line before another of the same chat, to find where a run of
/// lines without a gap begins.
private enum Earlier: AliasName {}

/// The line after another of the same chat, to find where a run of lines
/// without a gap ends.
private enum Later: AliasName {}

extension Chats {
  /// The chat as its screen shows it: the lines laid out, the member's
  /// sends still waiting (and their changes and taking back already in
  /// place), and every read mark. The lines are those of the run without a
  /// gap holding the first line held at or after `from`, from `from` to
  /// the run's last, so that they stay as later lines come past a gap
  /// (spec/vectors/chat.json, window). With no `from`, as the chat opens,
  /// they are the latest run's: its latest page, back to `me`'s first
  /// unread line when that is earlier, at most `Chat.openMax` lines. Only
  /// the lines it returns are read, and those after them past `me`'s mark.
  /// Its lines not sent are those by the device's time `now`.
  public static func state(
    of threadID: String, in groupID: String, me: String? = nil, from: Int64? = nil,
    now: Int64, db: Database
  ) throws -> ChatState {
    let thread = ChatLineRow.where { $0.groupID.eq(groupID) && $0.threadID.eq(threadID) }
    let unpinned: Int64 = 0
    var pinned = try thread.where { $0.pinnedOrder > unpinned && !$0.unsent }
      .order { $0.pinnedOrder.desc() }.select(\.seq).fetchAll(db)
    let (waiting, failsAt) = try waitingLines(of: threadID, in: groupID, now: now, db: db)
    var ownRead: Int64 = 0
    // The member's waiting edits to each line, in the order made.
    var edits: [Int64: [Pochical_V1_ChatEdit.OneOf_Kind]] = [:]
    for (edit, _) in try waitingEdits(of: groupID, in: db) {
      switch edit.kind {
      case .change(let change) where change.threadID == threadID:
        edits[Int64(change.seq), default: []].append(.change(change))
      case .unsend(let unsend) where unsend.threadID == threadID:
        edits[Int64(unsend.seq), default: []].append(.unsend(unsend))
        pinned = pinStep(pinned, unsend: Int64(unsend.seq)).pins
      case .recall(let recall) where recall.threadID == threadID:
        // Taken back by its send's op_id, should the line have come.
        guard
          let seq = try thread.where({ $0.opID.eq(recall.sendOpID) }).select(\.seq).fetchOne(db)
        else { break }
        edits[seq, default: []].append(.recall(recall))
        pinned = pinStep(pinned, unsend: seq).pins
      case .pin(let pin) where pin.threadID == threadID:
        let seq = Int64(pin.seq)
        pinned = (pin.on ? pinStep(pinned, pin: seq) : pinStep(pinned, unpin: seq)).pins
      case .vote(let vote) where vote.threadID == threadID:
        edits[Int64(vote.seq), default: []].append(.vote(vote))
      case .decide(let decide) where decide.threadID == threadID:
        edits[Int64(decide.seq), default: []].append(.decide(decide))
        // Settling pins the poll (spec/vectors/chat.json, pins).
        pinned = pinStep(pinned, pin: Int64(decide.seq)).pins
      case .react(let react) where react.threadID == threadID:
        edits[Int64(react.seq), default: []].append(.react(react))
      case .read(let read) where read.threadID == threadID:
        ownRead = max(ownRead, Int64(read.lastReadSeq))
      default: break
      }
    }
    let shown = { (row: ChatLineRow) in showing(edits[row.seq] ?? [], on: row, me: me) }

    let latest = try thread.order { $0.seq.desc() }.select(\.seq).limit(1).fetchOne(db)
    let marks = try ReadMarkRow.where { $0.groupID.eq(groupID) && $0.threadID.eq(threadID) }
      .fetchAll(db)
    let readMarks = Dictionary(marks.map { ($0.userID, $0.lastReadSeq) }, uniquingKeysWith: max)
    let read = me.map { max(readMarks[$0] ?? 0, ownRead) }
    // The line the run laid out holds: the first held from `from`, else
    // the latest, laid out as the chat opens.
    let firstHeld = try from.flatMap { from in
      try thread.where { $0.seq >= from }.order(by: \.seq).select(\.seq).limit(1).fetchOne(db)
    }
    let anchor = firstHeld ?? latest
    let start: Int64 =
      if firstHeld != nil, let from { from } else { openingFrom(latest: latest ?? 0, read: read) }
    let one: Int64 = 1
    let runFrom = try anchor.flatMap { anchor in
      try thread.where { line in
        line.seq <= anchor
          && !ChatLineRow.as(Earlier.self).where {
            $0.groupID.eq(line.groupID) && $0.threadID.eq(line.threadID)
              && $0.seq.eq(line.seq - one)
          }
          .exists()
      }
      .order { $0.seq.desc() }.select(\.seq).limit(1).fetchOne(db)
    }
    let runThrough = try anchor.flatMap { anchor in
      try thread.where { line in
        line.seq >= anchor
          && !ChatLineRow.as(Later.self).where {
            $0.groupID.eq(line.groupID) && $0.threadID.eq(line.threadID)
              && $0.seq.eq(line.seq + one)
          }
          .exists()
      }
      .order(by: \.seq).select(\.seq).limit(1).fetchOne(db)
    }
    var lines: [ChatLineRow] = []
    var laidFrom = start
    if let runFrom, let runThrough {
      laidFrom = min(max(runFrom, start), runThrough)
      lines = try thread.where { $0.seq >= laidFrom && $0.seq <= runThrough }.order(by: \.seq)
        .fetchAll(db).map(shown)
    }
    var state = ChatState(
      lines: lines, waiting: waiting, atStart: (lines.first?.seq ?? 1) <= 1,
      marks: readMarks, ownRead: ownRead)
    // The run holds every seq from runFrom to runThrough.
    if let runFrom {
      state.heldBefore = Int(max(laidFrom - runFrom, 0))
    }
    state.heldFrom = runFrom
    if let runThrough, let latest, runThrough < latest {
      state.atEnd = false
      if let me, let read {
        // Past both the lines laid out and the mark: others' lines held,
        // and every line not held yet.
        let after = max(runThrough, read)
        if after < latest {
          let past = try thread.where { $0.seq > after }.fetchAll(db)
          state.unreadAfter =
            Int(latest - after) - past.count + past.count { $0.writer(for: me) == .others }
        }
      }
    }
    // A line not sent shows where it falls among the lines laid out, not
    // past them while later or earlier lines are still to be laid out.
    state.waiting = waiting.filter { line in
      guard line.failed else { return true }
      if !state.atEnd, let last = lines.last, line.madeAtMs >= last.sentAtMs { return false }
      if !state.atStart, let first = lines.first, line.madeAtMs < first.sentAtMs { return false }
      return true
    }
    state.failsAt = failsAt

    var held: [Int64: ChatLineRow] = Dictionary(uniqueKeysWithValues: lines.map { ($0.seq, $0) })
    let replies: [Int64] = lines.compactMap(\.replyTo) + waiting.compactMap(\.replyTo)
    let answered = Set(replies.filter { held[$0] == nil })
    let elsewhere = Array(Set(pinned).union(answered).filter { held[$0] == nil })
    if !elsewhere.isEmpty {
      for row in try thread.where({ $0.seq.in(elsewhere) }).fetchAll(db) {
        held[row.seq] = shown(row)
      }
    }
    state.pins = pinned.compactMap { held[$0] }.filter { !$0.unsent }
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
      case .unsend, .recall:
        row.text = ""
        row.unsent = true
        row.reactions = []
        row.days = []
        row.votes = []
        row.decided = nil
        row.photos = []
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

/// The `before_seq` asking the page straight after a run of lines ending
/// at `through`: as a chat's seqs run without a gap on the server, the
/// page before it holds the lines after `through`, or near the latest the
/// latest page, which reaches them too (spec/vectors/chat.json, pageAfter).
public func pageAfter(through: Int64) -> Int64 {
  through + Int64(Chat.pageSize) + 1
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

/// How many of a line's `count` photos go in each of its album's rows, top
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
  /// The member's line on its way that is the chat's latest, in the
  /// chat's order (`chatOrder`): one still being sent, or one not sent
  /// that came after `last`.
  public var waiting: WaitingLine?
  /// When the next of the member's lines still being sent stops going by
  /// itself, by the device's clock, for the list to say so then; none
  /// with none.
  public var failsAt: Int64?
  public var unread: Int
  /// An unread line the device holds mentions the reader.
  public var mentioned: Bool
  /// What is being written in it, kept as it was left (spec/chat.md,
  /// Drafts).
  public var draft: KeptDraft?

  public init(
    last: ChatLineRow? = nil, waiting: WaitingLine? = nil, failsAt: Int64? = nil,
    unread: Int = 0, mentioned: Bool = false, draft: KeptDraft? = nil
  ) {
    self.last = last
    self.waiting = waiting
    self.failsAt = failsAt
    self.unread = unread
    self.mentioned = mentioned
    self.draft = draft
  }
}

extension Chats {
  /// A chat's latest line and its unread lines that count, for `me`: as
  /// the group counted them, or, while a read of theirs waits to be sent,
  /// others' lines the device holds past it. Its lines not sent are those
  /// by the device's time `now`.
  public static func summary(
    of threadID: String, in groupID: String, me: String, now: Int64, db: Database
  ) throws -> ChatSummary {
    var ownRead: Int64 = 0
    for (edit, _) in try waitingEdits(of: groupID, in: db) {
      if case .read(let read) = edit.kind, read.threadID == threadID {
        ownRead = max(ownRead, Int64(read.lastReadSeq))
      }
    }
    // Lines never delivered to the reader are not theirs to see.
    let last = try ChatLineRow.where {
      $0.groupID.eq(groupID) && $0.threadID.eq(threadID) && !$0.hidden
    }
    .order { $0.seq.desc() }.fetchOne(db)
    let (waiting, failsAt) = try waitingLines(of: threadID, in: groupID, now: now, db: db)
    // The chat's latest line: one of the member's waiting, or nil for the
    // group's.
    let latest = chatOrder(
      sent: last.map { [TimedLine(id: nil, at: $0.sentAtMs)] } ?? [],
      waiting: waiting.map { TimedLine(id: Optional($0), at: $0.madeAtMs, failed: $0.failed) }
    ).last
    let unread = try unread(of: threadID, in: groupID, me: me, ownRead: ownRead, db: db)
    let mentioned =
      unread > 0
      ? try unreadLines(of: threadID, in: groupID, me: me, ownRead: ownRead, db: db)
        .contains { mentions(in: $0).contains(me) }
      : false
    return ChatSummary(
      last: last, waiting: latest ?? nil, failsAt: failsAt, unread: unread,
      mentioned: mentioned, draft: try keptDraft(of: threadID, in: groupID, db: db))
  }

  /// The member's lines of the chat waiting in the group's outbox, in the
  /// order written, each not sent or not by the device's time `now`; and
  /// when the next still being sent stops going by itself, by the device's
  /// clock. A line the group has taken is no longer in the outbox
  /// (`tookBack`).
  private static func waitingLines(
    of threadID: String, in groupID: String, now: Int64, db: Database
  ) throws -> (lines: [WaitingLine], failsAt: Int64?) {
    let clock = try SyncState.current(in: db)
    let now = clock.corrected(now)
    var lines: [WaitingLine] = []
    var failsAt: Int64?
    for (edit, row) in try waitingEdits(of: groupID, in: db) {
      guard case .send(let send) = edit.kind, send.threadID == threadID else { continue }
      let failed = row.notSent(edit, at: now)
      lines.append(WaitingLine(send, opID: edit.opID, row: row, failed: failed))
      if !failed, let due = row.failsAt(edit) {
        failsAt = min(failsAt ?? due, due)
      }
    }
    return (lines, failsAt.map { $0 - clock.offsetMs })
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
