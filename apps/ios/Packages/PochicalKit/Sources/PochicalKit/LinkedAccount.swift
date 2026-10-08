import CryptoKit
import Foundation
import PochicalProto

/// The account the user is linked to (spec/sync-protocol.md, Signing in),
/// as 設定's アカウント shows it: the server says whether the user is
/// linked; the email is the provider's, read from its ID token as the
/// person signs in and kept on this device alone, as the server keeps none.
public struct LinkedAccount: Codable, Equatable, Sendable {
  public enum Provider: String, Codable, Sendable {
    case apple
  }

  public var provider: Provider
  public var email: String?

  public init(provider: Provider, email: String?) {
    self.provider = provider
    self.email = email
  }

  private static let key = "linkedAccount"

  /// What this device last knew; nil while anonymous.
  public static var kept: LinkedAccount? {
    guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(LinkedAccount.self, from: data)
  }

  public static func keep(_ account: LinkedAccount?) {
    let store = UserDefaults(suiteName: appGroup)
    if let account, let data = try? JSONEncoder().encode(account) {
      store?.set(data, forKey: key)
    } else {
      store?.removeObject(forKey: key)
    }
  }

  /// The email an ID token carries, if it does.
  public static func email(in idToken: String) -> String? {
    let parts = idToken.split(separator: ".")
    guard parts.count == 3 else { return nil }
    var body = parts[1].replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    body += String(repeating: "=", count: (4 - body.count % 4) % 4)
    guard let data = Data(base64Encoded: body),
      let claims = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    return claims["email"] as? String
  }
}

/// A nonce for Sign in with Apple: Apple puts its SHA-256 in the ID token,
/// and the server, given the nonce itself, checks it, so a token taken
/// from elsewhere is not sent again.
public struct SignInNonce: Sendable {
  public let raw: String

  public init() {
    raw = (0..<32).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
  }

  /// What Apple is asked to put in the token.
  public var hashed: String {
    SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
  }
}

/// What linking a provider's account said.
public enum LinkResult: Sendable, Equatable {
  /// Linked: the user stays, no longer anonymous.
  case linked
  /// The provider's account is another user's already, as from another
  /// phone (spec/sync-protocol.md, Switching to an account in use).
  case inUse
}

/// Linking was refused for another reason; `status` is the HTTP status.
public struct LinkError: Error {
  public let status: Int?
}

extension Account {
  /// Links Sign in with Apple's account to the signed-in user, with its ID
  /// token and the nonce it was asked with (better-auth's
  /// `/api/auth/link-social`).
  public func linkApple(idToken: String, nonce: String) async throws -> LinkResult {
    var request = URLRequest(url: server.appending(path: "api/auth/link-social"))
    request.httpMethod = "POST"
    // The token says who calls, not better-auth's cookie, which URLSession
    // would keep and send: with a cookie and no Origin, better-auth takes
    // the call for a browser's from another site and refuses it (403).
    request.httpShouldHandleCookies = false
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(try await token())", forHTTPHeaderField: "Authorization")
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
}

extension GroupCalls {
  /// Whether the signed-in user is linked to Apple or Google, as the server
  /// says; nil when it cannot be asked now.
  public func linked() async -> Bool? {
    let answer = await users.getMe(
      request: Pochical_V1_GetMeRequest(), headers: (try? await account.headers()) ?? [:])
    guard case .success(let me) = answer.result else { return nil }
    return !me.anonymous
  }
}
