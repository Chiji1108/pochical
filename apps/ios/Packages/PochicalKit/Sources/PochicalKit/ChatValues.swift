import Foundation
import PochicalDesign
import PochicalProto
import SQLiteData

// A group's chats on the device (spec/sync-protocol.md, Chat): the lines
// and read marks the group sent, and the member's own edits waiting in a
// chat outbox of their own, which the group's socket sends.

/// The group's own chat, 全体チャット.
public let groupThread = "group"

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
  public var id: Int64 { seq }
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
    try ChatLineRow.where {
      $0.groupID.eq(groupID) && $0.threadID.eq(line.threadID) && $0.seq.eq(seq)
    }
    .delete().execute(db)
    let row = ChatLineRow(
      groupID: groupID, threadID: line.threadID, seq: seq, authorID: line.authorID,
      text: line.text, sentAtMs: line.sentAtMs, edited: line.edited, unsent: line.unsent,
      opID: line.opID)
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
  public var id: String { opID }
}

extension Chats {
  /// The chat as its screen shows it: the lines on from the latest back to
  /// the first gap, the member's sends still waiting (and their changes
  /// and taking back already in place), and every read mark.
  public static func state(of threadID: String, in groupID: String, db: Database) throws
    -> ChatState
  {
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
    for row in waitingEdits {
      let edit = try Pochical_V1_ChatEdit(serializedBytes: row.edit)
      switch edit.kind {
      case .send(let send) where send.threadID == threadID && !taken.contains(edit.opID):
        waiting.append(WaitingLine(opID: edit.opID, text: send.text, madeAtMs: row.madeAtMs))
      case .change(let change) where change.threadID == threadID:
        if let at = lines.firstIndex(where: { $0.seq == Int64(change.seq) }) {
          lines[at].text = change.text
          lines[at].edited = true
        }
      case .unsend(let unsend) where unsend.threadID == threadID:
        if let at = lines.firstIndex(where: { $0.seq == Int64(unsend.seq) }) {
          lines[at].text = ""
          lines[at].unsent = true
        }
      case .read(let read) where read.threadID == threadID:
        ownRead = max(ownRead, Int64(read.lastReadSeq))
      default: break
      }
    }
    let marks = try ReadMarkRow.where { $0.groupID.eq(groupID) && $0.threadID.eq(threadID) }
      .fetchAll(db)
    return ChatState(
      lines: lines, waiting: waiting, atStart: (lines.first?.seq ?? 1) <= 1,
      marks: Dictionary(marks.map { ($0.userID, $0.lastReadSeq) }, uniquingKeysWith: max),
      ownRead: ownRead)
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
