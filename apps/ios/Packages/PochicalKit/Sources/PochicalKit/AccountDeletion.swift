import Foundation
import PochicalProto
import SQLiteData

extension GroupCalls {
  /// Deletes the user's account and everything of it on the server
  /// (spec/sync-protocol.md, Deleting an account), with Sign in with
  /// Apple's fresh authorization code when the user is linked to Apple.
  public func deleteAccount(appleAuthorizationCode: String?) async throws {
    var request = Pochical_V1_DeleteAccountRequest()
    request.appleAuthorizationCode = appleAuthorizationCode ?? ""
    _ = try await users.deleteAccount(request: request, headers: account.headers()).result.get()
  }
}

/// Everything the device holds of the user, gone as their account is: the
/// database's rows, its outbox too, the photos kept for the chats, and who
/// the device was signed in as. The device's own settings stay.
public enum LocalData {
  /// Every table the user's data is in.
  private static let tables = [
    "blocks", "chatLines", "chatMutes", "chatNotificationSettings", "chatOutbox",
    "coworkerOrder", "coworkers", "days", "groupCursors", "groupMembers", "groups",
    "memberDays", "memberOrders", "memberPatterns", "outbox", "patternOrder", "patterns", "preferences", "profile",
    "readMarks", "repeatOrders", "serverValues", "syncState", "unreadCounts",
  ]

  public static func erase(in db: Database) throws {
    for table in tables {
      try db.execute(sql: "DELETE FROM \"\(table)\"")
    }
  }

  /// The chats' photos kept on the device, and the user's id.
  public static func eraseFiles() {
    ChatPhotos.eraseAll()
    UserDefaults(suiteName: appGroup)?.removeObject(forKey: "userID")
    LinkedAccount.keep(nil)
  }
}
