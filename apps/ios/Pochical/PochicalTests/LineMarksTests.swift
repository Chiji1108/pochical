import Testing

@testable import Pochical

/// What the reader's own reactions leave to be felt (spec/haptics.md):
/// one light haptic for each put on, none for one taken back. Others'
/// reactions come from the chat's rows and never pass through LineMarks.
@MainActor struct LineMarksTests {
  @Test func puttingAReactionOnIsFeltOnce() {
    let marks = LineMarks()
    marks.chose("👍", on: "line", true)
    #expect(marks.reacted == 1)
    marks.chose("❤️", on: "line", true)
    #expect(marks.reacted == 2)
  }

  @Test func takingOnesOwnBackIsNotFelt() {
    let marks = LineMarks()
    marks.chose("👍", on: "line", true)
    marks.chose("👍", on: "line", false)
    #expect(marks.reacted == 1)
  }
}
