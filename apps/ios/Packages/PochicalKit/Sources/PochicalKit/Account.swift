import Foundation
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

/// Where the session token is kept.
public protocol TokenStore: Sendable {
  func token() throws -> String?
  func keep(_ token: String) throws
}

/// The session token in the Keychain, which outlives the app, so a
/// reinstall comes back as the same user, and goes with the phone's
/// encrypted backups and Quick Start, so a new phone does too
/// (spec/sync-protocol.md, Signing in). Not synced through iCloud
/// Keychain: the person's other devices come in by linking Apple or
/// Google. Readable after the phone's first unlock, as the app syncs in
/// the background.
public struct KeychainTokenStore: TokenStore {
  private let service = "app.pochical.session"
  private let account = "token"

  public init() {}

  public func token() throws -> String? {
    var found: CFTypeRef?
    let status = SecItemCopyMatching(
      [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account,
        kSecReturnData: true,
      ] as CFDictionary, &found)
    if status == errSecItemNotFound {
      return nil
    }
    guard status == errSecSuccess, let data = found as? Data else {
      throw KeychainError(status: status)
    }
    return String(decoding: data, as: UTF8.self)
  }

  public func keep(_ token: String) throws {
    let status = SecItemAdd(
      [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account,
        kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlock,
        kSecValueData: Data(token.utf8),
      ] as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw KeychainError(status: status)
    }
  }
}

public struct KeychainError: Error {
  public let status: OSStatus
}

/// The signed-in user's session. Every user is signed in from the first
/// launch, anonymously at first; the token is kept and sent as
/// `Authorization: Bearer …` on every call and socket. A kept token is
/// never replaced by a new sign-in, which would be a new user without
/// their data (spec/sync-protocol.md, Reconnecting).
public actor Account {
  public typealias Send = @Sendable (URLRequest) async throws -> (Data, URLResponse)

  let server: URL
  private let store: TokenStore
  let send: Send
  /// A sign-in under way, which callers at the same time wait on rather
  /// than each making a user.
  private var signingIn: Task<String, Error>?

  public init(
    server: URL = Server.url, store: TokenStore = KeychainTokenStore(),
    send: @escaping Send = { try await URLSession.shared.data(for: $0) }
  ) {
    self.server = server
    self.store = store
    self.send = send
  }

  /// The kept token, or one from signing in anonymously now.
  public func token() async throws -> String {
    if let kept = try store.token() {
      return kept
    }
    if let signingIn {
      return try await signingIn.value
    }
    let signing = Task { try await signInAnonymously() }
    signingIn = signing
    defer { signingIn = nil }
    let token = try await signing.value
    try store.keep(token)
    return token
  }

  /// The headers that say who is calling, as Connect's calls and the
  /// sockets take them.
  public func headers() async throws -> [String: [String]] {
    ["Authorization": ["Bearer \(try await token())"]]
  }

  /// better-auth's anonymous sign-in, which answers 415 without the JSON
  /// type and body; the token comes back in `set-auth-token`.
  private func signInAnonymously() async throws -> String {
    var request = URLRequest(url: server.appending(path: "api/auth/sign-in/anonymous"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = Data("{}".utf8)
    let (_, response) = try await send(request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200,
      let token = http.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty
    else {
      throw SignInError(status: (response as? HTTPURLResponse)?.statusCode)
    }
    return token
  }
}

/// Signing in was refused or answered without a token; `status` is the
/// HTTP status, as 429 when too many sign-ins came from one address.
public struct SignInError: Error {
  public let status: Int?
}
