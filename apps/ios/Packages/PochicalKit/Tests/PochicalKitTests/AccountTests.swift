import Connect
import Foundation
import PochicalProto
import SQLiteData
import Synchronization
import Testing

@testable import PochicalKit

/// A token store in memory, for tests, whose forgetting fails while
/// `refusesToForget` is set, as the Keychain's may.
final class MemoryStore: TokenStore {
  private let kept = Mutex<Data?>(nil)
  let refusesToForget = Mutex(false)
  /// As a Keychain before the phone's first unlock.
  let refusesToRead = Mutex(false)
  let reads = Mutex(0)

  init(_ data: Data? = nil) {
    kept.withLock { $0 = data }
  }

  func data() throws -> Data? {
    reads.withLock { $0 += 1 }
    if refusesToRead.withLock({ $0 }) { throw KeychainError(status: errSecInteractionNotAllowed) }
    return kept.withLock { $0 }
  }
  func replace(with data: Data) { kept.withLock { $0 = data } }

  func forget() throws {
    if refusesToForget.withLock({ $0 }) { throw KeychainError(status: errSecInteractionNotAllowed) }
    kept.withLock { $0 = nil }
  }
}

/// What a fake server was asked, and answers sign-ins with `token` for
/// the user `userID`.
private final class FakeServer: Sendable {
  let requests = Mutex<[URLRequest]>([])
  let status: Int
  let token: String?

  init(status: Int = 200, token: String? = "made") {
    self.status = status
    self.token = token
  }

  var send: Account.Send {
    { request in
      self.requests.withLock { $0.append(request) }
      let headers = self.token.map { ["set-auth-token": $0] } ?? [:]
      let response = HTTPURLResponse(
        url: request.url!, statusCode: self.status, httpVersion: nil, headerFields: headers)!
      let body = #"{"token":"short","user":{"id":"user-\#(self.token ?? "")","isAnonymous":true}}"#
      return (Data(body.utf8), response)
    }
  }
}

private let server = URL(string: "http://localhost:8787")!

@Test func signsInAnonymouslyAsTheUserTheServerMade() async throws {
  let fake = FakeServer()
  let account = Account(server: server, send: fake.send)
  #expect(try await account.signInAnonymously() == StoredSession(token: "made", userID: "user-made"))
  let request = try #require(fake.requests.withLock { $0.first })
  #expect(request.url?.absoluteString == "http://localhost:8787/api/auth/sign-in/anonymous")
  #expect(request.httpMethod == "POST")
  #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
  #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
  #expect(request.httpBody == Data("{}".utf8))
  #expect(!request.httpShouldHandleCookies)
}

@Test func aRefusedSignInIsNoSession() async throws {
  for fake in [FakeServer(status: 429), FakeServer(token: nil)] {
    let account = Account(server: server, send: fake.send)
    await #expect(throws: SignInError.self) { try await account.signInAnonymously() }
  }
}

@Test func linksAppleOnTheSessionAndSaysWhenTheAccountIsInUse() async throws {
  for (status, said) in [(200, LinkResult.linked), (409, .inUse)] {
    let fake = FakeServer(status: status)
    let account = Account(server: server, send: fake.send)
    #expect(try await account.linkApple(idToken: "id-token", nonce: "raw", on: "kept") == said)
    let request = try #require(fake.requests.withLock { $0.first })
    #expect(request.url?.absoluteString == "http://localhost:8787/api/auth/link-social")
    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer kept")
    #expect(!request.httpShouldHandleCookies)
    let body = try #require(
      try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any])
    #expect(body["provider"] as? String == "apple")
    #expect(body["idToken"] as? [String: String] == ["nonce": "raw", "token": "id-token"])
  }
  let refused = Account(server: server, send: FakeServer(status: 401).send)
  await #expect(throws: LinkError.self) {
    try await refused.linkApple(idToken: "id-token", nonce: "raw", on: "kept")
  }
}

@Test func readsTheEmailAnIDTokenCarries() {
  // {"email":"a+b@privaterelay.appleid.com","sub":"001"}, base64url without padding.
  let body = Data(#"{"email":"a+b@privaterelay.appleid.com","sub":"001"}"#.utf8)
    .base64EncodedString().replacingOccurrences(of: "+", with: "-")
    .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  #expect(LinkedAccount.email(in: "head.\(body).signature") == "a+b@privaterelay.appleid.com")
  #expect(LinkedAccount.email(in: "not-a-token") == nil)
}

@Test func asksAppleWithTheNoncesSHA256() {
  let nonce = SignInNonce()
  #expect(nonce.raw.count == 64)
  #expect(nonce.hashed.count == 64)
  #expect(nonce.hashed != nonce.raw)
  #expect(SignInNonce().raw != nonce.raw)
}

@Test func signsInToTheAccountsUserOnTheDevicesSession() async throws {
  let fake = FakeServer(token: "theirs")
  let account = Account(server: server, send: fake.send)
  #expect(
    try await account.signInApple(idToken: "id-token", nonce: "raw", on: "anonymous")
      == StoredSession(token: "theirs", userID: "user-theirs"))
  let request = try #require(fake.requests.withLock { $0.first })
  #expect(request.url?.absoluteString == "http://localhost:8787/api/auth/sign-in/social")
  #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer anonymous")
  #expect(!request.httpShouldHandleCookies)
}

@Test func signingOutEndsTheSessionOnTheServer() async throws {
  let fake = FakeServer()
  try await Account(server: server, send: fake.send).signOut("kept")
  let request = try #require(fake.requests.withLock { $0.first })
  #expect(request.url?.absoluteString == "http://localhost:8787/api/auth/sign-out")
  #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer kept")
  await #expect(throws: SignInError.self) {
    try await Account(server: server, send: FakeServer(status: 401).send).signOut("kept")
  }
}

@Test func theSessionIsKeptWithItsUserAndReplacedWhole() throws {
  let keychain = SessionKeychain(own: MemoryStore(), leftBehind: MemoryStore())
  #expect(try keychain.kept() == nil)
  try keychain.keep(StoredSession(token: "t1", userID: "u1"))
  try keychain.keep(StoredSession(token: "t2", userID: "u2"))
  #expect(try keychain.kept() == StoredSession(token: "t2", userID: "u2"))
  try keychain.forget()
  #expect(try keychain.kept() == nil)
}

@Test func theUsualNameComesFromTheUsersSocketAndGoesWithTheirData() throws {
  let database = try appDatabase()
  try database.write { db in
    #expect(try Profile.name(in: db) == "")
    var change = Pochical_V1_Change()
    change.cursor = 1
    change.profile.name = "さくら"
    change.profile.photoID = "p1"
    try Groups.take(change, in: db)
    #expect(try Profile.usual(in: db) == UsualProfile(name: "さくら", photoID: "p1"))
    try LocalData.erase(in: db)
    #expect(try Profile.name(in: db) == "")
  }
}

/// Every table the database has, each decided: erased with the account,
/// or kept as the device's own. A table added fails this until it is put
/// in one list or the other (`LocalData.deviceTables`).
@Test func erasingTakesEveryTableButTheDevicesOwn() throws {
  let usersTables: Set = [
    "blocks", "chatDrafts", "chatLines", "chatMutes", "chatNotificationSettings", "chatOutbox",
    "coworkerOrder", "coworkers", "days", "groupCursors", "groupMembers", "groups", "memberDays",
    "memberOrders", "memberPatterns", "outbox", "patternOrder", "patterns", "preferences",
    "profile", "readMarks", "repeatOrders", "serverValues", "syncState", "unreadCounts",
  ]
  #expect(LocalData.deviceTables == ["grdb_migrations"])
  let database = try appDatabase()
  try database.write { db in
    #expect(Set(try LocalData.userTables(in: db)) == usersTables)
    #expect(try SyncState.claim(for: "u1", in: db))
    _ = try OwnValues.addCoworker(named: "佐藤", now: 1_000, in: db)
    try LocalData.erase(in: db)
    for table in usersTables {
      #expect(try Int.fetchOne(db, sql: "SELECT count(*) FROM \"\(table)\"") == 0, "\(table)")
    }
    #expect(try Int.fetchOne(db, sql: #"SELECT count(*) FROM "grdb_migrations""#) ?? 0 > 0)
    // No one's now: the next user claims it.
    #expect(try SyncState.claim(for: "u2", in: db))
    #expect(try !SyncState.claim(for: "u1", in: db))
  }
}

@Test func whatTheServerAnsweredADeletionWithIsWhyItFailed() {
  let offline = NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)
  let unreachable = NSError(domain: NSURLErrorDomain, code: NSURLErrorCannotConnectToHost)
  let timedOut = NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut)
  // Connect gives these .unknown, but no server answered either.
  let noDNS = NSError(domain: NSURLErrorDomain, code: NSURLErrorDNSLookupFailed)
  let cases: [(ConnectError, DeletionFailure)] = [
    (ConnectError(code: .unauthenticated, message: nil), .sessionEnded),
    (ConnectError(code: .failedPrecondition, message: "Apple did not take the code"), .appleRefused),
    (ConnectError(code: .unavailable, message: nil, exception: offline), .offline),
    (ConnectError(code: .unavailable, message: nil, exception: unreachable), .offline),
    (ConnectError(code: .deadlineExceeded, message: nil, exception: timedOut), .offline),
    (ConnectError(code: .unknown, message: nil, exception: noDNS), .offline),
    // Connect's own timeout.
    (ConnectError(code: .deadlineExceeded, message: "request exceeded allowed timeout"), .offline),
    (ConnectError(code: .canceled, message: nil, exception: URLError(.cancelled)), .serverFailed),
    // A 503 is the server's own answer, not the network's.
    (ConnectError(code: .unavailable, message: nil), .serverFailed),
    (ConnectError(code: .internalError, message: nil), .serverFailed),
    (ConnectError(code: .unknown, message: nil), .serverFailed),
  ]
  for (error, failure) in cases {
    #expect(DeletionFailure(error) == failure, "\(error.code)")
  }
}
