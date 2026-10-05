import Testing

@testable import PochicalKit

// compare and ahead are the server's to check.
struct HlcVectors: Decodable, Sendable {
  struct Tick: VectorCase {
    let name: String
    let last: HlcTime
    let now: Int64
    let expected: HlcTime
  }

  struct Receive: VectorCase {
    let name: String
    let last: HlcTime
    let remote: HlcTime
    let expected: HlcTime
  }

  struct Offset: VectorCase {
    let name: String
    let sentMs: Int64
    let receivedMs: Int64
    let serverMs: Int64
    let expected: Int64
  }

  let tick: [Tick]
  let receive: [Receive]
  let offset: [Offset]
}

@Test(arguments: try vectors("hlc", as: HlcVectors.self).tick)
func tick(_ vector: HlcVectors.Tick) {
  #expect(vector.last.tick(now: vector.now) == vector.expected)
}

@Test(arguments: try vectors("hlc", as: HlcVectors.self).receive)
func receive(_ vector: HlcVectors.Receive) {
  #expect(vector.last.receiving(vector.remote) == vector.expected)
}

@Test(arguments: try vectors("hlc", as: HlcVectors.self).offset)
func offset(_ vector: HlcVectors.Offset) {
  let offset = clockOffset(
    sentMs: vector.sentMs, receivedMs: vector.receivedMs, serverMs: vector.serverMs)
  #expect(offset == vector.expected)
}
