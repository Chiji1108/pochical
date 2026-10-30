import Connect
import Foundation
import PochicalDesign
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
  /// The group's mark when it is a photo, one of the group's photos.
  public var photoID = ""

  /// The group's mark, whichever it is.
  public var mark: GroupMarkValue {
    GroupMarkValue(emoji: emoji, icon: icon, letter: letter, color: color, photoID: photoID)
  }
}

/// The color a group's icon or letters start in, from the user's other
/// groups' `marks` (spec/vectors/groups.json, nextGroupColor): as a new
/// pattern's (`nextColor`), counting only marks drawn in a color, as an
/// emoji's or a photo's 0 is no color.
public func nextGroupColor(_ marks: [GroupMarkValue], slots: Int) -> Int {
  nextColor(marks.compactMap(\.paletteColor), slots: slots)
}

/// A group the person asks to make: its name, its mark and their name in
/// it, under one request id the server makes it once for, so a retry after
/// a lost answer gives back the same group (spec/sync-protocol.md, Groups).
public struct NewGroupRequest: Hashable, Sendable {
  public let name: String
  public let mark: GroupMarkValue
  public let displayName: String
  public let id: String

  /// The request for these, after `last`: the same one again while nothing
  /// it asks for has changed, else a new one with `newID`, as one request
  /// id stands for one request.
  public static func asking(
    name: String, mark: GroupMarkValue, displayName: String, after last: NewGroupRequest?,
    newID: () -> String = { UUID().uuidString.lowercased() }
  ) -> NewGroupRequest {
    if let last, last.name == name, last.mark == mark, last.displayName == displayName {
      return last
    }
    return NewGroupRequest(name: name, mark: mark, displayName: displayName, id: newID())
  }
}

/// A group's mark (/design's GroupMark; proto GroupMark): one emoji, one of
/// the mark icons, letters, the last two in one of the mark palette's
/// colors, or a photo. Every member sees it as it is, whatever their style
/// for shifts.
public struct GroupMarkValue: Hashable, Sendable {
  public var emoji = ""
  public var icon = ""
  public var letter = ""
  public var color = 0
  /// One of the group's photos; a new one is one of the user's own
  /// (`PhotoShelf.mine`), which the group takes a copy of.
  public var photoID = ""

  public init(
    emoji: String = "", icon: String = "", letter: String = "", color: Int = 0,
    photoID: String = ""
  ) {
    self.emoji = emoji
    self.icon = icon
    self.letter = letter
    self.color = color
    self.photoID = photoID
  }

  /// The icon's or letters' color slot; none for an emoji or a photo,
  /// which bring colors of their own.
  public var paletteColor: Int? { icon.isEmpty && letter.isEmpty ? nil : color }

  init(_ wire: Pochical_V1_GroupMark) {
    self.init(
      emoji: wire.emoji, icon: wire.icon, letter: wire.letter, color: Int(wire.color),
      photoID: wire.photoID)
  }

  var wire: Pochical_V1_GroupMark {
    var mark = Pochical_V1_GroupMark()
    mark.emoji = emoji
    mark.icon = icon
    mark.letter = letter
    mark.color = UInt32(max(color, 0))
    mark.photoID = photoID
    return mark
  }
}

/// A new group's mark from its name as it is typed (spec/vectors/groups.json,
/// guessMark): the emoji of the first hint with a word anywhere in the
/// name, else the name's initial letter in `color`.
public func guessedMark(for name: String, color: Int) -> GroupMarkValue {
  if let hint = firstHint(in: ReadyPatterns.groupMarkHints, for: name, words: { $0.words }) {
    return GroupMarkValue(emoji: hint.emoji)
  }
  return GroupMarkValue(letter: initialLetter(of: name), color: color)
}

/// A name's first character, trimmed, as a group's letters start, else
/// `groupMarkFallbackLetter` for a name with none.
public func initialLetter(of name: String) -> String {
  firstLetter(of: name) ?? ReadyPatterns.groupMarkFallbackLetter
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
          "joinedAtMs" INTEGER NOT NULL,
          "icon" TEXT NOT NULL DEFAULT '',
          "letter" TEXT NOT NULL DEFAULT '',
          "color" INTEGER NOT NULL DEFAULT 0,
          "photoID" TEXT NOT NULL DEFAULT ''
        ) STRICT
        """
      )
      .execute(db)
    }
  }
}

/// Told of each group the user leaves or is taken out of, with its
/// `groupID` in the user info, once the device has let go of what it held
/// of it, for what the app keeps of it outside the database (its chats'
/// notifications) to go too.
public let groupLeft = Notification.Name("Groups.left")

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
    if membership.left { return try leave(membership.groupID, in: db) }
    let mark = GroupMarkValue(membership.mark)
    let row = GroupRow(
      id: membership.groupID, name: membership.name, emoji: mark.emoji,
      joinedAtMs: membership.joinedAtMs, icon: mark.icon, letter: mark.letter, color: mark.color,
      photoID: mark.photoID)
    try GroupRow.upsert { row }.execute(db)
  }

  /// A group left goes, with what the device holds of it.
  static func leave(_ groupID: String, in db: Database) throws {
    try GroupRow.find(groupID).delete().execute(db)
    try GroupSync.reset(groupID, in: db)
    try Chats.dropWaiting(of: groupID, in: db)
    try Chats.dropDrafts(of: groupID, in: db)
    try Chats.dropUnread(of: groupID, in: db)
  }

  /// The groups the user is in as the device holds them, read before a
  /// Reset of the user's socket empties the list until its catch-up brings
  /// them again.
  static func held(in db: Database) throws -> Set<String> {
    Set(try GroupRow.fetchAll(db).map(\.id))
  }

  /// After a Reset's catch-up: the groups `held` before it that did not
  /// come again were left while the user was away, as their `left` came
  /// before the Reset and never again. Each goes as a group left does.
  static func gone(since held: Set<String>, in db: Database) throws -> [String] {
    let now = try Self.held(in: db)
    let gone = held.subtracting(now).sorted()
    for groupID in gone { try leave(groupID, in: db) }
    return gone
  }

  /// The groups `changes` say the user left or was taken out of.
  static func left(in changes: [Pochical_V1_Change]) -> [String] {
    changes.compactMap { change in
      guard case .membership(let membership) = change.kind, membership.left else { return nil }
      return membership.groupID
    }
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
/// the signed-in user: whoever AccountSession says the device is now, and
/// no one while it is signing in or its account is changing.
public struct GroupCalls: Sendable {
  let current: CurrentAccount
  let client: Pochical_V1_GroupServiceClient
  let users: Pochical_V1_UserServiceClient
  let chats: Pochical_V1_ChatServiceClient

  public init(current: CurrentAccount, server: URL = Server.url) {
    self.current = current
    let protocolClient = ProtocolClient(
      httpClient: URLSessionHTTPClient(configuration: uncachedConfiguration),
      config: ProtocolClientConfig(
        host: server.absoluteString, networkProtocol: .connect, codec: ProtoCodec()))
    client = Pochical_V1_GroupServiceClient(client: protocolClient)
    users = Pochical_V1_UserServiceClient(client: protocolClient)
    chats = Pochical_V1_ChatServiceClient(client: protocolClient)
  }

  /// The headers that say who is calling, once the device is signed in
  /// (`CurrentAccount.signedIn`).
  func headers() async throws -> [String: [String]] {
    try await current.signedIn().headers
  }

  /// A link's page as the server reads it (spec/chat.md, Reading a page),
  /// nil when no page was found.
  public func linkPreview(_ url: String) async throws -> LinePreview? {
    var request = Pochical_V1_GetLinkPreviewRequest()
    request.url = url
    let answer = try await chats.getLinkPreview(request: request, headers: headers())
      .result.get()
    return answer.hasPreview ? LinePreview(answer.preview) : nil
  }

  /// A link preview's picture, from the device or else the server.
  public func previewImage(_ imageID: String) async throws -> Data {
    try await ChatPhotos.fetchPreviewImage(imageID, as: current.signedIn())
  }

  /// One of the group's chat photos, from the device or else the server;
  /// `small` for its small version, as a line or a quote shows it. Kept on
  /// the device once fetched unless `keep` is false (`ChatPhotos.fetch`).
  public func photo(
    _ photoID: String, in shelf: PhotoShelf, small: Bool = false, keep: Bool = true
  ) async throws -> Data {
    try await ChatPhotos.fetch(
      photoID, in: shelf, small: small, keep: keep, as: current.signedIn())
  }

  /// Makes the group `request` asks for, with the user in it. The new
  /// group's id.
  public func create(_ request: NewGroupRequest) async throws -> String {
    var wire = Pochical_V1_CreateGroupRequest()
    wire.name = request.name
    wire.mark = request.mark.wire
    wire.displayName = request.displayName
    wire.requestID = request.id
    return try await client.createGroup(request: wire, headers: headers()).result
      .get().groupID
  }

  /// The group's live invitation code.
  public func inviteCode(of groupID: String) async throws -> String {
    var request = Pochical_V1_GetInviteLinkRequest()
    request.groupID = groupID
    return try await client.getInviteLink(request: request, headers: headers()).result
      .get().inviteCode
  }

  /// Gives the group a new name and mark, which every member sees.
  public func rename(_ groupID: String, name: String, mark: GroupMarkValue) async throws {
    var request = Pochical_V1_RenameGroupRequest()
    request.groupID = groupID
    request.name = name
    request.mark = mark.wire
    _ = try await client.renameGroup(request: request, headers: headers()).result.get()
  }

  /// How the user appears in the group from now on.
  public func setDisplayName(_ displayName: String, in groupID: String) async throws {
    var request = Pochical_V1_SetDisplayNameRequest()
    request.groupID = groupID
    request.displayName = displayName
    _ = try await client.setDisplayName(request: request, headers: headers()).result
      .get()
  }

  /// Takes the user out of the group.
  public func leave(_ groupID: String) async throws {
    var request = Pochical_V1_LeaveGroupRequest()
    request.groupID = groupID
    _ = try await client.leaveGroup(request: request, headers: headers()).result.get()
  }

  /// Takes another member out of the group, as leaving takes the caller;
  /// the group remembers who did it.
  public func remove(_ userID: String, from groupID: String) async throws {
    var request = Pochical_V1_RemoveMemberRequest()
    request.groupID = groupID
    request.userID = userID
    _ = try await client.removeMember(request: request, headers: headers()).result.get()
  }

  /// A new invitation code for the group: the old link and QR code stop
  /// working at once.
  public func remakeInviteCode(of groupID: String) async throws -> String {
    var request = Pochical_V1_RemakeInviteLinkRequest()
    request.groupID = groupID
    return try await client.remakeInviteLink(request: request, headers: headers()).result
      .get().inviteCode
  }
}

/// The link an invitation code opens (design/src/invite.ts).
public func inviteLink(code: String) -> URL {
  URL(string: "https://pochical.app/invite/\(code)")!
}
