import Foundation
import Synchronization
import Testing

@testable import PochicalKit

/// A server taking push tokens: each under the user signed in as it was
/// sent, or refusing them all while `refusing`.
private final class TokenServer: Sendable {
  let user = Mutex<String?>(nil)
  let refusing = Mutex(false)
  let sent = Mutex<[String]>([])

  func register(_ token: Data) throws {
    if refusing.withLock({ $0 }) { throw URLError(.notConnectedToInternet) }
    let user = user.withLock { $0 } ?? "nobody"
    sent.withLock { $0.append("\(user) \(String(decoding: token, as: UTF8.self))") }
  }

  var taken: [String] { sent.withLock { $0 } }
}

@MainActor private func tokens(_ server: TokenServer) -> PushTokens {
  PushTokens { try server.register($0) }
}

@MainActor private func signIn(_ id: String?, _ tokens: PushTokens, _ server: TokenServer) async {
  server.user.withLock { $0 = id }
  tokens.user(id)
  await tokens.settled()
}

@MainActor @Test func theTokenGoesOnceSignedInWithNotificationsAllowed() async {
  let server = TokenServer()
  let tokens = tokens(server)
  tokens.took(Data("t1".utf8))
  tokens.allowed(true)
  await tokens.settled()
  #expect(server.taken.isEmpty, "not before signing in")
  await signIn("u1", tokens, server)
  #expect(server.taken == ["u1 t1"])
}

@MainActor @Test func aNewTokenAndAnotherUserSendItAgain() async {
  let server = TokenServer()
  let tokens = tokens(server)
  await signIn("u1", tokens, server)
  tokens.allowed(true)
  tokens.took(Data("t1".utf8))
  await tokens.settled()
  tokens.took(Data("t1".utf8))
  tokens.took(Data("t2".utf8))
  await tokens.settled()
  // Signing out goes on as a new user, whose session the token moves to.
  await signIn(nil, tokens, server)
  await signIn("u2", tokens, server)
  #expect(server.taken == ["u1 t1", "u1 t2", "u2 t2"])
}

@MainActor @Test func nothingGoesWhileNotificationsAreNotAllowed() async {
  let server = TokenServer()
  let tokens = tokens(server)
  await signIn("u1", tokens, server)
  tokens.took(Data("t1".utf8))
  await tokens.settled()
  #expect(server.taken.isEmpty)
  tokens.allowed(true)
  await tokens.settled()
  #expect(server.taken == ["u1 t1"])
}

@MainActor @Test func oneTheServerDidNotTakeGoesAgainInTheForeground() async {
  let server = TokenServer()
  let tokens = tokens(server)
  server.refusing.withLock { $0 = true }
  await signIn("u1", tokens, server)
  tokens.allowed(true)
  tokens.took(Data("t1".utf8))
  await tokens.settled()
  server.refusing.withLock { $0 = false }
  tokens.foreground()
  await tokens.settled()
  tokens.foreground()
  await tokens.settled()
  #expect(server.taken == ["u1 t1"], "once taken, not again")
}

@MainActor @Test func aSendForTheUserBeforeIsCancelledByTheNext() async {
  let server = TokenServer()
  let ended = AsyncStream<Void>.makeStream()
  let hang = AsyncStream<Void>.makeStream()
  let first = Mutex(true)
  // The first send hangs until it is cancelled, as a slow one would, and
  // goes on after its wait only if it was not.
  let tokens = PushTokens { token in
    if first.withLock({ was in defer { was = false }; return was }) {
      defer { ended.continuation.yield() }
      for await _ in hang.stream {}
      try Task.checkCancellation()
    }
    try server.register(token)
  }
  tokens.allowed(true)
  tokens.took(Data("t1".utf8))
  server.user.withLock { $0 = "u1" }
  tokens.user("u1")
  await signIn("u2", tokens, server)
  for await _ in ended.stream { break }
  #expect(server.taken == ["u2 t1"])
  hang.continuation.finish()
}
