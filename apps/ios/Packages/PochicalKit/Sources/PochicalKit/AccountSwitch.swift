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
    let answer = try await users.peekAccount(request: request, headers: account.headers())
      .result.get()
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
    _ = try await users.takeAccount(request: request, headers: account.headers()).result.get()
  }

  /// Deletes the user whose session `token` is, rather than the one signed
  /// in now: the device's user left behind as it switched to the account.
  public func deleteAccount(signedInAs token: String) async throws {
    _ = try await users.deleteAccount(
      request: Pochical_V1_DeleteAccountRequest(), headers: ["Authorization": ["Bearer \(token)"]]
    ).result.get()
  }
}

extension Account {
  /// Signs in to the user the Apple account is linked to, with its ID token
  /// (better-auth's `/api/auth/sign-in/social`), keeping that user's
  /// session from now on. The session it was, for deleting its user.
  public func signInApple(idToken: String, nonce: String) async throws -> String {
    let before = try await token()
    var request = URLRequest(url: server.appending(path: "api/auth/sign-in/social"))
    request.httpMethod = "POST"
    request.httpShouldHandleCookies = false
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(before)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "idToken": ["nonce": nonce, "token": idToken], "provider": "apple",
    ])
    let (_, response) = try await send(request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200,
      let token = http.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty
    else {
      throw SignInError(status: (response as? HTTPURLResponse)?.statusCode)
    }
    try store.forget()
    try store.keep(token)
    return before
  }

  /// Signs out (better-auth's `/api/auth/sign-out`): the session ends on the
  /// server, its sockets with it, and the device forgets it.
  public func signOut() async throws {
    var request = URLRequest(url: server.appending(path: "api/auth/sign-out"))
    request.httpMethod = "POST"
    request.httpShouldHandleCookies = false
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(try await token())", forHTTPHeaderField: "Authorization")
    request.httpBody = Data("{}".utf8)
    let (_, response) = try await send(request)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
      throw SignInError(status: (response as? HTTPURLResponse)?.statusCode)
    }
    try store.forget()
  }
}
