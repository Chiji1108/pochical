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
/// (Outbox). A group's, open while the app has the group open, takes the
/// group's values the same way and sends the group's chat outbox. Each
/// keeps its socket alive and reconnects after a random wait that doubles
/// with each failed try, at once when the network comes back; never after
/// a 401 or an update the server asks for, nor, until a group's is started
/// again, once the user is not in the group (`mayStart`).
///
/// AccountSession alone starts it, as whoever the device is signed in as
/// then (`Credentials`), and it sends and takes only while the database is
/// that user's (`SyncState.claim`) and the account has not changed since:
/// checked in the same transaction as each read it sends from and each
/// write it takes into, so no order of calls can carry one user's data to
/// another.
public actor SyncClient {
  /// Whose DO the socket reaches.
  public enum Peer: Sendable, Equatable {
    case user
    case group(String)
    /// The user's chat with Pochical's people, kept as a group's chats are.
    case support

    /// The socket of the chats' place the device keeps by `placeID`: a
    /// group's, or the chat with Pochical's people's.
    public static func place(_ placeID: String) -> Peer {
      placeID == ChatPlace.supportID ? .support : .group(placeID)
    }

    /// The chats' place the socket reaches, by the id the device keeps its
    /// chats by; nil for the user's own DO.
    var placeID: String? {
      switch self {
      case .user: nil
      case .group(let groupID): groupID
      case .support: ChatPlace.supportID
      }
    }
  }

  /// Why it stopped trying: until the account changes, or, not in the
  /// group, until it is started again (`mayStart`).
  public enum Stop: Error, Sendable {
    /// The server does not know the session: the user signed out or their
    /// account was deleted elsewhere. Nothing is cleared and no new user
    /// is made (Reconnecting).
    case signedOut
    /// The server needs a newer app.
    case protocolTooOld
    /// The database is not the user's it was started as: another user's,
    /// or the account changed since. It neither sends nor takes anything
    /// until started again as whoever the device is then.
    case notTheOwner
    /// The user is not in the group: taken out, left on another device, or
    /// the group gone (403, or closed with `SyncSocket.notMemberCloseCode`).
    /// Their own socket tells the device so; opening the group again tries
    /// once more, as after joining it again.
    case notMember
  }

  /// How many times a photo is tried before its line is marked unsent:
  /// waits of 1, 2, 4 and 8 seconds between.
  static let photoTries = 5

  /// The socket protocol this build speaks (apps/server/src/protocol.ts).
  static let protocolVersion: UInt32 = 1

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
  /// Tries since a socket last caught up: not since its Welcome, so one
  /// that breaks right after it, again and again, still waits longer.
  private var tries = 0
  private var connected = false
  /// The OS said the network went away, and has not said it came back.
  private var offline = false
  /// Between tries, waiting before the next.
  private var waitingToRetry = false
  /// When the server last answered the keepalive.
  private var lastReplyMs: Int64 = 0
  /// The server refused a frame's clocks: the outbox takes new ones once
  /// the next Welcome has corrected the device's time.
  private var clockWasAhead = false
  /// Sending the outbox on the socket open, from its Welcome, with that
  /// socket: only its own closing ends it.
  private var sending: (socket: URLSessionWebSocketTask, task: Task<Void, Never>)?
  /// Waiting for the outbox to empty before closing, in the background.
  private var finishing: Task<Void, Never>?
  /// Whom it connects as, from `start` until `stop`.
  private var credentials: Credentials?
  public private(set) var stopped: Stop?
  /// The stretch of the account `stopped` came in: a start in a later one
  /// tries again, as the device is someone else then, or signed in again.
  private var stoppedIn: Int?
  /// Everything the DO had for this device at Welcome has been taken: the
  /// Pong to the Ping sent after it has come (Keepalive).
  private var caughtUp = false
  /// The nonce of that Ping.
  private var catchUpNonce: UInt32 = 0
  /// Screens waiting for the catch-up, each for a while at most.
  private var catchUpWaiters: [UUID: CheckedContinuation<Void, Never>] = [:]
  /// Where the socket is, for the screens to say while it is not current.
  private var status = SyncStatus.connecting {
    didSet {
      guard status != oldValue else { return }
      for watcher in statusWatchers.values {
        watcher.yield(status)
      }
    }
  }
  private var statusWatchers: [UUID: AsyncStream<SyncStatus>.Continuation] = [:]
  /// The screens told of others' typing, as it comes; never kept.
  private var typingWatchers: [UUID: AsyncStream<Pochical_V1_Typing>.Continuation] = [:]
  private var photoPageWatchers: [UUID: AsyncStream<ChatPhotosPage>.Continuation] = [:]

  init(database: any DatabaseWriter, peer: Peer = .user, server: URL = Server.url) {
    self.database = database
    self.peer = peer
    self.server = server
    var socket = URLComponents(url: server, resolvingAgainstBaseURL: false)!
    socket.scheme = server.scheme == "https" ? "wss" : "ws"
    switch peer {
    case .user: socket.path = "/v1/me/socket"
    case .group(let groupID): socket.path = "/v1/groups/\(groupID)/socket"
    case .support: socket.path = "/v1/me/support/socket"
    }
    socketURL = socket.url!
  }

  // Its watch on the network goes with it.
  deinit {
    paths.cancel()
  }

  /// Connects as `credentials`, or tries again at once with the count
  /// started again, as the person is waiting: the app came to the
  /// foreground. An open socket stays. Nothing once the account has changed
  /// since `credentials` were given out.
  func start(as credentials: Credentials) {
    finishing?.cancel()
    finishing = nil
    guard mayStart(as: credentials) else { return }
    stopped = nil
    reconnect(as: credentials)
  }

  /// Whether a socket stopped may start again as `credentials`, the one
  /// rule for it: never once the account has changed since they were given
  /// out; after any stop, in a later stretch of the account (the device is
  /// someone else then, or signed in again); and, not in the group, at the
  /// next start in the same one, as after joining again, though never by
  /// itself, as the network coming back.
  private func mayStart(as credentials: Credentials) -> Bool {
    guard credentials.isCurrent else { return false }
    switch stopped {
    case nil, .notMember: return true
    case .signedOut, .protocolTooOld, .notTheOwner: return stoppedIn != credentials.generation
    }
  }

  /// Connects as `start` does, a closing under way going on: the network
  /// coming back does not take back a socket closing once sent.
  private func reconnect(as credentials: Credentials) {
    // In the same stretch, a socket open or opening stays: only one waiting
    // to try again is tried at once. Two asked for together (the session
    // signing in as the app comes to the front) open one socket.
    let same = self.credentials?.generation == credentials.generation
    guard credentials.isCurrent, stopped == nil, !(same && running != nil && !waitingToRetry)
    else { return }
    self.credentials = credentials
    // A socket still opening is closed too: cancelling its task does not
    // end a send or receive waiting on it, and it would stay open beside
    // the new one.
    running?.cancel()
    socket?.cancel(with: .goingAway, reason: nil)
    socket = nil
    tries = 0
    waitingToRetry = false
    running = Task { await run(as: credentials) }
    paths.pathUpdateHandler = { [weak self] path in
      guard let self else { return }
      if path.status == .satisfied {
        Task { await self.networkCameBack() }
      } else {
        Task { await self.networkWentAway() }
      }
    }
    if paths.queue == nil {
      paths.start(queue: DispatchQueue(label: "app.pochical.sync.paths"))
    }
  }

  /// Closes the socket: the app went to the background, or the account is
  /// changing.
  func stop() {
    finishing?.cancel()
    finishing = nil
    credentials = nil
    running?.cancel()
    running = nil
    socket?.cancel(with: .goingAway, reason: nil)
    socket = nil
    sending?.task.cancel()
    sending = nil
    connected = false
    // What the next socket brings is not taken yet, as when switching to
    // another user.
    caughtUp = false
    status = .connecting
  }

  /// Going to the background, or away from the group: the socket stays
  /// until its outbox (the user's, or the group's chat outbox) is sent and
  /// acknowledged, or `stop` (the time the OS gave runs out), so an edit
  /// made just before reaches the user's other devices and groups without
  /// waiting for the app to be opened again (Sockets). Connected as
  /// `credentials` if it is not yet, else as it was started.
  func finishSending(as credentials: Credentials? = nil) async {
    await closeOnceSent(as: credentials).value
  }

  /// Closes the socket once its outbox is sent, as `finishSending` does,
  /// without waiting for it: the task ends as the socket closes, or as
  /// `start` takes it back, the socket then staying open.
  @discardableResult
  func closeOnceSent(as given: Credentials? = nil) -> Task<Void, Never> {
    let waiting =
      (try? database.read { [peer] in try Self.lastToSend(to: peer, now: Self.nowMs(), in: $0) })
      ?? nil
    guard waiting != nil, let credentials = given ?? credentials else {
      stop()
      return Task {}
    }
    if running == nil {
      start(as: credentials)
    }
    // Stopped for good in this stretch: nothing it waits for would go.
    guard running != nil, stopped == nil else {
      stop()
      return Task {}
    }
    let emptied = Task { [database, peer] in
      await waitUntil(in: database) { db, now in
        guard try Self.lastToSend(to: peer, now: now, in: db) != nil else { return (true, nil) }
        guard let placeID = peer.placeID else { return (false, nil) }
        return (false, try Chats.nextFailing(of: placeID, now: now, in: db))
      }
    }
    finishing = emptied
    return Task {
      await emptied.value
      // Not stopped or brought back meanwhile.
      if finishing == emptied {
        stop()
      }
    }
  }

  /// The newest edit still to go to `peer` at the device's time `now`,
  /// nil when none is.
  private static func lastToSend(to peer: Peer, now: Int64, in db: Database) throws -> Int? {
    guard let placeID = peer.placeID else { return try Sync.lastWaiting(in: db) }
    return try Chats.lastToSend(of: placeID, now: now, in: db)
  }

  /// With no network the socket is gone, though the keepalive would take
  /// a while to find it so: closed at once, so the screens say 接続中…,
  /// and opened again as the network comes back.
  private func networkWentAway() {
    offline = true
    guard connected else { return }
    socket?.cancel(with: .goingAway, reason: nil)
  }

  /// Only after it went away: the OS also says so as it starts watching,
  /// which would open a second socket beside the one opening.
  private func networkCameBack() {
    guard offline else { return }
    offline = false
    if let credentials, running != nil, !connected {
      reconnect(as: credentials)
    }
  }

  private func run(as credentials: Credentials) async {
    while !Task.isCancelled {
      // Closed before the wait, so the network coming back meanwhile tries
      // again at once rather than after it.
      connected = false
      caughtUp = false
      status = .connecting
      if tries > 0 {
        let most = reconnectWaitMost(
          tries: tries, firstMs: SyncSocket.reconnectFirstMs, mostMs: SyncSocket.reconnectMostMs)
        waitingToRetry = true
        try? await Task.sleep(for: .milliseconds(Int.random(in: 0...most)))
        if Task.isCancelled { return }
        waitingToRetry = false
      }
      tries += 1
      do {
        try await connect(as: credentials)
      } catch let stop as Stop {
        // A run replaced meanwhile says nothing of the one after it.
        guard !Task.isCancelled else { return }
        stopped = stop
        stoppedIn = credentials.generation
        // Nothing more goes on it: what waits for its outbox to empty
        // waits no longer.
        finishing?.cancel()
        Logger.sync.error("Stopped syncing: \(String(describing: stop))")
        running = nil
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

  private func connect(as credentials: Credentials) async throws {
    var hello = Pochical_V1_Hello()
    hello.protocolVersion = Self.protocolVersion
    // Read before the socket opens, so none opens on a database that is
    // not the user's.
    hello.cursor = try await database.read { [peer] db in
      try Self.owned(by: credentials, db)
      guard let placeID = peer.placeID else { return try Sync.cursor(in: db) }
      return try GroupSync.cursor(of: placeID, in: db)
    }
    var request = URLRequest(url: socketURL)
    for (name, values) in credentials.headers {
      request.setValue(values.joined(separator: ","), forHTTPHeaderField: name)
    }
    // Started again meanwhile: the new try opens its own.
    try Task.checkCancellation()
    let socket = session.webSocketTask(with: request)
    self.socket = socket
    socket.resume()
    defer { socket.cancel(with: .goingAway, reason: nil) }
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
      if sending?.socket === socket {
        sending?.task.cancel()
        sending = nil
      }
    }
    while true {
      let message: URLSessionWebSocketTask.Message
      do {
        message = try await socket.receive()
      } catch {
        throw Self.refusal(of: socket) ?? error
      }
      // A socket replaced meanwhile takes nothing more.
      guard socket === self.socket else { throw CancellationError() }
      switch message {
      case .string(SyncSocket.keepaliveReply):
        lastReplyMs = Self.nowMs()
      case .data(let data):
        try await take(
          Pochical_V1_ServerFrame(serializedBytes: data), on: socket, sentMs: sentMs,
          as: credentials)
      default:
        break
      }
    }
  }

  private func take(
    _ frame: Pochical_V1_ServerFrame, on socket: URLSessionWebSocketTask, sentMs: Int64,
    as credentials: Credentials
  ) async throws {
    switch frame.kind {
    case .welcome(let welcome):
      // Before the Ping's send, whose wait would skew the clock's offset.
      let receivedMs = Self.nowMs()
      connected = true
      status = .catchingUp
      try await askCaughtUp(on: socket)
      // A group's socket sends its chat outbox; the user's corrects the
      // time and sends theirs.
      guard peer == .user else {
        sending?.task.cancel()
        if let placeID = peer.placeID {
          sending = (
            socket, Task { await sendChatOutbox(of: placeID, on: socket, as: credentials) }
          )
        }
        return
      }
      try await database.write { db in
        try Self.owned(by: credentials, db)
        try Sync.welcome(
          sentMs: sentMs, receivedMs: receivedMs, serverMs: welcome.serverMs, in: db)
      }
      Logger.sync.info("Welcome at cursor \(welcome.cursor)")
      if clockWasAhead {
        let now = Self.nowMs()
        try await database.write { db in
          try Self.owned(by: credentials, db)
          try Sync.restamp(now: now, in: db)
        }
        clockWasAhead = false
      }
      sending?.task.cancel()
      sending = (socket, Task { await sendOutbox(socket, as: credentials) })
    case .changes(let changes):
      try await database.write { [peer] db in
        try Self.owned(by: credentials, db)
        guard let placeID = peer.placeID else { return try Sync.take(changes.changes, in: db) }
        try GroupSync.take(changes.changes, of: placeID, in: db)
      }
      Logger.sync.info("Took \(changes.changes.count) changes")
    case .reset:
      try await database.write { [peer] db in
        try Self.owned(by: credentials, db)
        guard let placeID = peer.placeID else { return try Sync.reset(in: db) }
        try GroupSync.reset(placeID, in: db)
      }
    case .acked(let acked):
      try await database.write { [peer] db in
        try Self.owned(by: credentials, db)
        if peer.placeID == nil {
          try OwnValues.acknowledge(acked.opIds, in: db)
        } else {
          try Chats.acknowledge(acked.opIds, refused: acked.refused.map(\.opID), in: db)
        }
      }
      for refused in acked.refused {
        Logger.sync.error("A send was refused: \(refused.opID) \(String(describing: refused.reason))")
      }
      Logger.sync.info("\(acked.opIds.count) edits acknowledged")
    case .error(let error):
      switch error.code {
      case .protocolTooOld: throw Stop.protocolTooOld
      case .clockAhead: throw ClockAhead()
      default: throw ServerRefused(code: error.code, message: error.message)
      }
    case .chatPage(let page):
      if let placeID = peer.placeID {
        try await database.write { db in
          try Self.owned(by: credentials, db)
          try Chats.take(page, of: placeID, in: db)
        }
      }
    case .chatPhotos(let photos):
      let page = ChatPhotosPage(photos)
      for watcher in photoPageWatchers.values {
        watcher.yield(page)
      }
    case .typing(let typing):
      for watcher in typingWatchers.values {
        watcher.yield(typing)
      }
    case .pong(let pong):
      if pong.nonce == catchUpNonce {
        tries = 0
        caughtUp = true
        status = .current
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
  private func sendOutbox(_ socket: URLSessionWebSocketTask, as credentials: Credentials) async {
    var sent = 0
    let outbox = ValueObservation.tracking { try Sync.lastWaiting(in: $0) }
    do {
      for try await last in outbox.values(in: database) {
        guard let last, last > sent else { continue }
        let (frames, through) = try await database.read { [sent] db in
          try Self.owned(by: credentials, db)
          return try Sync.frames(after: sent, in: db)
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

  /// Sends the Ping whose Pong says the catch-up has all arrived. A
  /// socket that cannot send it is given up, as one that cannot receive:
  /// the next asks again, rather than this one staying open never caught
  /// up.
  private func askCaughtUp(on socket: URLSessionWebSocketTask) async throws {
    caughtUp = false
    catchUpNonce &+= 1
    var frame = Pochical_V1_ClientFrame()
    frame.ping.nonce = catchUpNonce
    try await socket.send(.data(frame.serializedData()))
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

  /// Where the socket is, now and as it changes, until the stream is let
  /// go.
  public func statuses() -> AsyncStream<SyncStatus> {
    let (stream, continuation) = AsyncStream<SyncStatus>.makeStream()
    let id = UUID()
    statusWatchers[id] = continuation
    continuation.yield(status)
    continuation.onTermination = { [weak self] _ in
      Task { await self?.stopWatchingStatus(id) }
    }
    return stream
  }

  private func stopWatchingStatus(_ id: UUID) {
    statusWatchers[id] = nil
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

  /// Asks the group for a page of a chat's photos alone, before `seq` or
  /// after it (spec/sync-protocol.md, Chat), when its socket is open; the
  /// page comes to `photoPages()`. False when it could not be asked.
  @discardableResult
  public func requestPhotos(of threadID: String, seq: Int64, after: Bool) async -> Bool {
    guard connected, let socket else { return false }
    var frame = Pochical_V1_ClientFrame()
    frame.chatPhotosRequest.threadID = threadID
    frame.chatPhotosRequest.seq = UInt64(max(seq, 0))
    frame.chatPhotosRequest.after = after
    do {
      try await socket.send(.data(frame.serializedData()))
      return true
    } catch {
      return false
    }
  }

  /// The pages of a chat's photos as they come, until the stream is let go.
  public func photoPages() -> AsyncStream<ChatPhotosPage> {
    let (stream, continuation) = AsyncStream<ChatPhotosPage>.makeStream()
    let id = UUID()
    photoPageWatchers[id] = continuation
    continuation.onTermination = { [weak self] _ in
      Task { await self?.stopWatchingPhotoPages(id) }
    }
    return stream
  }

  private func stopWatchingPhotoPages(_ id: UUID) {
    photoPageWatchers[id] = nil
  }

  /// Sends the group's chat outbox as `sendOutbox` does the user's, a
  /// photo's line only once the photo is uploaded, so the edits after it
  /// wait their turn, and none that waited past `Chat.unsentAfterMs`.
  private func sendChatOutbox(
    of groupID: String, on socket: URLSessionWebSocketTask, as credentials: Credentials
  ) async {
    var sent = 0
    let outbox = ValueObservation.tracking { try Chats.lastWaiting(of: groupID, in: $0) }
    do {
      for try await last in outbox.values(in: database) {
        guard let last, last > sent else { continue }
        // Lines that waited too long, as after a long time offline, wait
        // for the member instead (spec/chat.md, Lines on their way).
        let (frames, through) = try await database.read { [sent] db in
          try Self.owned(by: credentials, db)
          return try Chats.frames(of: groupID, after: sent, now: Self.nowMs(), in: db)
        }
        for var frame in frames {
          let uploaded = try await uploadingPhotos(
            of: frame.chatEdits.edits, in: groupID, as: credentials)
          frame.chatEdits.edits = try await database.write { db in
            try Self.owned(by: credentials, db)
            return try Chats.goOut(uploaded, now: Self.nowMs(), in: db)
          }
          guard !frame.chatEdits.edits.isEmpty else { continue }
          try await socket.send(.data(frame.serializedData()))
        }
        sent = through
      }
    } catch {
      // The socket closed; the next one sends them all again.
    }
  }

  /// The edits once their lines' photos are all uploaded; a line with a
  /// photo that cannot go leaves the line waiting, marked, for the member
  /// to send again or delete, and the edits after it go on. One the member
  /// stopped, or took back, while its photos went up or waited to is left,
  /// as they left it.
  private func uploadingPhotos(
    of edits: [Pochical_V1_ChatEdit], in groupID: String, as credentials: Credentials
  ) async throws -> [Pochical_V1_ChatEdit] {
    var kept: [Pochical_V1_ChatEdit] = []
    for edit in edits {
      guard case .send(let send) = edit.kind, case .photos = send.content.kind else {
        kept.append(edit)
        continue
      }
      let photoIDs = try await database.read {
        try Chats.photosToUpload(edit.opID, now: Self.nowMs(), in: $0)
      }
      var allUp = true
      for photoID in photoIDs where allUp {
        allUp = try await upload(photoID, of: edit, in: groupID, as: credentials)
      }
      guard allUp else { continue }
      // Stopped as the last bytes went: left as the member left it. Past
      // here × does nothing, so the line is sent as it shows.
      let going = await PhotoUploads.shared.send(edit.opID) { [database] in
        (try? database.read { try Chats.stillGoing(edit.opID, now: Self.nowMs(), in: $0) })
          ?? false
      }
      if going { kept.append(edit) }
    }
    return kept
  }

  /// Uploads one of the photos of the edit's line, trying again after a
  /// wait that doubles, `photoTries` times in all, and keeps it as up;
  /// true once up with the line still going. A photo that cannot go (gone
  /// from the device, refused, or failing every try) marks the line not
  /// sent.
  private func upload(
    _ photoID: String, of edit: Pochical_V1_ChatEdit, in groupID: String,
    as credentials: Credentials
  ) async throws -> Bool {
    var waitMs = 1000
    for tried in 1...Self.photoTries {
      try Task.checkCancellation()
      guard try await stillGoing(edit.opID) else { return false }
      let began = Self.nowMs()
      do {
        try await ChatPhotos.upload(
          photoID, of: edit.opID, in: PhotoShelf(place: groupID), as: credentials, server: server)
      } catch {
        try Task.checkCancellation()
        guard try await stillGoing(edit.opID),
          try await uploadFailed(edit, with: error, tried: tried, as: credentials)
        else { return false }
        try await Task.sleep(for: .milliseconds(waitMs))
        waitMs *= 2
        continue
      }
      // Kept outside the upload's tries: the photo is up, and a write that
      // fails here (the device gone on as someone else) is no failed upload.
      try await database.write { db in
        try Self.owned(by: credentials, db)
        try Chats.photoUp(photoID, of: edit.opID, began: began, in: db)
      }
      return try await stillGoing(edit.opID)
    }
    return false
  }

  /// Marks the edit's line not sent when its photo cannot go, now or after
  /// `tried` tries; true for one to try again.
  private func uploadFailed(
    _ edit: Pochical_V1_ChatEdit, with error: Error, tried: Int, as credentials: Credentials
  ) async throws -> Bool {
    switch error {
    case ChatPhotos.UploadError.refused(let status) where (400..<500).contains(status):
      Logger.sync.error("A photo was refused: \(status)")
    case ChatPhotos.UploadError.gone:
      break
    default:
      guard tried >= Self.photoTries else { return true }
    }
    try await database.write { db in
      try Self.owned(by: credentials, db)
      try Chats.fail(edit.opID, in: db)
    }
    return false
  }

  /// Throws unless the database is the user's `credentials` are of and the
  /// account has not changed since they were given out: inside the
  /// transaction of each read sent from and each write taken into, so the
  /// account changing (which erases the database in a later transaction)
  /// comes wholly before or after it.
  private static func owned(by credentials: Credentials, _ db: Database) throws {
    guard credentials.isCurrent, try SyncState.current(in: db).owner == credentials.userID else {
      throw Stop.notTheOwner
    }
  }

  private func stillGoing(_ opID: String) async throws -> Bool {
    try await database.read { try Chats.stillGoing(opID, now: Self.nowMs(), in: $0) }
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

  /// Why the server would not open the socket, or closed it, when it said.
  private static func refusal(of socket: URLSessionWebSocketTask) -> Stop? {
    if socket.closeCode.rawValue == SyncSocket.notMemberCloseCode {
      return .notMember
    }
    switch (socket.response as? HTTPURLResponse)?.statusCode {
    case 401: return .signedOut
    case 403: return .notMember
    default: return nil
    }
  }

  static func nowMs() -> Int64 {
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

/// Where a sync socket is (spec/sync-protocol.md, Sockets): what the
/// screens say while it is not current.
public enum SyncStatus: Sendable {
  /// Not open: connecting, waiting to try again, or with no network.
  case connecting
  /// Open, what the server had at Welcome still coming.
  case catchingUp
  /// Open and caught up.
  case current
}

extension AsyncStream where Element == SyncStatus {
  /// Each time the socket opens again after a drop (`connecting`), for
  /// what was asked of the server to be asked again: its answer may have
  /// gone with the socket.
  public func reopenings() -> AsyncStream<Void> {
    AsyncStream<Void> { continuation in
      let task = Task {
        var open = true
        for await status in self {
          let now = status != .connecting
          if now, !open { continuation.yield() }
          open = now
        }
        continuation.finish()
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }
}
