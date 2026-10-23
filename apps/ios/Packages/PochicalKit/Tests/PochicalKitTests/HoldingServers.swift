import Foundation
import Network
import PochicalProto
import Synchronization

/// A server on this Mac that takes each HTTP request and answers it with
/// `status` and `body` only once `answer` is called, so a load or an
/// upload is under way meanwhile.
final class HoldingServer: Sendable {
  let listener: NWListener
  private let response: Data
  private let held = Mutex<(answering: Bool, waiting: [NWConnection])>((false, []))
  /// The requests taken whole so far.
  let asked = Mutex(0)

  init(status: String, body: Data = Data()) throws {
    listener = try NWListener(using: .tcp, on: .any)
    response =
      Data("HTTP/1.1 \(status)\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n".utf8)
      + body
    listener.newConnectionHandler = { [weak self] connection in
      connection.start(queue: .global())
      self?.takeRequest(on: connection, read: Data())
    }
  }

  /// Reads the request whole (its head, then the bytes it says follow),
  /// then answers it, or holds it until `answer`.
  private func takeRequest(on connection: NWConnection, read: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) {
      [weak self] data, _, done, error in
      guard let self else { return }
      let read = read + (data ?? Data())
      guard Self.isWhole(read) || done || error != nil else {
        self.takeRequest(on: connection, read: read)
        return
      }
      self.asked.withLock { $0 += 1 }
      let now = self.held.withLock { held in
        if !held.answering { held.waiting.append(connection) }
        return held.answering
      }
      if now { self.send(on: connection) }
    }
  }

  private static func isWhole(_ read: Data) -> Bool {
    guard let end = read.range(of: Data("\r\n\r\n".utf8)) else { return false }
    let head = String(decoding: read[..<end.lowerBound], as: UTF8.self).lowercased()
    let length =
      head.split(separator: "\r\n").first { $0.hasPrefix("content-length:") }
      .flatMap { Int($0.dropFirst("content-length:".count).trimmingCharacters(in: .whitespaces)) }
      ?? 0
    return read.count - end.upperBound >= length
  }

  private func send(on connection: NWConnection) {
    connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
  }

  /// Answers the requests held, and every one after at once.
  func answer() {
    let waiting = held.withLock { held in
      held.answering = true
      defer { held.waiting = [] }
      return held.waiting
    }
    for connection in waiting { send(on: connection) }
  }

  func start() async throws -> URL {
    try await listening(listener)
  }
}

/// A place's socket server on this Mac that takes each socket's Hello and
/// says Welcome only once `welcome` is called, keeping the op ids of the
/// chat edits the sockets send after it.
final class WelcomingServer: Sendable {
  let listener: NWListener
  private let held = Mutex<(welcoming: Bool, waiting: [NWConnection])>((false, []))
  let sent = Mutex<[String]>([])
  /// How many sockets were opened.
  let opened = Mutex(0)

  init() throws {
    let parameters = NWParameters.tcp
    parameters.defaultProtocolStack.applicationProtocols.insert(
      NWProtocolWebSocket.Options(), at: 0)
    listener = try NWListener(using: parameters, on: .any)
    listener.newConnectionHandler = { [weak self] connection in
      self?.opened.withLock { $0 += 1 }
      connection.start(queue: .global())
      self?.take(on: connection, helloed: false)
    }
  }

  private func take(on connection: NWConnection, helloed: Bool) {
    connection.receiveMessage { [weak self] data, _, _, error in
      guard let self, error == nil else { return }
      if !helloed {
        let now = self.held.withLock { held in
          if !held.welcoming { held.waiting.append(connection) }
          return held.welcoming
        }
        if now { Self.sayWelcome(on: connection) }
      } else if let data, let frame = try? Pochical_V1_ClientFrame(serializedBytes: data),
        case .chatEdits(let edits) = frame.kind
      {
        self.sent.withLock { $0 += edits.edits.map(\.opID) }
      }
      self.take(on: connection, helloed: true)
    }
  }

  private static func sayWelcome(on connection: NWConnection) {
    var frame = Pochical_V1_ServerFrame()
    frame.welcome = Pochical_V1_Welcome()
    let binary = NWProtocolWebSocket.Metadata(opcode: .binary)
    connection.send(
      content: try? frame.serializedData(),
      contentContext: NWConnection.ContentContext(identifier: "welcome", metadata: [binary]),
      isComplete: true, completion: .contentProcessed { _ in })
  }

  /// Says Welcome on the sockets waiting for it, and at once on every one
  /// after.
  func welcome() {
    let waiting = held.withLock { held in
      held.welcoming = true
      defer { held.waiting = [] }
      return held.waiting
    }
    for connection in waiting { Self.sayWelcome(on: connection) }
  }

  func start() async throws -> URL {
    try await listening(listener)
  }
}

/// Starts `listener`, at the URL it is reached by.
func listening(_ listener: NWListener) async throws -> URL {
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
