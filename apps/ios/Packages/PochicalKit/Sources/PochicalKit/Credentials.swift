import Foundation
import Synchronization

/// Who the device's calls and sockets go as for one stretch of
/// AccountSession's: from the moment it is signed in as someone until the
/// account next changes, `generation` counting the stretches. Only
/// AccountSession makes them, so nothing else can start a socket or call
/// the server as anyone; and what a stretch brought back once it has ended
/// (an answer, an upload, a socket's frame) is dropped, as the account it
/// was for is not the device's any more.
struct Credentials: Sendable {
  let generation: Int
  let token: String
  let userID: String
  /// What the stretch fetches through, cancelled as it ends, keeping
  /// nothing of its own: the app's caches are its own files, erased with
  /// the account.
  let content: URLSession
  let current: CurrentAccount

  var isCurrent: Bool {
    current.isCurrent(generation)
  }

  var headers: [String: [String]] {
    ["Authorization": ["Bearer \(token)"]]
  }

  /// Runs `body` only while the stretch is current, the account changing
  /// waiting until it has run: for writing what an answer brought where
  /// erasing the account would find it.
  func whileCurrent<T>(_ body: () throws -> T) throws -> T {
    try current.whileCurrent(generation, body)
  }
}

/// The device has no session now: it is signing in, or its account is
/// changing.
public struct NotSignedIn: Error {}

/// The account changed while an answer was on its way.
struct AccountChanged: Error {}

/// The credentials current now, read from any thread: the part of
/// AccountSession the calls and sockets hold.
public final class CurrentAccount: Sendable {
  private struct Now {
    var generation = 0
    var credentials: Credentials?
  }

  private let now = Mutex(Now())

  public init() {}

  func credentials() throws(NotSignedIn) -> Credentials {
    guard let credentials = now.withLock(\.credentials) else { throw NotSignedIn() }
    return credentials
  }

  func isCurrent(_ generation: Int) -> Bool {
    now.withLock { $0.generation == generation }
  }

  func whileCurrent<T>(_ generation: Int, _ body: () throws -> T) throws -> T {
    try now.withLock { now in
      guard now.generation == generation else { throw AccountChanged() }
      return try body()
    }
  }

  /// A new stretch, signed in as `session`, or none for nil: what the one
  /// before handed out is no longer current.
  @discardableResult
  func begin(_ session: StoredSession?) -> Credentials? {
    now.withLock { now in
      now.generation += 1
      now.credentials = session.map {
        Credentials(
          generation: now.generation, token: $0.token, userID: $0.userID,
          content: Self.contentSession(), current: self)
      }
      return now.credentials
    }
  }

  /// No cache: a stretch's photos are kept as the app's own files, erased
  /// with the account, and the system's cache would keep another copy of
  /// them beyond it.
  private static func contentSession() -> URLSession {
    URLSession(configuration: uncachedConfiguration)
  }
}
