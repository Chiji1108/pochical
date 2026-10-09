import Foundation
import GRDB
import Network
import OSLog
import PochicalDesign
import PochicalProto
import SQLiteData

/// A socket to one of the server's DOs (spec/sync-protocol.md, Sockets).
/// The user's own, open while the app is in the foreground, says Hello
/// with the device's cursor, corrects the device's time by Welcome, takes
/// the catch-up and every change after it into the database, and sends the
/// outbox's edits as they come, which the server's Acked then ends
/// (Outbox). A group's, open while the group is on screen, takes the
/// group's values the same way and sends nothing. Each keeps its socket
/// alive and reconnects after a random wait that doubles with each failed
/// try, at once when the network comes back; never after a 401 or an
/// update the server asks for.
public actor SyncClient {
  /// Whose DO the socket reaches.
  public enum Peer: Sendable, Equatable {
    case user
    case group(String)
  }

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

  /// How many times a photo is tried before its line is marked unsent:
  /// waits of 1, 2, 4 and 8 seconds between.
  static let photoTries = 5

  /// The socket protocol this build speaks (apps/server/src/protocol.ts).
  static let protocolVersion: UInt32 = 1

  private let account: Account
  private let database: any DatabaseWriter
  private let peer: Peer
  private let server: URL
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
  /// The server refused a frame's clocks: the outbox takes new ones once
  /// the next Welcome has corrected the device's time.
  private var clockWasAhead = false
  /// Sending the outbox on the socket open, from its Welcome.
  private var sending: Task<Void, Never>?
  /// Waiting for the outbox to empty before closing, in the background.
  private var finishing: Task<Void, Never>?
  public private(set) var stopped: Stop?
  /// Everything the DO had for this device at Welcome has been taken: the
  /// Pong to the Ping sent after it has come (Keepalive).
  private var caughtUp = false
  /// The nonce of that Ping.
  private var catchUpNonce: UInt32 = 0
  /// Screens waiting for the catch-up, each for a while at most.
  private var catchUpWaiters: [UUID: CheckedContinuation<Void, Never>] = [:]
  /// The screens told of others' typing, as it comes; never kept.
  private var typingWatchers: [UUID: AsyncStream<Pochical_V1_Typing>.Continuation] = [:]

  public init(
    account: Account, database: any DatabaseWriter, peer: Peer = .user, server: URL = Server.url
  ) {
    self.account = account
    self.database = database
    self.peer = peer
    self.server = server
    var socket = URLComponents(url: server, resolvingAgainstBaseURL: false)!
    socket.scheme = server.scheme == "https" ? "wss" : "ws"
    switch peer {
    case .user: socket.path = "/v1/me/socket"
    case .group(let groupID): socket.path = "/v1/groups/\(groupID)/socket"
    }
    socketURL = socket.url!
  }

  // A group's client goes with its screen; its watch on the network goes
  // with it.
  deinit {
    paths.cancel()
  }

  /// Connects, or tries again at once with the count started again, as the
  /// person is waiting: the app came to the foreground. An open socket
  /// stays.
  public func start() {
    finishing?.cancel()
    finishing = nil
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

  /// Connects as whoever the account is now, after it changed: stopped
  /// for good before (a 401) or not.
  public func startAfresh() {
    stop()
    stopped = nil
    start()
  }

  /// Closes the socket: the app went to the background.
  public func stop() {
    finishing?.cancel()
    finishing = nil
    running?.cancel()
    running = nil
    socket?.cancel(with: .goingAway, reason: nil)
    socket = nil
    connected = false
    // What the next socket brings is not taken yet, as when switching to
    // another user.
    caughtUp = false
  }

  /// Going to the background: the socket stays until the outbox is sent
  /// and acknowledged, or `stop` (the time the OS gave runs out), so an
  /// edit made just before reaches the user's other devices and groups
  /// without waiting for the app to be opened again (Sockets).
  public func finishSending() async {
    let waiting = (try? await database.read { try Sync.lastWaiting(in: $0) }) ?? nil
    guard waiting != nil, stopped == nil else {
      stop()
      return
    }
    if running == nil {
      start()
    }
    let emptied = Task { [database] in
      let outbox = ValueObservation.tracking { try Sync.lastWaiting(in: $0) }
      do {
        for try await last in outbox.values(in: database) where last == nil {
          return
        }
      } catch {}
    }
    finishing = emptied
    await emptied.value
    // Not stopped or brought back meanwhile.
    if finishing == emptied {
      stop()
    }
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
      caughtUp = false
      do {
        try await connect()
      } catch let stop as Stop {
        stopped = stop
        Logger.sync.error("Stopped syncing: \(String(describing: stop))")
        return
      } catch is ClockAhead {
        // Reconnected at once; the outbox's clocks are put right then.
        tries = 0
        clockWasAhead = true
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
    hello.cursor = try await database.read { [peer] db in
      switch peer {
      case .user: try Sync.cursor(in: db)
      case .group(let groupID): try GroupSync.cursor(of: groupID, in: db)
      }
    }
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
    defer {
      keepalive.cancel()
      sending?.cancel()
      sending = nil
    }
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
      askCaughtUp()
      // A group's socket sends its chat outbox; the user's corrects the
      // time and sends theirs.
      guard peer == .user else {
        sending?.cancel()
        if let socket, case .group(let groupID) = peer {
          sending = Task { await sendChatOutbox(of: groupID, on: socket) }
        }
        return
      }
      let receivedMs = Self.nowMs()
      try await database.write { db in
        try Sync.welcome(
          sentMs: sentMs, receivedMs: receivedMs, serverMs: welcome.serverMs, in: db)
      }
      Logger.sync.info("Welcome at cursor \(welcome.cursor)")
      if clockWasAhead {
        let now = Self.nowMs()
        try await database.write { db in try Sync.restamp(now: now, in: db) }
        clockWasAhead = false
      }
      sending?.cancel()
      if let socket {
        sending = Task { await sendOutbox(socket) }
      }
    case .changes(let changes):
      try await database.write { [peer] db in
        switch peer {
        case .user: try Sync.take(changes.changes, in: db)
        case .group(let groupID): try GroupSync.take(changes.changes, of: groupID, in: db)
        }
      }
      Logger.sync.info("Took \(changes.changes.count) changes")
    case .reset:
      try await database.write { [peer] db in
        switch peer {
        case .user: try Sync.reset(in: db)
        case .group(let groupID): try GroupSync.reset(groupID, in: db)
        }
      }
    case .acked(let acked):
      try await database.write { [peer] db in
        switch peer {
        case .user: try OwnValues.acknowledge(acked.opIds, in: db)
        case .group: try Chats.acknowledge(acked.opIds, in: db)
        }
      }
      Logger.sync.info("\(acked.opIds.count) edits acknowledged")
    case .error(let error):
      switch error.code {
      case .protocolTooOld: throw Stop.protocolTooOld
      case .clockAhead: throw ClockAhead()
      default: throw ServerRefused(code: error.code, message: error.message)
      }
    case .chatPage(let page):
      if case .group(let groupID) = peer {
        try await database.write { db in try Chats.take(page, of: groupID, in: db) }
      }
    case .typing(let typing):
      for watcher in typingWatchers.values {
        watcher.yield(typing)
      }
    case .supportAnswered:
      NotificationCenter.default.post(name: SupportLine.answered, object: nil)
    case .pong(let pong):
      if pong.nonce == catchUpNonce {
        caughtUp = true
        for waiter in catchUpWaiters.values {
          waiter.resume()
        }
        catchUpWaiters = [:]
      }
    case nil:
      break
    }
  }

  /// Sends the outbox's edits in order, all of them on a new socket and
  /// then each as it is written; an edit is sent again only on the next
  /// socket, until its Acked takes it out.
  private func sendOutbox(_ socket: URLSessionWebSocketTask) async {
    var sent = 0
    let outbox = ValueObservation.tracking { try Sync.lastWaiting(in: $0) }
    do {
      for try await last in outbox.values(in: database) {
        guard let last, last > sent else { continue }
        let (frames, through) = try await database.read { [sent] db in
          try Sync.frames(after: sent, in: db)
        }
        for frame in frames {
          try await socket.send(.data(frame.serializedData()))
        }
        sent = through
      }
    } catch {
      // The socket closed; the next one sends them all again.
    }
  }

  /// Sends the Ping whose Pong says the catch-up has all arrived.
  private func askCaughtUp() {
    caughtUp = false
    catchUpNonce &+= 1
    var frame = Pochical_V1_ClientFrame()
    frame.ping.nonce = catchUpNonce
    guard let socket, let data = try? frame.serializedData() else { return }
    Task { try? await socket.send(.data(data)) }
  }

  /// Waits until what the DO had at Welcome has been taken, or `limit`
  /// has passed, as when there is no connection: a chat opening on its
  /// unread lines knows them all then.
  public func catchUp(within limit: Duration) async {
    guard !caughtUp else { return }
    let id = UUID()
    await withCheckedContinuation { continuation in
      catchUpWaiters[id] = continuation
      Task { [weak self] in
        try? await Task.sleep(for: limit)
        await self?.stopWaitingForCatchUp(id)
      }
    }
  }

  private func stopWaitingForCatchUp(_ id: UUID) {
    catchUpWaiters.removeValue(forKey: id)?.resume()
  }

  /// Others' typing in the group's chats as it comes (spec/sync-protocol.md,
  /// Typing), until the stream is let go.
  public func typing() -> AsyncStream<Pochical_V1_Typing> {
    let (stream, continuation) = AsyncStream<Pochical_V1_Typing>.makeStream()
    let id = UUID()
    typingWatchers[id] = continuation
    continuation.onTermination = { [weak self] _ in
      Task { await self?.stopWatchingTyping(id) }
    }
    return stream
  }

  private func stopWatchingTyping(_ id: UUID) {
    typingWatchers[id] = nil
  }

  /// Says the member is writing in a chat, or stopped, when the socket is
  /// open; nothing waits to be sent again, as typing is only now.
  public func sendTyping(in threadID: String, on: Bool) async {
    guard connected, let socket else { return }
    var frame = Pochical_V1_ClientFrame()
    frame.typing.threadID = threadID
    frame.typing.on = on
    try? await socket.send(.data(frame.serializedData()))
  }

  /// Asks the group for a page of a chat's lines before `seq` (the latest
  /// with 0), when its socket is open; the page comes into the database.
  /// False when it could not be asked.
  @discardableResult
  public func requestPage(of threadID: String, before seq: Int64) async -> Bool {
    guard connected, let socket else { return false }
    var frame = Pochical_V1_ClientFrame()
    frame.chatPageRequest.threadID = threadID
    frame.chatPageRequest.beforeSeq = UInt64(max(seq, 0))
    do {
      try await socket.send(.data(frame.serializedData()))
      return true
    } catch {
      return false
    }
  }

  /// Sends the group's chat outbox as `sendOutbox` does the user's, a
  /// photo's line only once the photo is uploaded, so the edits after it
  /// wait their turn.
  private func sendChatOutbox(of groupID: String, on socket: URLSessionWebSocketTask) async {
    var sent = 0
    let outbox = ValueObservation.tracking { try Chats.lastWaiting(of: groupID, in: $0) }
    do {
      for try await last in outbox.values(in: database) {
        guard let last, last > sent else { continue }
        let (frames, through) = try await database.read { [sent] db in
          try Chats.frames(of: groupID, after: sent, in: db)
        }
        for var frame in frames {
          frame.chatEdits.edits = try await uploadingPhotos(of: frame.chatEdits.edits, in: groupID)
          try await socket.send(.data(frame.serializedData()))
        }
        sent = through
      }
    } catch {
      // The socket closed; the next one sends them all again.
    }
  }

  /// The edits once their photos are uploaded, trying again after a wait
  /// that doubles, `photoTries` times in all; a photo that cannot go
  /// (gone from the device, refused, or failing every try) leaves its line
  /// waiting, marked, for the member to send again or delete, and the
  /// edits after it go on.
  private func uploadingPhotos(of edits: [Pochical_V1_ChatEdit], in groupID: String)
    async throws -> [Pochical_V1_ChatEdit]
  {
    var kept: [Pochical_V1_ChatEdit] = []
    for edit in edits {
      guard case .send(let send) = edit.kind, send.hasPhoto else {
        kept.append(edit)
        continue
      }
      var waitMs = 1000
      for tried in 1...Self.photoTries {
        try Task.checkCancellation()
        do {
          try await ChatPhotos.upload(
            send.photo.id, in: groupID, account: account, server: server)
          kept.append(edit)
          break
        } catch ChatPhotos.UploadError.gone {
          try await database.write { try Chats.fail(edit.opID, in: $0) }
          break
        } catch ChatPhotos.UploadError.refused(let status) where (400..<500).contains(status) {
          Logger.sync.error("A photo was refused: \(status)")
          try await database.write { try Chats.fail(edit.opID, in: $0) }
          break
        } catch {
          guard tried < Self.photoTries else {
            try await database.write { try Chats.fail(edit.opID, in: $0) }
            break
          }
          try await Task.sleep(for: .milliseconds(waitMs))
          waitMs *= 2
        }
      }
    }
    return kept
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
