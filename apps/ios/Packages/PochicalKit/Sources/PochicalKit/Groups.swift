import Connect
import Foundation
import PochicalProto
import SQLiteData

/// A group the user is in, as their User DO sends it (spec/sync-protocol.md,
/// Groups): its name and mark as last heard, for their list of groups.
@Table("groups")
public struct GroupRow: Hashable, Sendable, Identifiable {
  @Column(primaryKey: true)
  public var id: String
  public var name: String
  /// The group's mark when it is an emoji; empty for other marks.
  public var emoji: String
  /// When the user joined, in ms since the epoch: the list's order.
  public var joinedAtMs: Int64
  /// The group's mark when it is a mark icon, by its name.
  public var icon = ""
  /// The group's mark when it is letters.
  public var letter = ""
  /// The icon's or letters' color slot.
  public var color = 0

  /// The group's mark, whichever it is.
  public var mark: GroupMarkValue {
    GroupMarkValue(emoji: emoji, icon: icon, letter: letter, color: color)
  }
}

/// A group's mark (/design's GroupMark; proto GroupMark): one emoji, one of
/// the mark icons, or letters, the last two in one of the mark palette's
/// colors. Every member sees it as it is, whatever their style for shifts.
public struct GroupMarkValue: Hashable, Sendable {
  public var emoji = ""
  public var icon = ""
  public var letter = ""
  public var color = 0

  public init(emoji: String = "", icon: String = "", letter: String = "", color: Int = 0) {
    self.emoji = emoji
    self.icon = icon
    self.letter = letter
    self.color = color
  }

  init(_ wire: Pochical_V1_GroupMark) {
    self.init(
      emoji: wire.emoji, icon: wire.icon, letter: wire.letter, color: Int(wire.color))
  }

  var wire: Pochical_V1_GroupMark {
    var mark = Pochical_V1_GroupMark()
    mark.emoji = emoji
    mark.icon = icon
    mark.letter = letter
    mark.color = UInt32(max(color, 0))
    return mark
  }
}

extension DatabaseMigrator {
  mutating func registerGroups() {
    registerMigration("Create the user's groups") { db in
      try #sql(
        """
        CREATE TABLE "groups" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "name" TEXT NOT NULL,
          "emoji" TEXT NOT NULL,
          "joinedAtMs" INTEGER NOT NULL
        ) STRICT
        """
      )
      .execute(db)
    }
    registerMigration("Keep groups' icon and letter marks") { db in
      for column in [
        #"ALTER TABLE "groups" ADD COLUMN "icon" TEXT NOT NULL DEFAULT ''"#,
        #"ALTER TABLE "groups" ADD COLUMN "letter" TEXT NOT NULL DEFAULT ''"#,
        #"ALTER TABLE "groups" ADD COLUMN "color" INTEGER NOT NULL DEFAULT 0"#,
      ] {
        try db.execute(sql: column)
      }
    }
  }
}

enum Groups {
  /// A group the user is in, or how much of its chats they have not
  /// read, from their socket; other changes are left to what takes them.
  static func take(_ change: Pochical_V1_Change, in db: Database) throws {
    if case .unreadCount(let unread) = change.kind {
      try Chats.take(unread, in: db)
      return
    }
    if case .block(let block) = change.kind {
      try Blocks.take(block, in: db)
      return
    }
    if case .chatMute(let mute) = change.kind {
      try ChatNotifications.take(mute, in: db)
      return
    }
    if case .chatNotifications(let settings) = change.kind {
      try ChatNotifications.take(settings, in: db)
      return
    }
    if case .profile(let profile) = change.kind {
      try Profile.take(profile, in: db)
      return
    }
    guard case .membership(let membership) = change.kind else { return }
    // A group left goes, with what the device holds of it.
    if membership.left {
      try GroupRow.find(membership.groupID).delete().execute(db)
      try GroupSync.reset(membership.groupID, in: db)
      try Chats.dropWaiting(of: membership.groupID, in: db)
      try Chats.dropUnread(of: membership.groupID, in: db)
      return
    }
    let mark = GroupMarkValue(membership.mark)
    let row = GroupRow(
      id: membership.groupID, name: membership.name, emoji: mark.emoji,
      joinedAtMs: membership.joinedAtMs, icon: mark.icon, letter: mark.letter, color: mark.color)
    try GroupRow.upsert { row }.execute(db)
  }

  /// A Reset: the groups come again with everything else.
  static func reset(in db: Database) throws {
    try GroupRow.delete().execute(db)
    try UnreadCountRow.delete().execute(db)
    try Blocks.reset(in: db)
    try ChatNotifications.reset(in: db)
    try Profile.reset(in: db)
  }
}

/// The server's GroupService (proto/pochical/v1/group.proto), called as
/// the signed-in user.
public struct GroupCalls: Sendable {
  let account: Account
  let client: Pochical_V1_GroupServiceClient
  let users: Pochical_V1_UserServiceClient
  let chats: Pochical_V1_ChatServiceClient
  let support: Pochical_V1_SupportServiceClient

  public init(account: Account, server: URL = Server.url) {
    self.account = account
    let protocolClient = ProtocolClient(
      httpClient: URLSessionHTTPClient(),
      config: ProtocolClientConfig(
        host: server.absoluteString, networkProtocol: .connect, codec: ProtoCodec()))
    client = Pochical_V1_GroupServiceClient(client: protocolClient)
    users = Pochical_V1_UserServiceClient(client: protocolClient)
    chats = Pochical_V1_ChatServiceClient(client: protocolClient)
    support = Pochical_V1_SupportServiceClient(client: protocolClient)
  }

  /// A link's page as the server reads it (spec/chat.md, Reading a page),
  /// nil when no page was found.
  public func linkPreview(_ url: String) async throws -> LinePreview? {
    var request = Pochical_V1_GetLinkPreviewRequest()
    request.url = url
    let answer = try await chats.getLinkPreview(request: request, headers: account.headers())
      .result.get()
    return answer.hasPreview ? LinePreview(answer.preview) : nil
  }

  /// A link preview's picture, from the device or else the server.
  public func previewImage(_ imageID: String) async throws -> Data {
    try await ChatPhotos.fetchPreviewImage(imageID, account: account)
  }

  /// One of the group's chat photos, from the device or else the server.
  public func photo(_ photoID: String, in groupID: String) async throws -> Data {
    try await ChatPhotos.fetch(photoID, in: groupID, account: account)
  }

  /// The signed-in user's id, as groups know them among their members:
  /// the server's, kept on the device, so the screens still know who is
  /// who offline. Nil only before it was ever heard.
  public func userID() async -> String? {
    let store = UserDefaults(suiteName: appGroup) ?? .standard
    let key = "userID"
    let answer = await users.getMe(
      request: Pochical_V1_GetMeRequest(), headers: (try? await account.headers()) ?? [:])
    if case .success(let me) = answer.result {
      store.set(me.userID, forKey: key)
      return me.userID
    }
    return store.string(forKey: key)
  }

  /// Makes a group with the user in it, as `displayName`. `requestID` is
  /// made once for each group the person sets out to make and sent again
  /// with every retry, so a retry after a lost answer makes no second one.
  /// The new group's id.
  public func create(
    name: String, mark: GroupMarkValue, displayName: String, requestID: String
  ) async throws -> String {
    var request = Pochical_V1_CreateGroupRequest()
    request.name = name
    request.mark = mark.wire
    request.displayName = displayName
    request.requestID = requestID
    return try await client.createGroup(request: request, headers: account.headers()).result
      .get().groupID
  }

  /// The group's live invitation code.
  public func inviteCode(of groupID: String) async throws -> String {
    var request = Pochical_V1_GetInviteLinkRequest()
    request.groupID = groupID
    return try await client.getInviteLink(request: request, headers: account.headers()).result
      .get().inviteCode
  }

  /// Gives the group a new name and mark, which every member sees.
  public func rename(_ groupID: String, name: String, mark: GroupMarkValue) async throws {
    var request = Pochical_V1_RenameGroupRequest()
    request.groupID = groupID
    request.name = name
    request.mark = mark.wire
    _ = try await client.renameGroup(request: request, headers: account.headers()).result.get()
  }

  /// How the user appears in the group from now on.
  public func setDisplayName(_ displayName: String, in groupID: String) async throws {
    var request = Pochical_V1_SetDisplayNameRequest()
    request.groupID = groupID
    request.displayName = displayName
    _ = try await client.setDisplayName(request: request, headers: account.headers()).result
      .get()
  }

  /// Takes the user out of the group.
  public func leave(_ groupID: String) async throws {
    var request = Pochical_V1_LeaveGroupRequest()
    request.groupID = groupID
    _ = try await client.leaveGroup(request: request, headers: account.headers()).result.get()
  }

  /// A new invitation code for the group: the old link and QR code stop
  /// working at once.
  public func remakeInviteCode(of groupID: String) async throws -> String {
    var request = Pochical_V1_RemakeInviteLinkRequest()
    request.groupID = groupID
    return try await client.remakeInviteLink(request: request, headers: account.headers()).result
      .get().inviteCode
  }
}

/// The link an invitation code opens (design/src/invite.ts).
public func inviteLink(code: String) -> URL {
  URL(string: "https://pochical.app/invite/\(code)")!
}
