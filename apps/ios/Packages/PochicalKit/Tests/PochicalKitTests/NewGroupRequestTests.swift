import Testing

@testable import PochicalKit

private let letter = GroupMarkValue(letter: "家", color: 1)

private func asking(
  _ name: String = "家族", mark: GroupMarkValue = letter, as displayName: String = "さくら",
  after last: NewGroupRequest?
) -> NewGroupRequest {
  NewGroupRequest.asking(
    name: name, mark: mark, displayName: displayName, after: last, newID: { "new" })
}

@Test func aFirstRequestTakesANewID() {
  #expect(asking(after: nil).id == "new")
}

@Test func aRetryAskingTheSameIsTheSameRequest() {
  let sent = NewGroupRequest(name: "家族", mark: letter, displayName: "さくら", id: "sent")
  #expect(asking(after: sent) == sent)
}

@Test(arguments: [
  ("name", asking("家", after: nil)),
  ("mark", asking(mark: GroupMarkValue(letter: "家", color: 2), after: nil)),
  ("displayName", asking(as: "ゆかり", after: nil)),
])
func anythingChangedIsANewRequest(_ changed: String, _ expected: NewGroupRequest) {
  let sent = NewGroupRequest(name: "家族", mark: letter, displayName: "さくら", id: "sent")
  let next = asking(expected.name, mark: expected.mark, as: expected.displayName, after: sent)
  #expect(next.id == "new", "\(changed)")
  #expect(next == expected)
}

private struct GroupVectors: Decodable {
  struct ColorCase: VectorCase {
    struct Mark: Decodable, Sendable {
      let kind: String
      let color: Int?
    }

    let name: String
    let marks: [Mark]
    let expected: Int
  }

  let nextGroupColor: [ColorCase]
}

@Test(arguments: try vectors("groups", as: GroupVectors.self).nextGroupColor)
private func aGroupsColor(_ vector: GroupVectors.ColorCase) {
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
