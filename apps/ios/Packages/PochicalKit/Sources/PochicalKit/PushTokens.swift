import Foundation
import OSLog

/// Keeps the server told of the device's APNs token (spec/sync-protocol.md,
/// Push): sent under each user the device goes on as, and again whenever
/// iOS gives a new one, while notifications are allowed. One the server
/// did not take is logged and sent again as the app next comes to the
/// front. A send for a user, token or permission gone is cancelled, so one
/// slower than the next never lands after it. Signing out and deleting the
/// account need nothing here: the server drops a session's tokens with it.
/// Android's PushTokens is the same.
@MainActor public final class PushTokens {
  private let register: @Sendable (Data) async throws -> Void
  private var user: String?
  private var token: Data?
  private var allowed = false
  private var failed = false
  private var sending: Task<Void, Never>?

  /// `register` sends the token under the session the device has now.
  public init(register: @escaping @Sendable (Data) async throws -> Void) {
    self.register = register
  }

  /// Whether iOS has given a token yet.
  public var hasToken: Bool { token != nil }

  /// The user the device is signed in as, nil while it is no one or
  /// changing.
  public func user(_ id: String?) {
    guard id != user else { return }
    user = id
    send()
  }

  /// The token iOS gives, at launch or anew.
  public func took(_ token: Data) {
    guard token != self.token else { return }
    self.token = token
    send()
  }

  /// Whether the system lets the app notify, as it says now.
  public func allowed(_ now: Bool) {
    guard now != allowed else { return }
    allowed = now
    send()
  }

  /// The app came to the front: a token the server did not take goes
  /// again.
  public func foreground() {
    if failed { send() }
  }

  /// Waits for the send under way, if any: for tests.
  func settled() async {
    await sending?.value
  }

  private func send() {
    sending?.cancel()
    sending = nil
    failed = false
    guard user != nil, allowed, let token else { return }
    let register = register
    sending = Task {
      do {
        try await register(token)
      } catch {
        guard !Task.isCancelled else { return }
        failed = true
        // Nothing personal is in it: the token is not, and the server says
        // only why it refused.
        Logger.notifications.error(
          "The push token was not taken, sent again in the foreground: \(error, privacy: .public)")
      }
    }
  }
}

extension Logger {
  /// The push token iOS or the server did not take.
  public static let notifications = Logger(subsystem: "app.pochical", category: "notifications")
}
