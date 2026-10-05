import Foundation
import Synchronization
import Testing

@testable import PochicalKit

/// A token store in memory, for tests.
private final class MemoryStore: TokenStore {
  private let kept = Mutex<String?>(nil)

  init(_ token: String? = nil) {
    kept.withLock { $0 = token }
  }

  func token() -> String? { kept.withLock { $0 } }
  func keep(_ token: String) { kept.withLock { $0 = token } }
}

/// What a fake server was asked, and answers sign-ins with `token`.
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
      // Long enough for callers at the same time to meet one sign-in.
      try await Task.sleep(for: .milliseconds(20))
      let headers = self.token.map { ["set-auth-token": $0] } ?? [:]
      let response = HTTPURLResponse(
        url: request.url!, statusCode: self.status, httpVersion: nil, headerFields: headers)!
      return (Data("{}".utf8), response)
    }
  }
}

private let server = URL(string: "http://localhost:8787")!

@Test func signsInAnonymouslyAndKeepsTheToken() async throws {
  let store = MemoryStore()
  let fake = FakeServer()
  let account = Account(server: server, store: store, send: fake.send)
  #expect(try await account.token() == "made")
  #expect(store.token() == "made")
  let request = try #require(fake.requests.withLock { $0.first })
  #expect(request.url?.absoluteString == "http://localhost:8787/api/auth/sign-in/anonymous")
  #expect(request.httpMethod == "POST")
  #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
  #expect(request.httpBody == Data("{}".utf8))
  #expect(try await account.headers() == ["Authorization": ["Bearer made"]])
}

@Test func aKeptTokenIsNeverReplaced() async throws {
  let fake = FakeServer()
  let account = Account(server: server, store: MemoryStore("kept"), send: fake.send)
  #expect(try await account.token() == "kept")
  #expect(fake.requests.withLock { $0.isEmpty })
}

@Test func callersAtTheSameTimeMakeOneUser() async throws {
  let fake = FakeServer()
  let account = Account(server: server, store: MemoryStore(), send: fake.send)
  async let first = account.token()
  async let second = account.token()
  #expect(try await [first, second] == ["made", "made"])
  #expect(fake.requests.withLock { $0.count } == 1)
}

@Test func aRefusedSignInKeepsNothing() async throws {
  let store = MemoryStore()
  let account = Account(server: server, store: store, send: FakeServer(status: 429).send)
  await #expect(throws: SignInError.self) { try await account.token() }
  #expect(store.token() == nil)
}
