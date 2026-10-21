import Foundation
import PochicalDesign
import PochicalProto
import SQLiteData

// What is being written in a chat, kept on the device as the chat is left
// (spec/chat.md, Drafts), and the member's lines that could not be sent
// or were taken back while they waited (Lines on their way).

/// The line a draft answers (返信), by seq, or the line of one's own it
/// changes (編集), as `Edited`: one or the other, never both, as the
/// composer shows one bar for it (spec/chat.md, Replies; Editing and
/// unsending).
public enum DraftTarget<Edited: Hashable & Sendable>: Hashable, Sendable {
  case reply(Int64)
  case edit(Edited)

  /// The line answered, if it answers one.
  public var replyTo: Int64? {
    if case .reply(let seq) = self { seq } else { nil }
  }

  /// The line changed, if it changes one.
  public var editing: Edited? {
    if case .edit(let line) = self { line } else { nil }
  }

  /// The same target, the line changed as `transform` makes it.
  public func map<Other>(_ transform: (Edited) -> Other) -> DraftTarget<Other> {
    switch self {
    case .reply(let seq): .reply(seq)
    case .edit(let line): .edit(transform(line))
    }
  }
}

extension DraftTarget where Edited == Int64 {
  /// The target as two seqs are kept apart (the drafts table, the
  /// vectors), at most one of them set; none for neither.
  init?(replyTo: Int64?, editing: Int64?) {
    if let editing {
      self = .edit(editing)
    } else if let replyTo {
      self = .reply(replyTo)
    } else {
      return nil
    }
  }

  /// The line answered or changed.
  var seq: Int64 {
    switch self {
    case .reply(let seq), .edit(let seq): seq
    }
  }
}

/// What was being written in a chat: its words as they would be sent (its
/// mentions as <@id>), and the line it answers or changes, by seq.
public struct KeptDraft: Hashable, Sendable {
  public var text: String
  public var target: DraftTarget<Int64>?

  public init(text: String, target: DraftTarget<Int64>? = nil) {
    self.text = text
    self.target = target
  }
}

/// The draft to keep, or to open again, with the content of the chat's
/// lines as the device holds them (`lineOf`, nil for one it does not
/// hold); nil for none: words make a draft, an edit whose words are still
/// the line's own is none, an edit of a line taken back or not held goes
/// with its words, and a reply to a line taken back keeps its words
/// without the quote (spec/vectors/chat.json, draft).
public func keptDraft(_ draft: KeptDraft, lineOf: (Int64) -> LineContent?) -> KeptDraft? {
  guard !draft.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
  switch draft.target {
  case .edit(let seq):
    guard case .words(let words) = lineOf(seq), words.text != draft.text else { return nil }
    return draft
  case .reply(let seq) where lineOf(seq) == .unsent:
    return KeptDraft(text: draft.text)
  case .reply, nil:
    return draft
  }
}

/// A chat's draft on the device: its target as two columns, at most one
/// of them set.
@Table("chatDrafts")
struct ChatDraftRow: Hashable, Sendable {
  var groupID: String
  var threadID: String
  var text: String
  var replyTo: Int64?
  var editing: Int64?
  var savedAtMs: Int64

  var target: DraftTarget<Int64>? {
    DraftTarget(replyTo: replyTo, editing: editing)
  }
}

/// A draft as a chat opens with it: the line being changed whole, for the
/// composer to change.
public struct OpenedDraft: Hashable, Sendable {
  public var text: String
  public var target: DraftTarget<ChatLineRow>?
}

extension DatabaseMigrator {
  mutating func registerChatDrafts() {
    registerMigration("Keep the chats' drafts") { db in
      try #sql(
        """
        CREATE TABLE "chatDrafts" (
          "groupID" TEXT NOT NULL,
          "threadID" TEXT NOT NULL,
          "text" TEXT NOT NULL,
          "replyTo" INTEGER,
          "editing" INTEGER,
          "savedAtMs" INTEGER NOT NULL,
          PRIMARY KEY ("groupID", "threadID"),
          CHECK ("replyTo" IS NULL OR "editing" IS NULL)
        ) STRICT
        """
      )
      .execute(db)
    }
  }
}

extension Chats {
  // MARK: Drafts

  /// Keeps what is being written in a chat, or forgets it when it makes
  /// no draft (`keptDraft`).
  public static func keepDraft(
    _ draft: KeptDraft, of threadID: String, in groupID: String, now: Int64, db: Database
  ) throws {
    let held = ChatDraftRow.where { $0.groupID.eq(groupID) && $0.threadID.eq(threadID) }
    try held.delete().execute(db)
    guard
      let kept = try keptDraft(
        draft, of: threadID, in: groupID, db: db)
    else { return }
    try ChatDraftRow.insert {
      ChatDraftRow(
        groupID: groupID, threadID: threadID, text: kept.text, replyTo: kept.target?.replyTo,
        editing: kept.target?.editing, savedAtMs: now)
    }
    .execute(db)
  }

  /// The chat's draft as it opens, with its lines as they are now.
  public static func draft(of threadID: String, in groupID: String, db: Database) throws
    -> OpenedDraft?
  {
    guard let kept = try keptDraft(of: threadID, in: groupID, db: db) else { return nil }
    switch kept.target {
    case .edit(let seq):
      // Kept only while the device holds the line (`keptDraft`).
      let line = try line(kept: seq, of: threadID, in: groupID, db: db)
      return OpenedDraft(text: kept.text, target: line.map(DraftTarget.edit))
    case .reply(let seq):
      return OpenedDraft(text: kept.text, target: .reply(seq))
    case nil:
      return OpenedDraft(text: kept.text)
    }
  }

  /// The chat's draft as kept, with its lines as they are now.
  static func keptDraft(of threadID: String, in groupID: String, db: Database) throws
    -> KeptDraft?
  {
    guard
      let row = try ChatDraftRow.where({ $0.groupID.eq(groupID) && $0.threadID.eq(threadID) })
        .fetchOne(db)
    else { return nil }
    return try keptDraft(
      KeptDraft(text: row.text, target: row.target), of: threadID, in: groupID, db: db)
  }

  /// The group's chats with a draft.
  static func draftThreads(in groupID: String, db: Database) throws -> [String] {
    try ChatDraftRow.where { $0.groupID.eq(groupID) }.select(\.threadID).fetchAll(db)
  }

  /// A group left takes its drafts with it.
  static func dropDrafts(of groupID: String, in db: Database) throws {
    try ChatDraftRow.where { $0.groupID.eq(groupID) }.delete().execute(db)
  }

  private static func keptDraft(
    _ draft: KeptDraft, of threadID: String, in groupID: String, db: Database
  ) throws -> KeptDraft? {
    let line = try draft.target.flatMap {
      try line(kept: $0.seq, of: threadID, in: groupID, db: db)
    }
    // The target's line is the one asked for.
    return PochicalKit.keptDraft(draft) { _ in line?.content }
  }

  private static func line(kept seq: Int64, of threadID: String, in groupID: String, db: Database)
    throws -> ChatLineRow?
  {
    try ChatLineRow.where {
      $0.groupID.eq(groupID) && $0.threadID.eq(threadID) && $0.seq.eq(seq)
    }
    .fetchOne(db)
  }

  // MARK: Lines not sent

  /// A line of the member's taken out of the outbox while it waited
  /// (送信取消, or 削除 once not sent). One that went out on a socket the
  /// group may have taken meanwhile, its answer not yet come, so it is
  /// taken back from the group by its send's op_id (`ChatRecall`), which
  /// also keeps the send from coming after should the group not have it
  /// yet. One that never went out the group cannot have, and never will,
  /// as it is no longer in the outbox: nothing is left to take back.
  public static func takeBack(_ opID: String, in db: Database) throws {
    guard let row = try ChatOutboxRow.where({ $0.opID.eq(opID) }).fetchOne(db) else { return }
    try ChatOutboxRow.where { $0.opID.eq(opID) }.delete().execute(db)
    guard row.wentOut,
      case .send(let send) = try Pochical_V1_ChatEdit(serializedBytes: row.edit).kind
    else { return }
    var recall = Pochical_V1_ChatRecall()
    recall.threadID = send.threadID
    recall.sendOpID = opID
    // Its photos, uploaded, go with the line, or at once if it never came.
    recall.photoIds = send.photos.map(\.id)
    try edit(
      .recall(recall), in: row.groupID, now: Int64(Date.now.timeIntervalSince1970 * 1000), db: db)
  }

  /// A line come from the group stops waiting, as the group's line from
  /// then on: one whose answer is still to come or was lost, and one not
  /// sent that the group took after all.
  static func tookBack(_ line: Pochical_V1_ChatLine, of groupID: String, in db: Database) throws {
    try ChatOutboxRow.where { $0.opID.eq(line.opID) }.delete().execute(db)
  }
}
