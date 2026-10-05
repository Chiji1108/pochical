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
  }
}

enum Groups {
  /// A group the user is in, from their socket; other changes are left
  /// to what takes them.
  static func take(_ change: Pochical_V1_Change, in db: Database) throws {
    guard case .membership(let membership) = change.kind else { return }
    // A group left goes, with what the device holds of it.
    if membership.left {
      try GroupRow.find(membership.groupID).delete().execute(db)
      try GroupSync.reset(membership.groupID, in: db)
      return
    }
    let row = GroupRow(
      id: membership.groupID, name: membership.name, emoji: membership.emoji,
      joinedAtMs: membership.joinedAtMs)
    try GroupRow.upsert { row }.execute(db)
  }

  /// A Reset: the groups come again with everything else.
  static func reset(in db: Database) throws {
    try GroupRow.delete().execute(db)
  }
}

/// The server's GroupService (proto/pochical/v1/group.proto), called as
/// the signed-in user.
public struct GroupCalls: Sendable {
  let account: Account
  let client: Pochical_V1_GroupServiceClient
  private let users: Pochical_V1_UserServiceClient

  public init(account: Account, server: URL = Server.url) {
    self.account = account
    let protocolClient = ProtocolClient(
      httpClient: URLSessionHTTPClient(),
      config: ProtocolClientConfig(
        host: server.absoluteString, networkProtocol: .connect, codec: ProtoCodec()))
    client = Pochical_V1_GroupServiceClient(client: protocolClient)
    users = Pochical_V1_UserServiceClient(client: protocolClient)
  }

  /// The signed-in user's id, as groups know them among their members.
  public func userID() async throws -> String {
    try await users.getMe(request: Pochical_V1_GetMeRequest(), headers: account.headers()).result
      .get().userID
  }

  /// Makes a group with the user in it, as `displayName`. `requestID` is
  /// made once for each group the person sets out to make and sent again
  /// with every retry, so a retry after a lost answer makes no second one.
  /// The new group's id.
  public func create(name: String, emoji: String, displayName: String, requestID: String)
    async throws -> String
  {
    var request = Pochical_V1_CreateGroupRequest()
    request.name = name
    request.emoji = emoji
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
  public func rename(_ groupID: String, name: String, emoji: String) async throws {
    var request = Pochical_V1_RenameGroupRequest()
    request.groupID = groupID
    request.name = name
    request.emoji = emoji
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
