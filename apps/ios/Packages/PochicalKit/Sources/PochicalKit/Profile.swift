import Foundation
import PochicalProto
import SQLiteData

/// The user's usual name (いつもの名前) and photo, as their User DO sends
/// them, once they have set them (spec/sync-protocol.md, Profile).
@Table("profile")
struct ProfileRow: Hashable, Sendable {
  @Column(primaryKey: true)
  var id = 1
  var name: String
  /// One of the user's own photos (ChatPhotos.mine); empty for none.
  var photoID = ""
}

extension DatabaseMigrator {
  mutating func registerProfile() {
    registerMigration("Keep the usual name") { db in
      try #sql(
        """
        CREATE TABLE "profile" (
          "id" INTEGER PRIMARY KEY NOT NULL CHECK ("id" = 1),
          "name" TEXT NOT NULL
        ) STRICT
        """
      )
      .execute(db)
    }
    registerMigration("Keep the usual photo") { db in
      try #sql(
        """
        ALTER TABLE "profile" ADD COLUMN "photoID" TEXT NOT NULL DEFAULT ''
        """
      )
      .execute(db)
    }
  }
}

/// The usual name and photo, each empty before the user sets them.
public struct UsualProfile: Hashable, Sendable {
  public var name = ""
  public var photoID = ""

  public init(name: String = "", photoID: String = "") {
    self.name = name
    self.photoID = photoID
  }
}

/// The usual name: what creating or joining a group starts with, each
/// group keeping its own after.
public enum Profile {
  /// The usual name, from the user's socket.
  static func take(_ profile: Pochical_V1_Profile, in db: Database) throws {
    try ProfileRow.upsert { ProfileRow(name: profile.name, photoID: profile.photoID) }.execute(db)
  }

  /// The usual name, empty before the user sets one.
  public static func name(in db: Database) throws -> String {
    try ProfileRow.fetchOne(db)?.name ?? ""
  }

  /// The usual name and photo.
  public static func usual(in db: Database) throws -> UsualProfile {
    let row = try ProfileRow.fetchOne(db)
    return UsualProfile(name: row?.name ?? "", photoID: row?.photoID ?? "")
  }

  /// A Reset: it comes again with everything else.
  static func reset(in db: Database) throws {
    try ProfileRow.delete().execute(db)
  }
}

/// The usual name and photo, read again as they change.
public struct UsualProfileRequest: FetchKeyRequest, Hashable {
  public init() {}

  public func fetch(_ db: Database) throws -> UsualProfile {
    try Profile.usual(in: db)
  }
}

/// The usual name, read again as it changes.
public struct ProfileNameRequest: FetchKeyRequest, Hashable {
  public init() {}

  public func fetch(_ db: Database) throws -> String {
    try Profile.name(in: db)
  }
}

extension GroupCalls {
  /// Sets the usual name and photo, each empty for none; the device hears
  /// of them from the user's socket. A photo goes up first
  /// (`ChatPhotos.send` to `ChatPhotos.mine`).
  public func setProfile(_ profile: UsualProfile) async throws {
    var request = Pochical_V1_SetProfileRequest()
    request.name = profile.name
    request.photoID = profile.photoID
    _ = try await users.setProfile(request: request, headers: account.headers()).result.get()
  }

  /// The caller's photo in the group: their usual one, one of the group's
  /// photos they sent up (`ChatPhotos.send`), or none (empty).
  public func setGroupPhoto(usual: Bool, photoID: String = "", in groupID: String) async throws {
    var request = Pochical_V1_SetGroupPhotoRequest()
    request.groupID = groupID
    request.usual = usual
    request.photoID = photoID
    _ = try await client.setGroupPhoto(request: request, headers: account.headers()).result.get()
  }

  /// Sends a photo of the user's up, to the group's photos or their own
  /// (`ChatPhotos.mine`), and gives the id to name it by.
  public func sendPhoto(_ jpeg: Data, to groupID: String) async throws -> String {
    let photoID = UUID().uuidString.lowercased()
    try await ChatPhotos.send(jpeg, as: photoID, in: groupID, account: account)
    return photoID
  }
}
