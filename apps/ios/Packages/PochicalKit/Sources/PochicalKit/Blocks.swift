import Foundation
import PochicalProto
import SQLiteData

/// Someone the user has blocked, in every group they share (spec/chat.md,
/// Reporting and blocking), as their User DO sends it.
@Table("blocks")
public struct BlockRow: Hashable, Sendable, Identifiable {
  @Column(primaryKey: true)
  public var userID: String
  public var id: String { userID }
}

extension DatabaseMigrator {
  mutating func registerBlocks() {
    registerMigration("Keep whom the user has blocked") { db in
      try #sql(
        """
        CREATE TABLE "blocks" (
          "userID" TEXT PRIMARY KEY NOT NULL
        ) STRICT
        """
      )
      .execute(db)
    }
  }
}

public enum Blocks {
  /// A block or its undoing, from the user's socket.
  static func take(_ block: Pochical_V1_Block, in db: Database) throws {
    if block.on {
      try BlockRow.upsert { BlockRow(userID: block.userID) }.execute(db)
    } else {
      try BlockRow.find(block.userID).delete().execute(db)
    }
  }

  /// Whom the user has blocked.
  public static func all(in db: Database) throws -> Set<String> {
    Set(try BlockRow.fetchAll(db).map(\.userID))
  }

  /// A Reset: the blocks come again with everything else.
  static func reset(in db: Database) throws {
    try BlockRow.delete().execute(db)
  }
}

extension GroupCalls {
  /// Blocks someone in every group the two share, or unblocks them; the
  /// device hears of it from the user's socket.
  public func setBlocked(_ userID: String, _ blocked: Bool) async throws {
    var request = Pochical_V1_SetBlockedRequest()
    request.userID = userID
    request.blocked = blocked
    _ = try await users.setBlocked(request: request, headers: account.headers()).result.get()
  }

  /// Why something is reported.
  public enum ReportReason: CaseIterable, Sendable {
    case spam, harassment, explicit, impersonation, other

    public var label: String {
      switch self {
      case .spam: "迷惑・スパム"
      case .harassment: "嫌がらせ・いじめ"
      case .explicit: "性的・暴力的な内容"
      case .impersonation: "なりすまし"
      case .other: "その他"
      }
    }

    var wire: Pochical_V1_ReportReason {
      switch self {
      case .spam: .spam
      case .harassment: .harassment
      case .explicit: .explicit
      case .impersonation: .impersonation
      case .other: .other
      }
    }
  }

  /// Reports another member's line, sent with the few around it.
  public func report(
    line seq: Int64, in threadID: String, of groupID: String, because reason: ReportReason
  ) async throws {
    var request = Pochical_V1_ReportRequest()
    request.groupID = groupID
    request.reason = reason.wire
    request.line.threadID = threadID
    request.line.seq = UInt64(seq)
    _ = try await chats.report(request: request, headers: account.headers()).result.get()
  }

  /// Reports a member, sent with their name in the group.
  public func report(
    member userID: String, of groupID: String, because reason: ReportReason
  ) async throws {
    var request = Pochical_V1_ReportRequest()
    request.groupID = groupID
    request.reason = reason.wire
    request.userID = userID
    _ = try await chats.report(request: request, headers: account.headers()).result.get()
  }
}

extension GroupCalls {
  /// Keeps this device's push token for the user's notifications, sent
  /// each launch as iOS may change it.
  public func registerPushToken(_ token: Data) async throws {
    var request = Pochical_V1_RegisterPushTokenRequest()
    request.token = token.map { String(format: "%02x", $0) }.joined()
    #if DEBUG
      request.sandbox = true
    #endif
    _ = try await users.registerPushToken(request: request, headers: account.headers()).result
      .get()
  }
}
