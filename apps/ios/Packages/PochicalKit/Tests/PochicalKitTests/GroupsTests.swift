import Foundation
import Testing

@testable import PochicalKit

struct GroupVectors: Decodable, Sendable {
  struct GuessCase: VectorCase {
    /// The mark's one kind: `emoji`, or `letter` with its `color`.
    struct Mark: Decodable, Sendable {
      let emoji: String?
      let letter: String?
      let color: Int?
    }

    let name: String
    let text: String
    let color: Int
    let expected: Mark
  }

  struct OpenedCase: VectorCase {
    let url: String
    let expected: String?
    var name: String { url }
  }

  struct MemberLineCase: VectorCase {
    let name: String
    let names: [String]
    let expected: String
  }

  let guessMark: [GuessCase]
  let openedInviteCode: [OpenedCase]
  let memberLine: [MemberLineCase]
}

@Test(arguments: try vectors("groups", as: GroupVectors.self).guessMark)
func aGroupsMarkGuessedFromTheName(_ vector: GroupVectors.GuessCase) throws {
  let expected =
    if let emoji = vector.expected.emoji {
      GroupMarkValue(emoji: emoji)
    } else {
      GroupMarkValue(
        letter: try #require(vector.expected.letter), color: try #require(vector.expected.color))
    }
  #expect(guessedMark(for: vector.text, color: vector.color) == expected)
}

@Test(arguments: try vectors("groups", as: GroupVectors.self).openedInviteCode)
func theCodeALinkOpeningTheAppCarries(_ vector: GroupVectors.OpenedCase) throws {
  let url = try #require(URL(string: vector.url))
  #expect(openedInviteCode(of: url) == vector.expected)
}

@Test(arguments: try vectors("groups", as: GroupVectors.self).memberLine)
func whoIsInAGroupAsItsJoinScreenNamesThem(_ vector: GroupVectors.MemberLineCase) {
  #expect(memberLine(vector.names) == vector.expected)
}
