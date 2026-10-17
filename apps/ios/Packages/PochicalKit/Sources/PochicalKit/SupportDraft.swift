import Foundation
import SQLiteData

// What is being written to Pochical's people, kept on the device as the
// chat is left, as a group chat keeps its own (spec/chat.md, The chat
// with Pochical's people). Its lines are the server's, by id, and none is
// changed, so a draft is words and the line they answer.

/// What was being written in the chat with Pochical's people, and the
/// line it answers, by id.
@Table("supportDraft")
public struct SupportDraft: Hashable, Sendable {
  public var text: String
  public var replyTo: String?
  public var savedAtMs: Int64 = 0

  public init(text: String, replyTo: String? = nil, savedAtMs: Int64 = 0) {
    self.text = text
    self.replyTo = replyTo
    self.savedAtMs = savedAtMs
  }

  /// The draft to keep, or to open again, with the chat's lines (nil
  /// while they have not come): a group chat's rule (`keptDraft`), so
  /// words make a draft, and a reply to a line taken back since, by
  /// either side, keeps its words without the quote.
  public func kept(lines: [SupportLine]?) -> SupportDraft? {
    let line = replyTo.flatMap { id in lines?.first { $0.id == id } }
    // `keptDraft` knows lines by seq; the one line this can answer
    // stands in as 0.
    let kept = keptDraft(KeptDraft(text: text, replyTo: replyTo.map { _ in 0 })) { _ in
      line.map { DraftLine(text: $0.text, unsent: $0.unsent) }
    }
    return kept.map {
      SupportDraft(text: $0.text, replyTo: $0.replyTo.flatMap { _ in replyTo }, savedAtMs: savedAtMs)
    }
  }
}

extension DatabaseMigrator {
  mutating func registerSupportDraft() {
    registerMigration("Keep the draft to Pochical's people") { db in
      try #sql(
        """
        CREATE TABLE "supportDraft" (
          "text" TEXT NOT NULL,
          "replyTo" TEXT,
          "savedAtMs" INTEGER NOT NULL
        ) STRICT
        """
      )
      .execute(db)
    }
  }
}

extension SupportDraft {
  /// Keeps what is being written to Pochical's people, with the chat's
  /// lines as they are, or forgets it when it makes no draft.
  public static func keep(
    _ draft: SupportDraft, lines: [SupportLine]?, now: Int64, db: Database
  ) throws {
    try SupportDraft.delete().execute(db)
    guard var kept = draft.kept(lines: lines) else { return }
    kept.savedAtMs = now
    try SupportDraft.insert { kept }.execute(db)
  }

  /// The draft as kept, before the chat's lines have come.
  public static func held(db: Database) throws -> SupportDraft? {
    try SupportDraft.all.fetchOne(db)
  }
}
