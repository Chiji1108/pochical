import Foundation
import Network
import PochicalDesign
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
    let ready = AsyncStream<UInt16> { continuation in
      listener.stateUpdateHandler = { [listener] state in
        if case .ready = state, let port = listener.port?.rawValue {
          continuation.yield(port)
          continuation.finish()
        }
      }
    }
    listener.start(queue: .global())
    for await port in ready {
      return URL(string: "http://127.0.0.1:\(port)")!
    }
    throw CancellationError()
  }
}

@Test func aGroupsSocketRefusedWith403StopsUntilTheGroupIsOpenedAgain() async throws {
  let server = try RefusingServer(status: "403 Forbidden")
  defer { server.listener.cancel() }
  let url = try await server.start()
  let credentials = try #require(CurrentAccount().begin(StoredSession(token: "t", userID: "me")))
  let client = SyncClient(database: try database(ownedBy: "me"), peer: .group("g"), server: url)

  await client.start(as: credentials)
  #expect(await eventually { await client.stopped == .notMember })
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
  let client = SyncClient(database: try database(ownedBy: "me"), peer: .group("g"), server: url)

  await client.start(as: credentials)
  #expect(await eventually { await client.stopped == .notMember })
  // No retry of its own, past the first wait it would take.
  try await Task.sleep(for: .milliseconds(SyncSocket.reconnectFirstMs + 200))
  #expect(server.opened.withLock { $0 } == 1)
  await client.stop()
}
