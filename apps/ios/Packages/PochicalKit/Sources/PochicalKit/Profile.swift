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
  /// One of the user's own photos (PhotoShelf.mine); empty for none.
  var photoID = ""
  /// The shape the account says the user's marks are drawn in; empty
  /// before any device sent it.
  var markStyle = ""
  var markFill = true
}

extension DatabaseMigrator {
  mutating func registerProfile() {
    registerMigration("Keep the account's profile") { db in
      try #sql(
        """
        CREATE TABLE "profile" (
          "id" INTEGER PRIMARY KEY NOT NULL CHECK ("id" = 1),
          "name" TEXT NOT NULL,
          "photoID" TEXT NOT NULL DEFAULT '',
          "markStyle" TEXT NOT NULL DEFAULT '',
          "markFill" INTEGER NOT NULL DEFAULT 1
        ) STRICT
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
    try ProfileRow.upsert {
      ProfileRow(
        name: profile.name, photoID: profile.photoID,
        markStyle: profile.hasMarkLook ? profile.markLook.style : "",
        markFill: profile.hasMarkLook ? profile.markLook.fill : true)
    }
    .execute(db)
  }

  /// The shape the user's groups should draw their marks in, when it is
  /// not what the account last said: the look the account keeps among the
  /// preferences, never a device's own before it has taken the account's.
  /// Unset, the account's is the app's default.
  public static func markLookToSend(in db: Database) throws -> MarkLook? {
    guard let row = try PreferenceRow.where({ $0.key.eq("look") }).fetchOne(db),
      let look = try? Look(Pochical_V1_LookPreference(serializedBytes: row.value))
    else { return nil }
    let kept = try markLook(in: db) ?? Look().markLook
    return look.markLook == kept ? nil : look.markLook
  }

  /// The shape the account last said the user's marks are drawn in, nil
  /// before any device sent it.
  public static func markLook(in db: Database) throws -> MarkLook? {
    try ProfileRow.fetchOne(db).flatMap { MarkLook(style: $0.markStyle, fill: $0.markFill) }
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

/// A photo picked for a group's mark that the device has let go of, as
/// the system clears its caches: sending again cannot help, picking again
/// does.
public struct MarkPhotoGone: Error {}

extension GroupCalls {
  /// Sets the usual name and photo, each empty for none; the device hears
  /// of them from the user's socket. A photo goes up first
  /// (`ChatPhotos.send` to `PhotoShelf.mine`).
  public func setProfile(_ profile: UsualProfile) async throws {
    var request = Pochical_V1_SetProfileRequest()
    request.name = profile.name
    request.photoID = profile.photoID
    _ = try await users.setProfile(request: request, headers: headers()).result.get()
  }

  /// Sets the shape the user's marks are drawn in, for their groups to
  /// draw them so; the device hears of it from the user's socket.
  public func setMarkLook(_ look: MarkLook) async throws {
    var request = Pochical_V1_SetMarkLookRequest()
    request.look.style = look.style.rawValue
    request.look.fill = look.fill
    _ = try await users.setMarkLook(request: request, headers: headers()).result.get()
  }

  /// The caller's photo in the group: their usual one, one of the group's
  /// photos they sent up (`ChatPhotos.send`), or none (empty).
  public func setGroupPhoto(usual: Bool, photoID: String = "", in groupID: String) async throws {
    var request = Pochical_V1_SetGroupPhotoRequest()
    request.groupID = groupID
    request.usual = usual
    request.photoID = photoID
    _ = try await client.setGroupPhoto(request: request, headers: headers()).result.get()
  }

  /// Keeps a photo picked for a group's mark on the device, to send up
  /// only as the group is saved with it (`sendMarkPhoto`), and gives the id
  /// to name it by.
  public func holdMarkPhoto(_ jpeg: Data) throws -> String {
    let photoID = UUID().uuidString.lowercased()
    try ChatPhotos.hold(jpeg, as: photoID, in: .mine)
    return photoID
  }

  /// Sends up a photo picked for a group's mark (`holdMarkPhoto`), as one
  /// of the user's own for the group to take as it is saved with it.
  /// `MarkPhotoGone` once the device has let it go, to be picked again.
  public func sendMarkPhoto(_ photoID: String) async throws {
    do {
      try await ChatPhotos.uploadHeld(
        photoID, in: .mine, as: current.signedIn())
    } catch ChatPhotos.UploadError.gone {
      throw MarkPhotoGone()
    }
  }

  /// Sends a photo of the user's up, to the group's photos or their own
  /// (`PhotoShelf.mine`), and gives the id to name it by.
  public func sendPhoto(_ jpeg: Data, to shelf: PhotoShelf) async throws -> String {
    let photoID = UUID().uuidString.lowercased()
    try await ChatPhotos.send(jpeg, as: photoID, in: shelf, as: current.signedIn())
    return photoID
  }
}

/// The shape to send for the user's groups, read again as the look or
/// the account's word on it changes.
public struct MarkLookToSendRequest: FetchKeyRequest, Hashable {
  public init() {}

  public func fetch(_ db: Database) throws -> MarkLook? {
    try Profile.markLookToSend(in: db)
  }
}
