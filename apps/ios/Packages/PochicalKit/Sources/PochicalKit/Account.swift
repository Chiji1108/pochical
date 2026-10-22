import Connect
import Foundation
import OSLog
import PochicalProto
import Security

/// Where the apps reach the server: `mise run server` on the Mac while
/// developing in the simulator, which reaches it as localhost. A Debug
/// build on an iPhone cannot, so it uses the deployed server, the only
/// one that can send its notifications.
public enum Server {
  #if DEBUG && targetEnvironment(simulator)
    public static let url = URL(string: "http://localhost:8787")!
  #else
    public static let url = URL(string: "https://api.pochical.app")!
  #endif
}

/// A session the device keeps: its token, the user it signs in as, and
/// whether the server said it does not know it, kept as one so they never
/// part: a session that ended stays ended, a relaunch too, until the
/// person tries it again or starts afresh (AccountSession, `ended`).
public struct StoredSession: Codable, Equatable, Sendable {
  public let token: String
  public let userID: String
  public let ended: Bool

  public init(token: String, userID: String, ended: Bool = false) {
    self.token = token
    self.userID = userID
    self.ended = ended
  }
}

/// Where a session's bytes are kept.
protocol TokenStore: Sendable {
  func data() throws -> Data?
  /// What is kept from now on, in place of what was, in one step.
  func replace(with data: Data) throws
  /// Nothing kept, as after the account is deleted.
  func forget() throws
}

/// The session in the Keychain, which outlives the app, so a reinstall
/// comes back as the same user, and goes with the phone's encrypted
/// backups and Quick Start, so a new phone does too (spec/sync-protocol.md,
/// Signing in). Not synced through iCloud Keychain: the person's other
/// devices come in by linking Apple or Google. Readable after the phone's
/// first unlock, as the app syncs in the background.
struct KeychainTokenStore: TokenStore {
  let service: String
  let account: String

  init(service: String = "app.pochical.session", account: String = "token") {
    self.service = service
    self.account = account
  }

  private var query: [CFString: Any] {
    [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account]
  }

  func data() throws -> Data? {
    var found: CFTypeRef?
    var asking = query
    asking[kSecReturnData] = true
    let status = SecItemCopyMatching(asking as CFDictionary, &found)
    if status == errSecItemNotFound {
      return nil
    }
    guard status == errSecSuccess, let data = found as? Data else {
      throw KeychainError(status: status)
    }
    return data
  }

  /// Updated in place, else added: never a moment with nothing kept.
  func replace(with data: Data) throws {
    let updated = SecItemUpdate(query as CFDictionary, [kSecValueData: data] as CFDictionary)
    if updated == errSecSuccess {
      return
    }
    guard updated == errSecItemNotFound else {
      throw KeychainError(status: updated)
    }
    var adding = query
    adding[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlock
    adding[kSecValueData] = data
    let added = SecItemAdd(adding as CFDictionary, nil)
    guard added == errSecSuccess else {
      throw KeychainError(status: added)
    }
  }

  func forget() throws {
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw KeychainError(status: status)
    }
  }
}

public struct KeychainError: Error {
  public let status: OSStatus
}

/// The sessions the device keeps: its own, and that of a user a switch
/// left behind, until that user is deleted (spec/sync-protocol.md,
/// Switching to an account in use).
struct SessionKeychain: Sendable {
  let own: TokenStore
  let leftBehind: TokenStore

  init(
    own: TokenStore = KeychainTokenStore(),
    leftBehind: TokenStore = KeychainTokenStore(account: "leftBehind")
  ) {
    self.own = own
    self.leftBehind = leftBehind
  }

  /// Nil when nothing is kept, or, until release (`erasesOnShapeChange`),
  /// when what is kept is not a session this app can read: the device
  /// signs in anew and keeping that session replaces it
  /// (spec/sync-protocol.md, Signing in). A Keychain it cannot reach, as
  /// before the first unlock, throws.
  func kept() throws -> StoredSession? {
    guard let data = try own.data() else { return nil }
    do {
      return try JSONDecoder().decode(StoredSession.self, from: data)
    } catch {
      guard erasesOnShapeChange else { throw error }
      Logger.account.notice("The kept session is unreadable, so the device signs in anew: \(error)")
      return nil
    }
  }

  /// Keeps `session` from now on, in place of any other.
  func keep(_ session: StoredSession) throws {
    try own.replace(with: JSONEncoder().encode(session))
  }

  func forget() throws {
    try own.forget()
  }

  func leftBehindToken() -> String? {
    (try? leftBehind.data()).flatMap { $0 }.map { String(decoding: $0, as: UTF8.self) }
  }

  func keepLeftBehind(_ token: String) throws {
    try leftBehind.replace(with: Data(token.utf8))
  }

  func forgetLeftBehind() {
    try? leftBehind.forget()
  }
}

/// What AccountSession asks the server, each on the session it names.
protocol AccountServer: Sendable {
  func signInAnonymously() async throws -> StoredSession
  func signInApple(idToken: String, nonce: String, on token: String) async throws
    -> StoredSession
  func signOut(_ token: String) async throws
  func linkApple(idToken: String, nonce: String, on token: String) async throws -> LinkResult
  /// Whose the session is, and whether they are still anonymous.
  func me(_ token: String) async throws -> (userID: String, anonymous: Bool)
  func deleteAccount(_ token: String, appleAuthorizationCode: String) async throws(DeletionFailure)
}

/// Why the account was not deleted, each for the app to say what to do
/// next (spec/sync-protocol.md, Deleting an account). Nothing was deleted
/// in any of them, or the deletion was cut off part way and finishes by
/// trying again.
public enum DeletionFailure: Error, Equatable, Sendable {
  /// The device has no session yet, as before its first sign-in reaches
  /// the server, or its account is changing.
  case notSignedIn
  /// The device signed out or started afresh while Apple was asked: the
  /// account asked for is not the device's any more, and the one it is
  /// now is left as it is.
  case accountChanged
  /// The server does not know the session (401): signed out or deleted
  /// on another device, or by request.
  case sessionEnded
  /// Sign in with Apple, asked once more for its code, failed (not the
  /// person canceling it).
  case appleUnconfirmed
  /// The server could not revoke Apple's tokens (FAILED_PRECONDITION): no
  /// code, or one Apple does not take or of another Apple account.
  case appleRefused
  /// The server was not reached: offline, or the connection dropped.
  case offline
  /// The server answered with an error of its own.
  case serverFailed

  /// What the server's answer says.
  init(_ error: ConnectError) {
    switch error.code {
    case .unauthenticated: self = .sessionEnded
    case .failedPrecondition: self = .appleRefused
    // No answer: a connection that was never made or dropped (URLSession's
    // error, which an HTTP 503 has none of), or the call timed out.
    case .unavailable where error.exception is URLError, .deadlineExceeded: self = .offline
    default: self = .serverFailed
    }
  }
}

/// The server's account calls: better-auth's (`/api/auth/*`), and
/// UserService's that say whose a session is and delete its user.
struct Account: AccountServer {
  typealias Send = @Sendable (URLRequest) async throws -> (Data, URLResponse)

  let server: URL
  let send: Send
  let users: Pochical_V1_UserServiceClient

  init(server: URL = Server.url, send: @escaping Send = { try await uncached.data(for: $0) }) {
    self.server = server
    self.send = send
    users = Pochical_V1_UserServiceClient(
      client: ProtocolClient(
        httpClient: URLSessionHTTPClient(configuration: uncachedConfiguration),
        config: ProtocolClientConfig(
          host: server.absoluteString, networkProtocol: .connect, codec: ProtoCodec())))
  }

  /// better-auth's anonymous sign-in, which answers 415 without the JSON
  /// type and body; the token comes back in `set-auth-token`, the user in
  /// the body. Its cookie is not kept: the app calls with the token alone.
  func signInAnonymously() async throws -> StoredSession {
    var request = authRequest("api/auth/sign-in/anonymous", token: nil)
    request.httpBody = Data("{}".utf8)
    return try await signedIn(by: request)
  }

  /// Signs in to the user the Apple account is linked to, with its ID token
  /// (better-auth's `/api/auth/sign-in/social`), on the session `token`.
  func signInApple(idToken: String, nonce: String, on token: String) async throws
    -> StoredSession
  {
    var request = authRequest("api/auth/sign-in/social", token: token)
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "idToken": ["nonce": nonce, "token": idToken], "provider": "apple",
    ])
    return try await signedIn(by: request)
  }

  /// Ends the session `token` on the server (better-auth's
  /// `/api/auth/sign-out`), its sockets with it.
  func signOut(_ token: String) async throws {
    var request = authRequest("api/auth/sign-out", token: token)
    request.httpBody = Data("{}".utf8)
    let (_, response) = try await send(request)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
      throw SignInError(status: (response as? HTTPURLResponse)?.statusCode)
    }
  }

  /// Links Sign in with Apple's account to the user of the session
  /// `token`, with its ID token and the nonce it was asked with
  /// (better-auth's `/api/auth/link-social`).
  func linkApple(idToken: String, nonce: String, on token: String) async throws -> LinkResult {
    var request = authRequest("api/auth/link-social", token: token)
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "idToken": ["nonce": nonce, "token": idToken], "provider": "apple",
    ])
    let (_, response) = try await send(request)
    switch (response as? HTTPURLResponse)?.statusCode {
    case 200: return .linked
    case 409: return .inUse
    case let status: throw LinkError(status: status)
    }
  }

  func me(_ token: String) async throws -> (userID: String, anonymous: Bool) {
    let me = try await users.getMe(request: Pochical_V1_GetMeRequest(), headers: bearer(token))
      .result.get()
    return (me.userID, me.anonymous)
  }

  /// Deletes the user of the session `token` and everything of theirs
  /// (spec/sync-protocol.md, Deleting an account), with Sign in with
  /// Apple's fresh authorization code when the user is linked to Apple.
  func deleteAccount(_ token: String, appleAuthorizationCode: String) async throws(DeletionFailure)
  {
    var request = Pochical_V1_DeleteAccountRequest()
    request.appleAuthorizationCode = appleAuthorizationCode
    let answer = await users.deleteAccount(request: request, headers: bearer(token))
    if case .failure(let error) = answer.result {
      throw DeletionFailure(error)
    }
  }

  private func bearer(_ token: String) -> [String: [String]] {
    ["Authorization": ["Bearer \(token)"]]
  }

  /// A POST to better-auth, as the session `token` when given. The token
  /// says who calls, not better-auth's cookie, which URLSession would keep
  /// and send: with a cookie and no Origin, better-auth takes the call for
  /// a browser's from another site and refuses it (403).
  private func authRequest(_ path: String, token: String?) -> URLRequest {
    var request = URLRequest(url: server.appending(path: path))
    request.httpMethod = "POST"
    request.httpShouldHandleCookies = false
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let token {
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
    return request
  }

  /// The session a sign-in answered with: its token in `set-auth-token`,
  /// its user's id in the body.
  private func signedIn(by request: URLRequest) async throws -> StoredSession {
    let (body, response) = try await send(request)
    let status = (response as? HTTPURLResponse)?.statusCode
    guard status == 200,
      let token = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "set-auth-token"),
      !token.isEmpty,
      let user = try? JSONDecoder().decode(SignedInBody.self, from: body).user
    else {
      throw SignInError(status: status)
    }
    return StoredSession(token: token, userID: user.id)
  }

  private struct SignedInBody: Decodable {
    struct User: Decodable {
      let id: String
    }
    let user: User
  }
}

/// What calls to the server go through: kept nowhere, as their answers are
/// the user's (a sign-in's carries the session's token), which the system's
/// URL cache would otherwise keep on the disk past the account.
var uncachedConfiguration: URLSessionConfiguration {
  let configuration = URLSessionConfiguration.default
  configuration.urlCache = nil
  configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
  return configuration
}

private let uncached = URLSession(configuration: uncachedConfiguration)

/// Signing in was refused or answered without a session; `status` is the
/// HTTP status, as 429 when too many sign-ins came from one address.
public struct SignInError: Error {
  public let status: Int?
}
