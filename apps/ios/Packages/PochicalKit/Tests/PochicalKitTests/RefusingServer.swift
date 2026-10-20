import Foundation
import Network
import Synchronization

/// A server on this Mac that refuses every socket with `status`: 401, as
/// the server does a session it does not know, or 403, a group the user is
/// not in; keeping the token each socket was asked with.
final class RefusingServer: Sendable {
  let listener: NWListener
  /// The bearer token of each socket asked for, in order.
  let tokens = Mutex<[String]>([])

  var asked: Int {
    tokens.withLock(\.count)
  }

  init(status: String = "401 Unauthorized") throws {
    listener = try NWListener(using: .tcp, on: .any)
    listener.newConnectionHandler = { [weak self] connection in
      connection.start(queue: .global())
      connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) {
        [weak self] data, _, _, _ in
        let request = String(decoding: data ?? Data(), as: UTF8.self)
        let token =
          request.split(separator: "\r\n")
          .first { $0.lowercased().hasPrefix("authorization: bearer ") }
          .map { String($0.dropFirst("authorization: bearer ".count)) } ?? ""
        self?.tokens.withLock { $0.append(token) }
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

/// Waits a while at most for `done`, checking every few milliseconds.
func eventually(
  isolation: isolated (any Actor)? = #isolation, _ done: () async -> Bool
) async -> Bool {
  for _ in 0..<500 {
    if await done() { return true }
    try? await Task.sleep(for: .milliseconds(10))
  }
  return false
}
