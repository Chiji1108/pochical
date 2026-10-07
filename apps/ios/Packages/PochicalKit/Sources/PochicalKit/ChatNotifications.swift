import Foundation
import PochicalProto
import SQLiteData

/// A chat whose notifications the user turned off (spec/chat.md,
/// Notifications), as their User DO sends it.
@Table("chatMutes")
struct ChatMuteRow: Hashable, Sendable {
  var groupID: String
  var threadID: String
}

/// メンションはいつも通知, once the user has set it.
@Table("chatNotificationSettings")
struct ChatNotificationSettingsRow: Hashable, Sendable {
  @Column(primaryKey: true)
  var id = 1
  var mentionsWhenMuted: Bool
}

extension DatabaseMigrator {
  mutating func registerChatNotifications() {
    registerMigration("Keep the chats turned off") { db in
      try #sql(
        """
        CREATE TABLE "chatMutes" (
          "groupID" TEXT NOT NULL,
          "threadID" TEXT NOT NULL,
          PRIMARY KEY ("groupID", "threadID")
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "chatNotificationSettings" (
          "id" INTEGER PRIMARY KEY NOT NULL CHECK ("id" = 1),
          "mentionsWhenMuted" INTEGER NOT NULL
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        ALTER TABLE "unreadCounts" ADD COLUMN "mentions" INTEGER NOT NULL DEFAULT 0
        """
      )
      .execute(db)
    }
  }
}

/// The user's chat notifications: the chats turned off, and whether
/// mentions notify in them.
public struct ChatNotificationState: Hashable, Sendable {
  /// Each chat turned off, as its group and thread.
  public internal(set) var muted: Set<[String]> = []
  /// メンションはいつも通知: on until the user turns it off.
  public var mentionsWhenMuted = true

  public init() {}

  public func isMuted(_ threadID: String, in groupID: String) -> Bool {
    muted.contains([groupID, threadID])
  }

  /// The chats turned off in `groupID`.
  public func mutedThreads(in groupID: String) -> [String] {
    muted.filter { $0[0] == groupID }.map { $0[1] }.sorted()
  }
}

public enum ChatNotifications {
  /// A chat turned off or on again, from the user's socket.
  static func take(_ mute: Pochical_V1_ChatMute, in db: Database) throws {
    let chat = ChatMuteRow.where { $0.groupID.eq(mute.groupID) && $0.threadID.eq(mute.threadID) }
    if mute.muted {
      try chat.delete().execute(db)
      try ChatMuteRow.insert { ChatMuteRow(groupID: mute.groupID, threadID: mute.threadID) }
        .execute(db)
    } else {
      try chat.delete().execute(db)
    }
  }

  /// メンションはいつも通知, from the user's socket.
  static func take(_ settings: Pochical_V1_ChatNotifications, in db: Database) throws {
    try ChatNotificationSettingsRow.upsert {
      ChatNotificationSettingsRow(mentionsWhenMuted: settings.mentionsWhenMuted)
    }
    .execute(db)
  }

  public static func state(in db: Database) throws -> ChatNotificationState {
    var state = ChatNotificationState()
    state.muted = Set(try ChatMuteRow.fetchAll(db).map { [$0.groupID, $0.threadID] })
    state.mentionsWhenMuted =
      try ChatNotificationSettingsRow.fetchOne(db)?.mentionsWhenMuted ?? true
    return state
  }

  /// A Reset: they come again with everything else.
  static func reset(in db: Database) throws {
    try ChatMuteRow.delete().execute(db)
    try ChatNotificationSettingsRow.delete().execute(db)
  }
}

/// The user's chat notifications, read again as they change.
public struct ChatNotificationsRequest: FetchKeyRequest, Hashable {
  public init() {}

  public func fetch(_ db: Database) throws -> ChatNotificationState {
    try ChatNotifications.state(in: db)
  }
}

/// How many of a chat's unread lines count, as what notifies, from the
/// group's count of them and of their mentions of the reader (spec/chat.md,
/// Unread lines): `notifyingUnread` on counts instead of the lines' words.
func notifyingCount(count: Int, mentions: Int, muted: Bool, mentionsWhenMuted: Bool) -> Int {
  guard muted else { return count }
  return mentionsWhenMuted ? mentions : 0
}

extension GroupCalls {
  /// Turns a chat's notifications off or on again; the device hears of it
  /// from the user's socket.
  public func setChatMuted(_ threadID: String, in groupID: String, muted: Bool) async throws {
    var request = Pochical_V1_SetChatMutedRequest()
    request.groupID = groupID
    request.threadID = threadID
    request.muted = muted
    _ = try await users.setChatMuted(request: request, headers: account.headers()).result.get()
  }

  /// Sets メンションはいつも通知 for the account.
  public func setMentionsWhenMuted(_ on: Bool) async throws {
    var request = Pochical_V1_SetChatNotificationsRequest()
    request.mentionsWhenMuted = on
    _ = try await users.setChatNotifications(request: request, headers: account.headers())
      .result.get()
  }
}
