import CryptoKit
import Foundation
import PochicalProto

/// The account the user is linked to (spec/sync-protocol.md, Signing in),
/// as 設定's アカウント shows it: the server says whether the user is
/// linked; the email is the provider's, read from its ID token as the
/// person signs in and kept on this device alone, as the server keeps none.
public struct LinkedAccount: Codable, Equatable, Sendable {
  /// Where the person signs in besides anonymously, its raw value
  /// better-auth's id for it.
  public enum Provider: String, Codable, Sendable {
    case apple, google

    /// As the person sees it, in the app's words.
    public var name: String {
      switch self {
      case .apple: "Apple"
      case .google: "Google"
      }
    }

    init?(_ proto: Pochical_V1_SignInProvider) {
      switch proto {
      case .apple: self = .apple
      case .google: self = .google
      case .unspecified, .UNRECOGNIZED: return nil
      }
    }

    var proto: Pochical_V1_SignInProvider {
      switch self {
      case .apple: .apple
      case .google: .google
      }
    }
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

/// A nonce for signing in: Apple puts its SHA-256 in the ID token, Google
/// the nonce itself, and the server, given the nonce, checks either, so a
/// token taken from elsewhere is not sent again.
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

/// A provider's ID token as signing in got it, with the nonce it was asked
/// with: what proves the person holds the provider's account, to link it,
/// sign in to its user or switch to it (spec/sync-protocol.md, Signing in).
public struct ProviderToken: Sendable, Equatable {
  public let provider: LinkedAccount.Provider
  public let idToken: String
  public let nonce: String

  public init(provider: LinkedAccount.Provider, idToken: String, nonce: String) {
    self.provider = provider
    self.idToken = idToken
    self.nonce = nonce
  }

  /// The account as this device keeps it, its email read from the token.
  public var account: LinkedAccount {
    LinkedAccount(provider: provider, email: LinkedAccount.email(in: idToken))
  }

  /// As better-auth's `/link-social` and `/sign-in/social` take it.
  func socialBody() throws -> Data {
    try JSONSerialization.data(withJSONObject: [
      "idToken": ["nonce": nonce, "token": idToken], "provider": provider.rawValue,
    ])
  }

  var proto: Pochical_V1_ProviderToken {
    var token = Pochical_V1_ProviderToken()
    token.provider = provider.proto
    token.idToken = idToken
    token.nonce = nonce
    return token
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
