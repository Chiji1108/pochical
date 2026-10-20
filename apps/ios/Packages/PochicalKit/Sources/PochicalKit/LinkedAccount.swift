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
