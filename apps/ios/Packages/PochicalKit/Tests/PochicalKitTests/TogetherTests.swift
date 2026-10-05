import Testing

@testable import PochicalKit

struct TogetherVectors: Decodable, Sendable {
  struct Case: VectorCase {
    struct Member: Decodable, Sendable {
      let days: [String: String]
    }

    struct Expected: Decodable, Sendable {
      let days: [String]
      let unsure: Bool
    }

    let name: String
    let members: [Member]
    let from: String
    let to: String
    let expected: Expected
  }

  let together: [Case]
}

@Test(arguments: try vectors("together", as: TogetherVectors.self).together)
func daysEveryoneIsOff(_ vector: TogetherVectors.Case) throws {
  let members = vector.members.map { member in
    Dictionary(
      uniqueKeysWithValues: member.days.compactMap { date, kind in
        Day(date).map { ($0, kind == "off") }
      })
  }
  let from = try #require(Day(vector.from))
  let through = try #require(Day(vector.to))
  let result = Together.days(members, from: from, through: through)
  #expect(result.days.map(\.key) == vector.expected.days)
  #expect(result.unsure == vector.expected.unsure)
}
