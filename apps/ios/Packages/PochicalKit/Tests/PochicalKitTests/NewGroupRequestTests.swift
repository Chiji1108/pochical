import Testing

@testable import PochicalKit

private let letter = GroupMarkValue(letter: "家", color: 1)

private func asking(
  _ name: String = "家族", mark: GroupMarkValue = letter, as displayName: String = "さくら",
  endsAtMs: Int64 = 0, after last: NewGroupRequest?
) -> NewGroupRequest {
  NewGroupRequest.asking(
    name: name, mark: mark, displayName: displayName, endsAtMs: endsAtMs, after: last,
    newID: { "new" })
}

private let sent = NewGroupRequest(
  name: "家族", mark: letter, displayName: "さくら", endsAtMs: 0, id: "sent")

@Test func aFirstRequestTakesANewID() {
  #expect(asking(after: nil).id == "new")
}

@Test func aRetryAskingTheSameIsTheSameRequest() {
  #expect(asking(after: sent) == sent)
}

@Test(arguments: [
  ("name", asking("家", after: nil)),
  ("mark", asking(mark: GroupMarkValue(letter: "家", color: 2), after: nil)),
  ("displayName", asking(as: "ゆかり", after: nil)),
  ("endsAtMs", asking(endsAtMs: 1_798_729_200_000, after: nil)),
])
func anythingChangedIsANewRequest(_ changed: String, _ expected: NewGroupRequest) {
  let next = asking(
    expected.name, mark: expected.mark, as: expected.displayName, endsAtMs: expected.endsAtMs,
    after: sent)
  #expect(next.id == "new", "\(changed)")
  #expect(next == expected)
}
