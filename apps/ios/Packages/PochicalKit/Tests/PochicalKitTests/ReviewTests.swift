import PochicalKit
import Testing

struct ReviewVectors: Decodable {
  struct Asked: Decodable, Sendable {
    let day: String
    let version: String
  }

  struct Case: VectorCase {
    let name: String
    let opened: [String]
    let lastAsked: Asked?
    let version: String
    let troubled: Bool
    let expected: Bool
  }

  let mayAsk: [Case]
}

@Test(arguments: try vectors("review", as: ReviewVectors.self).mayAsk)
func mayAskForAReview(_ vector: ReviewVectors.Case) throws {
  var history: ReviewHistory?
  for key in vector.opened {
    history = ReviewHistory.opened(history, on: try #require(Day(key)))
  }
  var kept = try #require(history)
  if let asked = vector.lastAsked {
    kept.lastAsked = ReviewHistory.Ask(day: try #require(Day(asked.day)), version: asked.version)
  }
  let today = try #require(vector.opened.last.flatMap(Day.init))
  #expect(kept.mayAsk(today: today, version: vector.version, troubled: vector.troubled) == vector.expected)
}
