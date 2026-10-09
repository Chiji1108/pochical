import Foundation
import PochicalProto
import SQLiteData

/// The user's usual name (いつもの名前), as their User DO sends it, once
/// they have set one (spec/sync-protocol.md, Profile).
@Table("profile")
struct ProfileRow: Hashable, Sendable {
  @Column(primaryKey: true)
  var id = 1
  var name: String
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
  }
}

/// The usual name: what creating or joining a group starts with, each
/// group keeping its own after.
public enum Profile {
  /// The usual name, from the user's socket.
  static func take(_ profile: Pochical_V1_Profile, in db: Database) throws {
    try ProfileRow.upsert { ProfileRow(name: profile.name) }.execute(db)
  }

  /// The usual name, empty before the user sets one.
  public static func name(in db: Database) throws -> String {
    try ProfileRow.fetchOne(db)?.name ?? ""
  }

  /// A Reset: it comes again with everything else.
  static func reset(in db: Database) throws {
    try ProfileRow.delete().execute(db)
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
  /// Sets the usual name, empty for none; the device hears of it from the
  /// user's socket.
  public func setProfileName(_ name: String) async throws {
    var request = Pochical_V1_SetProfileRequest()
    request.name = name
    _ = try await users.setProfile(request: request, headers: account.headers()).result.get()
  }
}
