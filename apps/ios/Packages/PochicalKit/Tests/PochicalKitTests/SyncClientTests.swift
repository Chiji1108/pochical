import Foundation
import SQLiteData
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
