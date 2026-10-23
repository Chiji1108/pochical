import Testing

@testable import Pochical

/// What the reader's own reactions leave to be felt (spec/haptics.md):
/// one light haptic for each put on by a touch, none for one taken back or
/// put on by a screen reader's action. Others' reactions come from the
/// chat's rows and never pass through LineMarks.
@MainActor struct LineMarksTests {
  @Test func puttingAReactionOnByATouchIsFeltOnce() {
    let marks = LineMarks()
    marks.chose("👍", on: "line", true, by: .touch)
    #expect(marks.reacted == 1)
    marks.chose("❤️", on: "line", true, by: .touch)
    #expect(marks.reacted == 2)
  }

  @Test func takingOnesOwnBackIsNotFelt() {
    let marks = LineMarks()
    marks.chose("👍", on: "line", true, by: .touch)
    marks.chose("👍", on: "line", false, by: .touch)
    #expect(marks.reacted == 1)
  }

  @Test func aScreenReadersActionIsNotFelt() {
    let marks = LineMarks()
    marks.chose("👍", on: "line", true, by: .screenReader)
    #expect(marks.reacted == 0)
    #expect(marks.shows("👍", on: "line"))
  }
}
