import Foundation
import Network
import OSLog
import PochicalDesign
import PochicalProto
import SQLiteData

/// The socket to the user's own DO (spec/sync-protocol.md, Sockets): open
/// while the app is in the foreground, it says Hello with the device's
/// cursor, corrects the device's time by Welcome, and takes the catch-up
/// and every change after it into the database. It keeps the socket alive
/// and reconnects after a random wait that doubles with each failed try,
/// at once when the network comes back; never after a 401 or an update the
/// server asks for.
public actor SyncClient {
  /// Why it stopped trying, for good until the app is signed in again or
  /// updated.
  public enum Stop: Error, Sendable {
    /// The server does not know the session: the user signed out or their
    /// account was deleted elsewhere. Nothing is cleared and no new user
    /// is made (Reconnecting).
    case signedOut
    /// The server needs a newer app.
    case protocolTooOld
  }

  /// The socket protocol this build speaks (apps/server/src/protocol.ts).
  static let protocolVersion: UInt32 = 1

  private let account: Account
  private let database: any DatabaseWriter
  private let socketURL: URL
  private let session = URLSession(configuration: .default)
  private let paths = NWPathMonitor()
  private var running: Task<Void, Never>?
  /// The socket open or opening, closed by `stop` at once rather than
  /// left to notice its task's cancellation.
  private var socket: URLSessionWebSocketTask?
  /// Tries since the last Welcome.
  private var tries = 0
  private var connected = false
  /// When the server last answered the keepalive.
  private var lastReplyMs: Int64 = 0
  public private(set) var stopped: Stop?

  public init(account: Account, database: any DatabaseWriter, server: URL = Server.url) {
    self.account = account
    self.database = database
    var socket = URLComponents(url: server, resolvingAgainstBaseURL: false)!
    socket.scheme = server.scheme == "https" ? "wss" : "ws"
    socket.path = "/v1/me/socket"
    socketURL = socket.url!
  }

  /// Connects, or tries again at once with the count started again, as the
  /// person is waiting: the app came to the foreground. An open socket
  /// stays.
  public func start() {
    guard stopped == nil, !(running != nil && connected) else { return }
    running?.cancel()
    tries = 0
    running = Task { await run() }
    paths.pathUpdateHandler = { [weak self] path in
      guard path.status == .satisfied, let self else { return }
      Task { await self.networkCameBack() }
    }
    if paths.queue == nil {
      paths.start(queue: DispatchQueue(label: "app.pochical.sync.paths"))
    }
  }

  /// Closes the socket: the app went to the background.
  public func stop() {
    running?.cancel()
    running = nil
    socket?.cancel(with: .goingAway, reason: nil)
    socket = nil
    connected = false
  }

  private func networkCameBack() {
    if running != nil, !connected {
      start()
    }
  }

  private func run() async {
    while !Task.isCancelled {
      if tries > 0 {
        let most = reconnectWaitMost(
          tries: tries, firstMs: SyncSocket.reconnectFirstMs, mostMs: SyncSocket.reconnectMostMs)
        try? await Task.sleep(for: .milliseconds(Int.random(in: 0...most)))
        if Task.isCancelled { return }
      }
      tries += 1
      connected = false
      do {
        try await connect()
      } catch let stop as Stop {
        stopped = stop
        Logger.sync.error("Stopped syncing: \(String(describing: stop))")
        return
      } catch is ClockAhead {
        // Reconnected at once; the outbox's clocks are put right then.
        tries = 0
      } catch is CancellationError {
        return
      } catch {
        Logger.sync.info("Socket closed: \(error)")
      }
    }
  }

  private func connect() async throws {
    var request = URLRequest(url: socketURL)
    for (name, values) in try await account.headers() {
      request.setValue(values.joined(separator: ","), forHTTPHeaderField: name)
    }
    let socket = session.webSocketTask(with: request)
    self.socket = socket
    socket.resume()
    defer { socket.cancel(with: .goingAway, reason: nil) }
    var hello = Pochical_V1_Hello()
    hello.protocolVersion = Self.protocolVersion
    hello.cursor = try await database.read { try Sync.cursor(in: $0) }
    var frame = Pochical_V1_ClientFrame()
    frame.hello = hello
    let sentMs = Self.nowMs()
    do {
      try await socket.send(.data(frame.serializedData()))
    } catch {
      throw Self.refusal(of: socket) ?? error
    }
    lastReplyMs = sentMs
    let keepalive = Task { await keepAlive(socket) }
    defer { keepalive.cancel() }
    while true {
      let message: URLSessionWebSocketTask.Message
      do {
        message = try await socket.receive()
      } catch {
        throw Self.refusal(of: socket) ?? error
      }
      switch message {
      case .string(SyncSocket.keepaliveReply):
        lastReplyMs = Self.nowMs()
      case .data(let data):
        try await take(Pochical_V1_ServerFrame(serializedBytes: data), sentMs: sentMs)
      default:
        break
      }
    }
  }

  private func take(_ frame: Pochical_V1_ServerFrame, sentMs: Int64) async throws {
    switch frame.kind {
    case .welcome(let welcome):
      tries = 0
      connected = true
      let receivedMs = Self.nowMs()
      try await database.write { db in
        try Sync.welcome(
          sentMs: sentMs, receivedMs: receivedMs, serverMs: welcome.serverMs, in: db)
      }
      Logger.sync.info("Welcome at cursor \(welcome.cursor)")
    case .changes(let changes):
      try await database.write { db in try Sync.take(changes.changes, in: db) }
      Logger.sync.info("Took \(changes.changes.count) changes")
    case .reset:
      try await database.write { db in try Sync.reset(in: db) }
    case .acked(let acked):
      try await database.write { db in try OwnValues.acknowledge(acked.opIds, in: db) }
    case .error(let error):
      switch error.code {
      case .protocolTooOld: throw Stop.protocolTooOld
      case .clockAhead: throw ClockAhead()
      default: throw ServerRefused(code: error.code, message: error.message)
      }
    case .pong, nil:
      break
    }
  }

  /// Sends the keepalive text every so often, and takes the socket for
  /// dead when no answer comes in time (Keepalive).
  private func keepAlive(_ socket: URLSessionWebSocketTask) async {
    while !Task.isCancelled {
      try? await Task.sleep(for: .milliseconds(SyncSocket.keepaliveEveryMs))
      let askedMs = Self.nowMs()
      try? await socket.send(.string(SyncSocket.keepaliveText))
      try? await Task.sleep(for: .milliseconds(SyncSocket.keepaliveWithinMs))
      if Task.isCancelled { return }
      if lastReplyMs < askedMs {
        socket.cancel(with: .goingAway, reason: nil)
        return
      }
    }
  }

  /// Why the server would not open the socket, when it said.
  private static func refusal(of socket: URLSessionWebSocketTask) -> Stop? {
    (socket.response as? HTTPURLResponse)?.statusCode == 401 ? .signedOut : nil
  }

  private static func nowMs() -> Int64 {
    Int64(Date.now.timeIntervalSince1970 * 1000)
  }
}

/// The server refused a frame's clocks as far ahead (HLC).
struct ClockAhead: Error {}

/// The server closed the socket with an error other than those above.
struct ServerRefused: Error {
  let code: Pochical_V1_ServerError.Code
  let message: String
}

extension Logger {
  static let sync = Logger(subsystem: "app.pochical", category: "sync")
}
