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
  /// What a call can have now.
  private enum Access {
    /// Signing in (a first launch, or after signing out or deleting): a
    /// call waits for it.
    case signingIn
    case signedIn(Credentials)
    /// The account changing or its data being erased: no credentials come
    /// meanwhile, so a call fails at once.
    case closed
  }

  private struct Now {
    var generation = 0
    var access = Access.signingIn
    /// Calls waiting for the device to be signed in.
    var waiting: [UUID: CheckedContinuation<Credentials, any Error>] = [:]

    var credentials: Credentials? {
      if case .signedIn(let credentials) = access { credentials } else { nil }
    }

    /// The waiting calls, let go of.
    mutating func takeWaiting() -> [CheckedContinuation<Credentials, any Error>] {
      defer { waiting = [:] }
      return Array(waiting.values)
    }
  }

  private let now = Mutex(Now())

  /// How long a call waits for the device to be signed in, as at a first
  /// launch or just after signing out, before it fails as one offline does.
  static let signInWait = Duration.seconds(15)

  public init() {}

  func credentials() throws(NotSignedIn) -> Credentials {
    guard let credentials = now.withLock(\.credentials) else { throw NotSignedIn() }
    return credentials
  }

  /// The credentials once the device is signed in: at once if it is; while
  /// it is signing in, as soon as it is, for `limit` at most, or until the
  /// task is cancelled; and never while the account is changing or being
  /// erased. A call never goes as no one.
  func signedIn(within limit: Duration = signInWait) async throws -> Credentials {
    let id = UUID()
    let timer = Task { [weak self] in
      try await Task.sleep(for: limit)
      self?.stopWaiting(id, with: NotSignedIn())
    }
    defer { timer.cancel() }
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        let access = now.withLock { now in
          if case .signingIn = now.access { now.waiting[id] = continuation }
          return now.access
        }
        switch access {
        case .signedIn(let credentials): continuation.resume(returning: credentials)
        case .closed: continuation.resume(throwing: NotSignedIn())
        case .signingIn:
          // Cancelled before it began waiting, when onCancel found nothing.
          if Task.isCancelled { stopWaiting(id, with: CancellationError()) }
        }
      }
    } onCancel: {
      stopWaiting(id, with: CancellationError())
    }
  }

  private func stopWaiting(_ id: UUID, with error: any Error) {
    now.withLock { $0.waiting.removeValue(forKey: id) }?.resume(throwing: error)
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

  /// A new stretch, signed in as `session`, or none for nil, closed while
  /// the account changes or is erased: what the one before handed out is
  /// no longer current, and the calls waiting get the new credentials, or
  /// fail.
  @discardableResult
  func begin(_ session: StoredSession?) -> Credentials? {
    let (credentials, waiting) = now.withLock { now in
      now.generation += 1
      if let session {
        now.access = .signedIn(
          Credentials(
            generation: now.generation, token: session.token, userID: session.userID,
            content: Self.contentSession(), current: self))
      } else {
        now.access = .closed
      }
      return (now.credentials, now.takeWaiting())
    }
    for continuation in waiting {
      if let credentials {
        continuation.resume(returning: credentials)
      } else {
        continuation.resume(throwing: NotSignedIn())
      }
    }
    return credentials
  }

  /// Signing in afresh, as after the erasing: calls wait for it again.
  func signingIn() {
    now.withLock { $0.access = .signingIn }
  }

  /// No cache: a stretch's photos are kept as the app's own files, erased
  /// with the account, and the system's cache would keep another copy of
  /// them beyond it.
  private static func contentSession() -> URLSession {
    URLSession(configuration: uncachedConfiguration)
  }
}
