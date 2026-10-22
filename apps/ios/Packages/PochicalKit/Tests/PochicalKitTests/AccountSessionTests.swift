import Foundation
import SQLiteData
import Synchronization
import Testing

@testable import PochicalKit

/// Shut until opened, for a call to wait at while a test does something
/// meanwhile.
private final class Gate: Sendable {
  private let state = Mutex<(open: Bool, waiting: [CheckedContinuation<Void, Never>])>(
    (false, []))

  func wait() async {
    await withCheckedContinuation { continuation in
      let now = state.withLock { state in
        if !state.open { state.waiting.append(continuation) }
        return state.open
      }
      if now { continuation.resume() }
    }
  }

  func open() {
    let waiting = state.withLock { state in
      state.open = true
      defer { state.waiting = [] }
      return state.waiting
    }
    for continuation in waiting { continuation.resume() }
  }
}

private struct Refused: Error {}

/// The server's account calls, answered in memory: anonymous sign-ins
/// make users anon-1, anon-2…; Apple's signs in to "account". What it was
/// asked is kept.
private final class FakeAccountServer: AccountServer {
  struct Asked {
    var signedOut: [String] = []
    var deleted: [String] = []
    var me = 0
  }

  let asked = Mutex(Asked())
  let made = Mutex(0)
  let refusing = Mutex<Set<String>>([])
  /// Each call named here waits at its gate.
  let gates = Mutex<[String: Gate]>([:])

  func hold(_ call: String) -> Gate {
    let gate = Gate()
    gates.withLock { $0[call] = gate }
    return gate
  }

  private func reach(_ call: String) async throws {
    if let gate = gates.withLock({ $0[call] }) { await gate.wait() }
    if refusing.withLock({ $0.contains(call) }) { throw Refused() }
  }

  func signInAnonymously() async throws -> StoredSession {
    try await reach("signInAnonymously")
    let n = made.withLock { made in
      made += 1
      return made
    }
    return StoredSession(token: "anon-token-\(n)", userID: "anon-\(n)")
  }

  func signInApple(idToken: String, nonce: String, on token: String) async throws
    -> StoredSession
  {
    try await reach("signInApple")
    return StoredSession(token: "account-token", userID: "account")
  }

  func signOut(_ token: String) async throws {
    try await reach("signOut")
    asked.withLock { $0.signedOut.append(token) }
  }

  func linkApple(idToken: String, nonce: String, on token: String) async throws -> LinkResult {
    .linked
  }

  func me(_ token: String) async throws -> (userID: String, anonymous: Bool) {
    asked.withLock { $0.me += 1 }
    try await reach("me")
    return ("of-\(token)", false)
  }

  func deleteAccount(_ token: String, appleAuthorizationCode: String) async throws {
    try await reach("deleteAccount")
    asked.withLock { $0.deleted.append(token) }
  }
}

/// A session on a fresh database, with `kept` in its Keychain, its sockets
/// reaching a server that refuses them with `socketStatus` and keeps
/// their tokens: by default as a place the user is not in, which stops a
/// socket and leaves the session as it is.
@MainActor private struct Made {
  let session: AccountSession
  let server: FakeAccountServer
  let sockets: RefusingServer
  let keychain: SessionKeychain
  let database: any DatabaseWriter
  let shared: UserDefaults

  init(kept: Data? = nil, owner: String? = nil, socketStatus: String = "403 Forbidden")
    async throws
  {
    try await self.init(
      keychain: SessionKeychain(own: MemoryStore(kept), leftBehind: MemoryStore()), owner: owner,
      socketStatus: socketStatus)
  }

  init(keychain: SessionKeychain, owner: String? = nil, socketStatus: String = "403 Forbidden")
    async throws
  {
    server = FakeAccountServer()
    sockets = try RefusingServer(status: socketStatus)
    let url = try await sockets.start()
    self.keychain = keychain
    database = try appDatabase()
    // Left by another user: a coworker of theirs, still waiting to go.
    if let owner {
      _ = try await database.write { db in
        _ = try SyncState.claim(for: owner, in: db)
        return try OwnValues.addCoworker(named: "佐藤", now: 1_000, in: db)
      }
    }
    shared = try #require(UserDefaults(suiteName: "app.pochical.tests.\(UUID().uuidString)"))
    session = AccountSession(
      database: database, server: server, keychain: keychain, shared: shared,
      eraseFiles: {}, socketServer: url)
  }

  static func signedIn(as token: String, _ userID: String, socketStatus: String = "403 Forbidden")
    async throws -> Made
  {
    try await Made(
      kept: JSONEncoder().encode(StoredSession(token: token, userID: userID)),
      socketStatus: socketStatus)
  }

  var owner: String? {
    try? database.read { try SyncState.current(in: $0).owner }
  }

  var coworkers: Int {
    (try? database.read { try Int.fetchOne($0, sql: #"SELECT count(*) FROM "coworkers""#) }) ?? -1
  }

  /// The tokens the sockets were asked with, each run of one counted
  /// once, as a socket started twice at once may ask twice.
  var socketTokens: [String] {
    sockets.tokens.withLock { tokens in
      tokens.enumerated().filter { $0.offset == 0 || tokens[$0.offset - 1] != $0.element }
        .map(\.element)
    }
  }

  func addCoworker() async throws {
    _ = try await database.write { try OwnValues.addCoworker(named: "佐藤", now: 1_000, in: $0) }
  }
}

@MainActor @Test func startsAsTheSessionKeptAndClaimsTheDevicesData() async throws {
  let made = try await Made.signedIn(as: "a", "A")
  #expect(made.session.phase == .signedIn)
  #expect(made.session.userID == "A")
  #expect(made.shared.string(forKey: "userID") == "A")
  #expect(await eventually { made.owner == "A" })
  #expect(made.server.made.withLock { $0 } == 0)

  made.session.cameToFront()
  _ = await eventually { made.socketTokens == ["a"] }
  #expect(made.socketTokens == ["a"])
}

@MainActor @Test func aNewDeviceSignsInAnonymouslyOnceInFront() async throws {
  let made = try await Made()
  #expect(made.session.phase == .starting)
  #expect(made.session.userID == nil)
  #expect(throws: NotSignedIn.self) { try made.session.current.credentials() }

  made.session.cameToFront()
  #expect(await eventually { made.session.phase == .signedIn })
  #expect(made.session.userID == "anon-1")
  #expect(try made.keychain.kept() == StoredSession(token: "anon-token-1", userID: "anon-1"))
  #expect(await eventually { made.socketTokens == ["anon-token-1"] })
  #expect(made.owner == "anon-1")
}

@MainActor @Test func aKeptSessionItCannotReadIsNoSession() async throws {
  let made = try await Made(kept: Data("raw-token".utf8), owner: "old")
  #expect(made.session.phase == .starting)

  made.session.cameToFront()
  #expect(await eventually { made.session.phase == .signedIn })
  #expect(made.session.userID == "anon-1")
  #expect(try made.keychain.kept() == StoredSession(token: "anon-token-1", userID: "anon-1"))
  // No session can send what the user before left, so it goes.
  #expect(await eventually { made.owner == "anon-1" })
  #expect(made.coworkers == 0)
}

@MainActor @Test func aKeychainItCannotReachIsWaitedForNotSignedInAnew() async throws {
  let kept = try JSONEncoder().encode(StoredSession(token: "a", userID: "A"))
  let own = MemoryStore(kept)
  own.refusesToRead.withLock { $0 = true }
  let made = try await Made(keychain: SessionKeychain(own: own, leftBehind: MemoryStore()))
  #expect(made.session.phase == .starting)

  made.session.cameToFront()
  #expect(await eventually { own.reads.withLock { $0 } == 2 })
  own.refusesToRead.withLock { $0 = false }
  made.session.cameToFront()
  #expect(await eventually { made.session.userID == "A" })
  #expect(made.server.made.withLock { $0 } == 0)
}

@MainActor @Test func nothingConnectsWhileTheAccountSwitchesAndOnlyTheAccountAfter() async throws {
  let made = try await Made.signedIn(as: "a", "A")
  #expect(await eventually { made.owner == "A" })
  try await made.addCoworker()
  made.session.cameToFront()
  #expect(await eventually { made.sockets.asked > 0 })
  let before = try made.session.current.credentials()
  let seen = made.sockets.asked
  let gate = made.server.hold("signInApple")

  let switching = Task { try await made.session.useAccount(appleIDToken: "id", nonce: "n") }
  #expect(await eventually { made.session.phase == .changing })
  // The app coming to the front, a badge, a place opened and the app
  // going to the background, all while it switches.
  made.session.cameToFront()
  await made.session.catchUp(within: .milliseconds(50))
  let hold = await made.session.hold("g1")
  await made.session.wentToBack()
  made.session.cameToFront()
  try await Task.sleep(for: .milliseconds(200))
  #expect(made.sockets.asked == seen)
  #expect(throws: NotSignedIn.self) { try made.session.current.credentials() }
  #expect(!before.isCurrent)
  #expect(throws: AccountChanged.self) { try before.whileCurrent {} }
  #expect(made.coworkers == 1)

  gate.open()
  try await switching.value
  #expect(made.session.phase == .signedIn)
  #expect(made.session.userID == "account")
  #expect(made.shared.string(forKey: "userID") == "account")
  #expect(made.coworkers == 0)
  #expect(try made.keychain.kept() == StoredSession(token: "account-token", userID: "account"))
  #expect(await eventually { made.owner == "account" })
  // The user's socket in front, and a place a screen of the account holds
  // now, open as the account; a hold taken as the account was changing
  // may have gone with the user before's places, as the screens hold
  // theirs anew (OpenPlaceSocket).
  let place = await made.session.hold("g2")
  #expect(await eventually { made.sockets.asked >= seen + 2 })
  #expect(made.sockets.tokens.withLock { $0.dropFirst(seen).allSatisfy { $0 == "account-token" } })
  await made.session.release(place, of: "g2")
  // The user left behind is deleted, and forgotten.
  #expect(await eventually { made.server.asked.withLock(\.deleted) == ["a"] })
  #expect(await eventually { made.keychain.leftBehindToken() == nil })
  await made.session.release(hold, of: "g1")
}

@MainActor @Test func aSwitchWhoseEraseFailsLeavesTheDeviceAsItWas() async throws {
  let made = try await Made.signedIn(as: "a", "A")
  #expect(await eventually { made.owner == "A" })
  try await made.addCoworker()
  try await made.database.write { db in
    try db.execute(
      sql: #"CREATE TRIGGER "keep" BEFORE DELETE ON "coworkers" BEGIN SELECT RAISE(ABORT, 'kept'); END"#)
  }
  var erased = 0
  made.session.onErase = { erased += 1 }

  await #expect(throws: (any Error).self) {
    try await made.session.useAccount(appleIDToken: "id", nonce: "n")
  }
  #expect(made.session.phase == .signedIn)
  #expect(made.session.userID == "A")
  #expect(made.coworkers == 1)
  #expect(made.owner == "A")
  #expect(erased == 0)
  #expect(try made.keychain.kept() == StoredSession(token: "a", userID: "A"))
  #expect(made.keychain.leftBehindToken() == nil)
  #expect(made.server.asked.withLock(\.deleted).isEmpty)
  made.session.cameToFront()
  #expect(await eventually { made.socketTokens == ["a"] })
}

@MainActor @Test func aSignOutTheServerRefusesChangesNothing() async throws {
  let made = try await Made.signedIn(as: "a", "A")
  #expect(await eventually { made.owner == "A" })
  try await made.addCoworker()
  made.server.refusing.withLock { $0 = ["signOut"] }
  await #expect(throws: Refused.self) { try await made.session.signOut() }
  #expect(made.session.phase == .signedIn)
  #expect(made.session.userID == "A")
  #expect(made.coworkers == 1)
  #expect(try made.keychain.kept() == StoredSession(token: "a", userID: "A"))
}

@MainActor @Test func signingOutErasesTheDeviceAndStartsAfresh() async throws {
  let made = try await Made.signedIn(as: "a", "A")
  #expect(await eventually { made.owner == "A" })
  try await made.addCoworker()
  var erased = 0
  made.session.onErase = { erased += 1 }

  try await made.session.signOut()
  // What waited went first, on the session signing out.
  #expect(made.socketTokens == ["a"])
  #expect(made.server.asked.withLock(\.signedOut) == ["a"])
  #expect(made.session.userID == nil)
  #expect(made.shared.string(forKey: "userID") == nil)
  #expect(await eventually { made.session.phase == .starting })
  #expect(made.coworkers == 0)
  #expect(erased == 1)
  #expect(try made.keychain.kept() == nil)

  made.session.cameToFront()
  #expect(await eventually { made.session.userID == "anon-1" })
  #expect(await eventually { made.owner == "anon-1" })
  #expect(await eventually { made.socketTokens == ["a", "anon-token-1"] })
}

@MainActor @Test func deletingTheAccountErasesTheDeviceAndStartsAfreshInFront() async throws {
  let made = try await Made.signedIn(as: "a", "A")
  made.session.cameToFront()
  #expect(await eventually { made.sockets.asked > 0 })
  try await made.addCoworker()

  try await made.session.deleteAccount(appleAuthorizationCode: "code")
  #expect(made.server.asked.withLock(\.deleted) == ["a"])
  #expect(await eventually { made.session.userID == "anon-1" })
  #expect(made.coworkers == 0)
  #expect(await eventually { made.socketTokens == ["a", "anon-token-1"] })
}

@MainActor @Test func anAnswerForTheAccountBeforeIsDropped() async throws {
  let made = try await Made.signedIn(as: "a", "A")
  #expect(await eventually { made.owner == "A" })
  let gate = made.server.hold("me")
  let asking = Task { await made.session.linked() }
  #expect(await eventually { made.server.asked.withLock(\.me) == 1 })
  try await made.session.signOut()
  gate.open()
  #expect(await asking.value == nil)
}


@MainActor @Test func dataAnotherUserLeftIsErasedBeforeAnySocketOpens() async throws {
  let made = try await Made(
    kept: JSONEncoder().encode(StoredSession(token: "a", userID: "A")), owner: "Z")
  made.session.cameToFront()
  #expect(await eventually { made.sockets.asked > 0 })
  #expect(made.owner == "A")
  #expect(made.coworkers == 0)
  let waiting = try await made.database.read { try Sync.lastWaiting(in: $0) }
  #expect(waiting == nil)
  #expect(made.socketTokens == ["a"])
}

@MainActor @Test func aSignOutWhoseEraseFailsShowsNothingAndSignsInOnlyOnceErased() async throws {
  let made = try await Made.signedIn(as: "a", "A")
  #expect(await eventually { made.owner == "A" })
  try await made.addCoworker()
  try await made.database.write { db in
    try db.execute(
      sql: #"CREATE TRIGGER "keep" BEFORE DELETE ON "coworkers" BEGIN SELECT RAISE(ABORT, 'kept'); END"#)
  }
  made.session.cameToFront()

  // The session ended on the server: signed out, whatever the device does.
  try await made.session.signOut()
  #expect(made.server.asked.withLock(\.signedOut) == ["a"])
  #expect(made.session.phase == .erasing)
  #expect(made.session.erasing?.why == .signedOut)
  #expect(made.session.userID == nil)
  #expect(await eventually { made.session.erasing?.failed == true })
  #expect(made.coworkers == 1)
  try await Task.sleep(for: .milliseconds(200))
  #expect(made.server.made.withLock { $0 } == 0)
  #expect(made.session.phase == .erasing)

  try await made.database.write { try $0.execute(sql: #"DROP TRIGGER "keep""#) }
  made.session.eraseAgain()
  #expect(await eventually { made.session.erasing == nil })
  #expect(made.coworkers == 0)
  #expect(await eventually { made.session.userID == "anon-1" })
  #expect(await eventually { made.owner == "anon-1" })
}

@MainActor @Test func theSessionThatEndedIsNeverSignedInAsAgainEvenAfterARelaunch() async throws {
  let made = try await Made.signedIn(as: "a", "A")
  #expect(await eventually { made.owner == "A" })
  let own = try #require(made.keychain.own as? MemoryStore)
  own.refusesToForget.withLock { $0 = true }
  made.session.cameToFront()

  try await made.session.deleteAccount(appleAuthorizationCode: "code")
  #expect(made.session.phase == .erasing)
  #expect(await eventually { made.session.erasing?.failed == true })
  // The Keychain still has it, but it is not signed in as.
  #expect(try made.keychain.kept() == StoredSession(token: "a", userID: "A"))

  // The app ends and starts again meanwhile: still erasing, as no one.
  let again = AccountSession(
    database: made.database, server: made.server, keychain: made.keychain, shared: made.shared,
    eraseFiles: {})
  #expect(again.phase == .erasing)
  #expect(again.erasing?.why == .deleted)
  #expect(again.userID == nil)
  #expect(throws: NotSignedIn.self) { try again.current.credentials() }
  again.cameToFront()

  own.refusesToForget.withLock { $0 = false }
  again.eraseAgain()
  #expect(await eventually { again.userID == "anon-1" })
  #expect(try made.keychain.kept() == StoredSession(token: "anon-token-1", userID: "anon-1"))
}

@MainActor @Test func aPlaceHeldBeforeTheAccountChangedIsNotOpenedAfter() async throws {
  let made = try await Made.signedIn(as: "a", "A")
  made.session.cameToFront()
  _ = await made.session.hold("theirs")
  #expect(await eventually { made.sockets.asked >= 2 })
  let seen = made.sockets.asked

  try await made.session.useAccount(appleIDToken: "id", nonce: "n")
  // Only the user's own socket, as the account: the place was the user before's.
  #expect(await eventually { made.sockets.asked > seen })
  try await Task.sleep(for: .milliseconds(300))
  #expect(made.sockets.asked == seen + 1)
  #expect(made.sockets.tokens.withLock { $0.last } == "account-token")
}

@MainActor @Test func aSessionTheServerDoesNotKnowKeepsTheDataUntilThePersonChooses() async throws {
  let made = try await Made.signedIn(as: "a", "A", socketStatus: "401 Unauthorized")
  #expect(await eventually { made.owner == "A" })
  try await made.addCoworker()
  made.session.cameToFront()
  #expect(await eventually { made.session.phase == .ended })
  // Nothing is cleared, nothing goes as the session, and coming to the
  // front again does not try it.
  #expect(made.session.userID == "A")
  #expect(made.coworkers == 1)
  #expect(try made.keychain.kept() == StoredSession(token: "a", userID: "A"))
  #expect(throws: NotSignedIn.self) { try made.session.current.credentials() }
  let seen = made.sockets.asked
  made.session.cameToFront()
  try await Task.sleep(for: .milliseconds(200))
  #expect(made.sockets.asked == seen)
  #expect(made.server.made.withLock { $0 } == 0)

  // もう一度つなぐ tries it again, and it ends again.
  made.session.tryAgain()
  #expect(await eventually { made.sockets.asked > seen })
  #expect(await eventually { made.session.phase == .ended })
  #expect(made.coworkers == 1)

  // はじめから使う lets it go, with what the device holds.
  made.session.startAfresh()
  #expect(await eventually { made.session.userID == "anon-1" })
  #expect(made.coworkers == 0)
  #expect(try made.keychain.kept() == StoredSession(token: "anon-token-1", userID: "anon-1"))
}

@MainActor @Test func aSessionTheServerKnowsAgainSyncsAgainOnTryingAgain() async throws {
  let refusing = try await Made.signedIn(as: "a", "A", socketStatus: "401 Unauthorized")
  refusing.session.cameToFront()
  #expect(await eventually { refusing.session.phase == .ended })
  refusing.sockets.listener.cancel()
  // The same session, tried again, is signed in as again.
  refusing.session.tryAgain()
  #expect(await eventually { refusing.session.phase == .signedIn })
  #expect(refusing.session.userID == "A")
}

/// An invitation opened from a link as the app first launches: its call
/// waits for the anonymous sign-in rather than going as no one.
@MainActor @Test func aCallMadeWhileSigningInGoesOnceSignedIn() async throws {
  let made = try await Made()
  let calls = GroupCalls(current: made.session.current)
  let asking = Task { try await calls.headers() }
  try await Task.sleep(for: .milliseconds(100))
  made.session.cameToFront()
  #expect(try await asking.value == ["Authorization": ["Bearer anon-token-1"]])
}

@Test func aCallWaitsForSigningInOnlySoLong() async throws {
  let current = CurrentAccount()
  await #expect(throws: NotSignedIn.self) {
    try await current.signedIn(within: .milliseconds(50))
  }
  let cancelled = Task { try await current.signedIn(within: .seconds(10)) }
  cancelled.cancel()
  await #expect(throws: CancellationError.self) { try await cancelled.value }
  current.begin(StoredSession(token: "t", userID: "u"))
  #expect(try await current.signedIn(within: .zero).userID == "u")
}

@Test func aCallFailsAtOnceWhileTheAccountChangesOrIsErased() async throws {
  let current = CurrentAccount()
  // Waiting while signing in, and failed as the account closes.
  let waiting = Task { try await current.signedIn(within: .seconds(10)) }
  try await Task.sleep(for: .milliseconds(50))
  current.begin(nil)
  await #expect(throws: NotSignedIn.self) { try await waiting.value }

  // Closed: no wait at all, however long it was given.
  let clock = ContinuousClock()
  let started = clock.now
  await #expect(throws: NotSignedIn.self) { try await current.signedIn(within: .seconds(10)) }
  #expect(clock.now - started < .seconds(1))

  // Signing in again: calls wait for it once more.
  current.signingIn()
  let again = Task { try await current.signedIn(within: .seconds(10)) }
  try await Task.sleep(for: .milliseconds(50))
  current.begin(StoredSession(token: "t", userID: "u"))
  #expect(try await again.value.userID == "u")
}

@MainActor @Test func callsFailAtOnceWhileErasingAfterSigningOut() async throws {
  let made = try await Made.signedIn(as: "a", "A")
  #expect(await eventually { made.owner == "A" })
  let own = try #require(made.keychain.own as? MemoryStore)
  own.refusesToForget.withLock { $0 = true }
  try await made.session.signOut()
  #expect(made.session.phase == .erasing)
  let calls = GroupCalls(current: made.session.current)
  let clock = ContinuousClock()
  let started = clock.now
  await #expect(throws: NotSignedIn.self) { try await calls.headers() }
  #expect(clock.now - started < .seconds(1))
}
