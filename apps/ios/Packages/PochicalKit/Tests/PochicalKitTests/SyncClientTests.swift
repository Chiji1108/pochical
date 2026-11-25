import Foundation
import Network
import PochicalDesign
import PochicalProto
import SQLiteData
import Synchronization
import Testing

@testable import PochicalKit

/// A database claimed by `owner`, as AccountSession leaves it signed in.
private func database(ownedBy owner: String) throws -> any DatabaseWriter {
  let database = try appDatabase()
  _ = try database.write { try SyncState.claim(for: owner, in: $0) }
  return database
}

@Test func aSocketStoppedByA401ConnectsAgainOnlyOnceTheAccountChanged() async throws {
  let server = try RefusingServer()
  defer { server.listener.cancel() }
  let url = try await server.start()
  let current = CurrentAccount()
  let first = try #require(current.begin(StoredSession(token: "kept", userID: "u1")))
  let client = SyncClient(database: try database(ownedBy: "u1"), peer: .support, server: url)

  await client.start(as: first)
  #expect(await eventually { await client.stopped == .signedOut })
  #expect(server.asked == 1)

  // Held again in the same stretch: it stays stopped.
  await client.start(as: first)
  try await Task.sleep(for: .milliseconds(200))
  #expect(server.asked == 1)

  // Signed in again: a socket, with the new session.
  let second = try #require(current.begin(StoredSession(token: "again", userID: "u1")))
  await client.start(as: second)
  #expect(await eventually { server.asked == 2 })
  #expect(server.tokens.withLock { $0 } == ["kept", "again"])
  #expect(await eventually { await client.stopped == .signedOut })
  await client.stop()
}

@Test func aSocketNeverOpensOnAnotherUsersData() async throws {
  let server = try RefusingServer()
  defer { server.listener.cancel() }
  let url = try await server.start()
  let current = CurrentAccount()
  let mine = try #require(current.begin(StoredSession(token: "mine", userID: "me")))

  for owner in ["someone else", ""] {
    let data = owner.isEmpty ? try appDatabase() : try database(ownedBy: owner)
    let client = SyncClient(database: data, peer: .user, server: url)
    await client.start(as: mine)
    #expect(await eventually { await client.stopped == .notTheOwner })
    await client.stop()
  }
  try await Task.sleep(for: .milliseconds(100))
  #expect(server.asked == 0)
}

@Test func aSocketGivenCredentialsFromBeforeTheAccountChangedNeverOpens() async throws {
  let server = try RefusingServer()
  defer { server.listener.cancel() }
  let url = try await server.start()
  let current = CurrentAccount()
  let before = try #require(current.begin(StoredSession(token: "before", userID: "me")))
  current.begin(StoredSession(token: "after", userID: "me"))
  let client = SyncClient(database: try database(ownedBy: "me"), peer: .user, server: url)

  await client.start(as: before)
  await client.finishSending(as: before)
  try await Task.sleep(for: .milliseconds(200))
  #expect(server.asked == 0)
  #expect(!before.isCurrent)
  #expect(throws: AccountChanged.self) { try before.whileCurrent {} }
}

/// A server on this Mac that takes every socket and, at its first message
/// (the Hello), closes it with `code`, as a group closes the socket of
/// someone taken out of it; counting the sockets opened.
private final class ClosingServer: Sendable {
  let listener: NWListener
  let opened = Mutex(0)

  init(code: UInt16) throws {
    let parameters = NWParameters.tcp
    parameters.defaultProtocolStack.applicationProtocols.insert(
      NWProtocolWebSocket.Options(), at: 0)
    listener = try NWListener(using: parameters, on: .any)
    listener.newConnectionHandler = { [weak self] connection in
      self?.opened.withLock { $0 += 1 }
      connection.start(queue: .global())
      connection.receiveMessage { _, _, _, _ in
        let close = NWProtocolWebSocket.Metadata(opcode: .close)
        close.closeCode = .privateCode(code)
        connection.send(
          content: nil,
          contentContext: NWConnection.ContentContext(identifier: "close", metadata: [close]),
          isComplete: true,
          completion: .contentProcessed { _ in })
      }
    }
  }

  func start() async throws -> URL {
    try await listening(listener)
  }

}

/// A database claimed by "me" holding the group `groupID`, as their own
/// socket listed it, with a member its socket brought.
private func database(holding groupID: String) throws -> any DatabaseWriter {
  let database = try database(ownedBy: "me")
  try database.write { db in
    var listed = Pochical_V1_Change()
    listed.cursor = 1
    listed.membership.groupID = groupID
    listed.membership.name = "いとこ会"
    try Sync.take([listed], in: db)
    var member = Pochical_V1_Change()
    member.cursor = 1
    member.member.userID = "u1"
    member.member.displayName = "さくら"
    try GroupSync.take([member], of: groupID, in: db)
  }
  return database
}

/// Whether the device has let go of `groupID` in `database` as of a group
/// left: nothing of it held, and the app told so (`groupLeft`).
private final class LettingGo: Sendable {
  let groupID: String
  private let told = Mutex(0)
  private nonisolated(unsafe) var watching: (any NSObjectProtocol)?

  init(_ groupID: String) {
    self.groupID = groupID
    watching = NotificationCenter.default.addObserver(
      forName: groupLeft, object: nil, queue: nil
    ) { [weak self] note in
      if note.userInfo?["groupID"] as? String == groupID { self?.told.withLock { $0 += 1 } }
    }
  }

  deinit {
    if let watching { NotificationCenter.default.removeObserver(watching) }
  }

  func letGo(in database: any DatabaseWriter) async throws -> Bool {
    let groupID = groupID
    guard await eventually({ told.withLock { $0 } > 0 }) else { return false }
    return try await database.read { db in
      try GroupRow.fetchCount(db) == 0 && GroupMemberRow.fetchCount(db) == 0
        && GroupSync.cursor(of: groupID, in: db) == 0
    }
  }
}

@Test func aGroupsSocketRefusedWith403StopsUntilTheGroupIsOpenedAgain() async throws {
  let server = try RefusingServer(status: "403 Forbidden")
  defer { server.listener.cancel() }
  let url = try await server.start()
  let credentials = try #require(CurrentAccount().begin(StoredSession(token: "t", userID: "me")))
  let group = LettingGo("refused-\(UUID().uuidString)")
  let database = try database(holding: group.groupID)
  let client = SyncClient(database: database, peer: .group(group.groupID), server: url)

  await client.start(as: credentials)
  #expect(await eventually { await client.stopped == .notMember })
  // A group the user's own DO does not list, which their socket will never
  // say they left: the device lets go of it as of one left.
  #expect(try await group.letGo(in: database))
  // No retry of its own, past the first wait it would take.
  try await Task.sleep(for: .milliseconds(SyncSocket.reconnectFirstMs + 200))
  #expect(server.asked == 1)

  // Opened again, as after joining again: one more try.
  await client.start(as: credentials)
  #expect(await eventually { server.asked == 2 })
  #expect(await eventually { await client.stopped == .notMember })
  await client.stop()
}

@Test func aGroupsSocketClosedAsNotAMemberStopsUntilTheGroupIsOpenedAgain() async throws {
  let server = try ClosingServer(code: UInt16(SyncSocket.notMemberCloseCode))
  defer { server.listener.cancel() }
  let url = try await server.start()
  let credentials = try #require(CurrentAccount().begin(StoredSession(token: "t", userID: "me")))
  let group = LettingGo("closed-\(UUID().uuidString)")
  let database = try database(holding: group.groupID)
  let client = SyncClient(database: database, peer: .group(group.groupID), server: url)

  await client.start(as: credentials)
  #expect(await eventually { await client.stopped == .notMember })
  #expect(try await group.letGo(in: database))
  // No retry of its own, past the first wait it would take.
  try await Task.sleep(for: .milliseconds(SyncSocket.reconnectFirstMs + 200))
  #expect(server.opened.withLock { $0 } == 1)
  await client.stop()
}

@Test func aSocketMovesAtOnceToTheNetworkThatBecomesTheDefault() async throws {
  let server = try WelcomingServer()
  defer { server.listener.cancel() }
  server.welcome()
  let url = try await server.start()
  let (networks, network) = AsyncStream.makeStream(of: String?.self)
  let credentials = try #require(CurrentAccount().begin(StoredSession(token: "t", userID: "me")))
  let client = SyncClient(
    database: try database(ownedBy: "me"), peer: .group("g"), server: url,
    defaultNetworks: { networks })
  network.yield("pdp_ip0")
  await client.start(as: credentials)
  #expect(await eventually { server.opened.withLock { $0 } == 1 })

  // Wi-Fi taking over while cellular is still up: the path stays satisfied.
  network.yield("en0")
  #expect(await eventually { server.opened.withLock { $0 } == 2 })

  // Wi-Fi lost, then cellular the default again.
  network.yield(nil)
  network.yield("pdp_ip0")
  #expect(await eventually { server.opened.withLock { $0 } == 3 })
  await client.stop()
}
