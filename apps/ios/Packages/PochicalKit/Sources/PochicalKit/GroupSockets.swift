import Foundation
import SQLiteData
import Synchronization

/// The chats' places' sockets (the groups', and the chat with Pochical's
/// people's), one client for each, made the first time it is asked for and
/// kept for good, so a client handed out stays the place's whether its
/// socket is open or not: open while something holds it, then closing
/// once its chat outbox is sent and acknowledged (spec/sync-protocol.md,
/// Sockets), and opened again by the next hold. The app waits for them in
/// the background as for its own socket, those still held too, so a
/// socket its screen has not let go of yet is not missed. A group opened
/// again takes back the socket it has, closing or not yet let go of,
/// rather than opening a second, which would send the same outbox beside
/// it, a reaction's on then perhaps arriving after its off.
///
/// AccountSession holds it, and alone opens and closes its sockets: a
/// screen asks the session for a hold, and the sockets open only while the
/// session has given them whom to connect as (`use`).
public actor GroupSockets {
  private struct Socket {
    /// The screens' holds on it, each let go of once.
    var holds: Set<UUID> = []
    /// Which closing is under way, the socket perhaps taken back and
    /// closed again meanwhile.
    var closing: UUID?
    var closed: Task<Void, Never>?
  }

  private let database: any DatabaseWriter
  private let server: URL
  /// Told of a session the server does not know, as the user's socket
  /// tells it (SyncClient).
  private let sessionUnknown: @Sendable (Int) async -> Void
  /// Each place's client, handed out at once to screens on the main actor.
  private let clients = Mutex<[String: SyncClient]>([:])
  private var sockets: [String: Socket] = [:]
  /// Whom the sockets connect as; none while the account is changing or
  /// not signed in, when the holds are kept for later.
  private var credentials: Credentials?

  /// None of its sockets opens until a session gives it whom to connect
  /// as, so one made for the screens' previews never does.
  public init(
    database: any DatabaseWriter, server: URL = Server.url,
    sessionUnknown: @escaping @Sendable (Int) async -> Void = { _ in }
  ) {
    self.database = database
    self.server = server
    self.sessionUnknown = sessionUnknown
  }

  /// The place's client, the same one each time, its socket open or not.
  public nonisolated func client(_ placeID: String) -> SyncClient {
    clients.withLock { clients in
      if let client = clients[placeID] { return client }
      let client = SyncClient(
        database: database, peer: .place(placeID), server: server,
        sessionUnknown: sessionUnknown)
      clients[placeID] = client
      return client
    }
  }

  /// A hold on the place's socket, kept open until `close` lets go of it:
  /// taken back if it was closing, opened again if closed.
  func open(_ placeID: String) async -> UUID {
    let hold = UUID()
    var socket = sockets[placeID] ?? Socket()
    let starting = socket.holds.isEmpty
    socket.holds.insert(hold)
    socket.closing = nil
    sockets[placeID] = socket
    if starting, let credentials {
      await client(placeID).start(as: credentials)
    }
    return hold
  }

  /// Lets go of a hold; the last one let go of closes the socket once what
  /// it has to send is sent. A hold the background let go of already is
  /// nothing.
  func close(_ hold: UUID, of placeID: String) {
    guard var socket = sockets[placeID], socket.holds.remove(hold) != nil else { return }
    sockets[placeID] = socket
    if socket.holds.isEmpty {
      beginClosing(placeID)
    }
  }

  private func beginClosing(_ placeID: String) {
    guard var socket = sockets[placeID] else { return }
    let id = UUID()
    let client = client(placeID)
    socket.holds = []
    socket.closing = id
    socket.closed = Task {
      let sent = await client.closeOnceSent()
      guard self.sockets[placeID]?.closing == id else {
        // Taken back before it began closing: open as it was.
        if self.sockets[placeID]?.holds.isEmpty == false, let credentials = self.credentials {
          await client.start(as: credentials)
        }
        return
      }
      await sent.value
      if self.sockets[placeID]?.closing == id {
        self.sockets[placeID]?.closing = nil
        self.sockets[placeID]?.closed = nil
      }
    }
    sockets[placeID] = socket
  }

  /// Closes every one once sent, those held too, and waits until they all
  /// have, those left meanwhile too.
  func finishSending() async {
    for (placeID, socket) in sockets where !socket.holds.isEmpty {
      beginClosing(placeID)
    }
    while let next = sockets.values.first(where: { $0.closing != nil })?.closed {
      await next.value
    }
  }

  /// Closes those closing at once: the time the OS gave runs out.
  func stop() async {
    for (placeID, socket) in sockets where socket.closing != nil {
      await client(placeID).stop()
    }
  }

  /// Closes every socket at once, as the account is changing: nothing more
  /// of the account before is taken in, nor is its chat outbox sent. Its
  /// holds go too, as the places were the user before's: the screens hold
  /// again those of whoever the device is next (OpenPlaceSocket).
  func forgetAccount() async {
    credentials = nil
    sockets = [:]
    for client in clients.withLock({ Array($0.values) }) {
      await client.stop()
    }
  }

  /// Connects as `credentials` from now: the sockets held open at once,
  /// the others as they are next held.
  func use(_ credentials: Credentials) async {
    guard credentials.isCurrent else { return }
    self.credentials = credentials
    for (placeID, socket) in sockets where !socket.holds.isEmpty {
      await client(placeID).start(as: credentials)
    }
  }
}
