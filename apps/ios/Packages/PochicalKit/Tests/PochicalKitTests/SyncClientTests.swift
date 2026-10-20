import Foundation
import Network
import PochicalDesign
import SQLiteData
import Synchronization
import Testing

@testable import PochicalKit

/// A server on this Mac that refuses every socket with `status`: 401, as
/// the server does a session it does not know, or 403, a group the user is
/// not in; counting the sockets asked for.
private final class RefusingServer: Sendable {
  let listener: NWListener
  let asked = Mutex(0)

  init(status: String = "401 Unauthorized") throws {
    listener = try NWListener(using: .tcp, on: .any)
    listener.newConnectionHandler = { [weak self] connection in
      connection.start(queue: .global())
      connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { _, _, _, _ in
        self?.asked.withLock { $0 += 1 }
        let refusal = "HTTP/1.1 \(status)\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        connection.send(
          content: Data(refusal.utf8),
          completion: .contentProcessed { _ in connection.cancel() })
      }
    }
  }

  /// Listening, at the URL it is reached by.
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

/// A token store that always has one, so no sign-in is asked for.
private struct SignedIn: TokenStore {
  func token() -> String? { "kept" }
  func keep(_ token: String) {}
  func forget() {}
}

/// Waits a while at most for `done`, checking every few milliseconds.
private func eventually(_ done: () async -> Bool) async -> Bool {
  for _ in 0..<200 {
    if await done() { return true }
    try? await Task.sleep(for: .milliseconds(10))
  }
  return false
}

@Test func aSocketStoppedByA401ConnectsAgainOnlyOnceTheAccountChanged() async throws {
  let server = try RefusingServer()
  defer { server.listener.cancel() }
  let url = try await server.start()
  let account = Account(server: url, store: SignedIn())
  let client = SyncClient(
    account: account, database: try appDatabase(), peer: .support, server: url)

  await client.start()
  #expect(await eventually { await client.stopped == .signedOut })
  #expect(server.asked.withLock { $0 } == 1)

  // Held again by the same account: it stays stopped.
  await client.start()
  try await Task.sleep(for: .milliseconds(200))
  #expect(server.asked.withLock { $0 } == 1)

  // The account changed: nothing until it is held again, then a socket.
  await client.forgetStop()
  #expect(await client.stopped == nil)
  try await Task.sleep(for: .milliseconds(100))
  #expect(server.asked.withLock { $0 } == 1)
  await client.start()
  #expect(await eventually { server.asked.withLock { $0 } == 2 })
  #expect(await eventually { await client.stopped == .signedOut })
  await client.stop()
}

@Test func aGroupsSocketRefusedWith403StopsUntilTheGroupIsOpenedAgain() async throws {
  let server = try RefusingServer(status: "403 Forbidden")
  defer { server.listener.cancel() }
  let url = try await server.start()
  let account = Account(server: url, store: SignedIn())
  let client = SyncClient(
    account: account, database: try appDatabase(), peer: .group("g"), server: url)

  await client.start()
  #expect(await eventually { await client.stopped == .notMember })
  // No retry of its own, past the first wait it would take.
  try await Task.sleep(for: .milliseconds(SyncSocket.reconnectFirstMs + 200))
  #expect(server.asked.withLock { $0 } == 1)

  // Opened again, as after joining again: one more try.
  await client.start()
  #expect(await eventually { server.asked.withLock { $0 } == 2 })
  #expect(await eventually { await client.stopped == .notMember })
  await client.stop()
}
