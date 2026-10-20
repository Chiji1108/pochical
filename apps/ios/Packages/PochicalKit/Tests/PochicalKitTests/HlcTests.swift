import Testing

@testable import PochicalKit

// ahead is the server's to check.
struct HlcVectors: Decodable, Sendable {
  struct Compare: VectorCase {
    let name: String
    let a: Clock
    let b: Clock
    let expected: Int
  }

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

  let compare: [Compare]
  let tick: [Tick]
  let receive: [Receive]
  let offset: [Offset]
}

@Test(arguments: try vectors("hlc", as: HlcVectors.self).compare)
func compare(_ vector: HlcVectors.Compare) {
  let order = vector.a < vector.b ? -1 : vector.b < vector.a ? 1 : 0
  #expect(order == vector.expected)
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
