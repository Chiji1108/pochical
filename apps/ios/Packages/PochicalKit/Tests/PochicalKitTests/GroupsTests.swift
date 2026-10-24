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

  struct ColorCase: VectorCase {
    struct Mark: Decodable, Sendable {
      let kind: String
      let color: Int?
    }

    let name: String
    let marks: [Mark]
    let expected: Int
  }

  struct OpenedCase: VectorCase {
    let url: String
    let expected: String?
    var name: String { url }
  }

  let guessMark: [GuessCase]
  let nextGroupColor: [ColorCase]
  let openedInviteCode: [OpenedCase]
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

@Test(arguments: try vectors("groups", as: GroupVectors.self).nextGroupColor)
func aGroupsColor(_ vector: GroupVectors.ColorCase) {
  let marks = vector.marks.map { mark in
    switch mark.kind {
    case "icon": GroupMarkValue(icon: "house", color: mark.color ?? 0)
    case "letter": GroupMarkValue(letter: "家", color: mark.color ?? 0)
    case "photo": GroupMarkValue(photoID: "photo")
    default: GroupMarkValue(emoji: "🏠")
    }
  }
  #expect(nextGroupColor(marks, slots: 12) == vector.expected)
}

@Test(arguments: try vectors("groups", as: GroupVectors.self).openedInviteCode)
func theCodeALinkOpeningTheAppCarries(_ vector: GroupVectors.OpenedCase) throws {
  let url = try #require(URL(string: vector.url))
  #expect(openedInviteCode(of: url) == vector.expected)
}
