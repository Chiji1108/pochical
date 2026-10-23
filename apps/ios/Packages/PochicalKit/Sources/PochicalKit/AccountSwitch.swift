import Connect
import Foundation
import PochicalProto
import SQLiteData

/// What a user holds that the person entered (spec/sync-protocol.md,
/// Switching to an account in use), from which a few taps tried can be told
/// from months of use.
public struct Holdings: Equatable, Sendable {
  public var shiftDays = 0
  public var repeating = false
  public var coworkers = 0
  public var groups = 0

  public init(shiftDays: Int = 0, repeating: Bool = false, coworkers: Int = 0, groups: Int = 0) {
    self.shiftDays = shiftDays
    self.repeating = repeating
    self.coworkers = coworkers
    self.groups = groups
  }

  /// Nothing entered: a side that holds nothing is let go without asking.
  public var isEmpty: Bool {
    shiftDays == 0 && !repeating && coworkers == 0 && groups == 0
  }

  /// What the device holds of the user now.
  public static func onDevice(in db: Database) throws -> Holdings {
    Holdings(
      shiftDays: try Int.fetchOne(
        db, sql: #"SELECT count(*) FROM "days" WHERE "pattern" IS NOT NULL AND "pattern" != ''"#)
        ?? 0,
      repeating: try Int.fetchOne(db, sql: #"SELECT count(*) FROM "repeatOrders""#) ?? 0 > 0,
      coworkers: try Int.fetchOne(db, sql: #"SELECT count(*) FROM "coworkers""#) ?? 0,
      groups: try Int.fetchOne(db, sql: #"SELECT count(*) FROM "groups""#) ?? 0)
  }
}

extension GroupCalls {
  /// What the account a Sign in with Apple ID token is of holds, when it
  /// is another user's.
  public func peekAccount(appleIDToken: String, nonce: String) async throws -> Holdings {
    var request = Pochical_V1_PeekAccountRequest()
    request.appleIDToken = appleIDToken
    request.nonce = nonce
    let answer = try await users.peekAccount(request: request, headers: headers())
      .result.mapError(suspendedOr).get()
    return Holdings(
      shiftDays: Int(answer.shiftDays), repeating: answer.repeating,
      coworkers: Int(answer.coworkers), groups: Int(answer.groups))
  }

  /// Keeps this device's data: the account's user deleted, and its Apple
  /// account linked to this one.
  public func takeAccount(appleIDToken: String, nonce: String) async throws {
    var request = Pochical_V1_TakeAccountRequest()
    request.appleIDToken = appleIDToken
    request.nonce = nonce
    _ = try await users.takeAccount(request: request, headers: headers()).result
      .mapError(suspendedOr).get()
  }
}

/// The server's PERMISSION_DENIED to switching as the account being
/// suspended; any other error as it is.
private func suspendedOr(_ error: ConnectError) -> any Error {
  error.code == .permissionDenied ? AccountSuspended() : error
}
