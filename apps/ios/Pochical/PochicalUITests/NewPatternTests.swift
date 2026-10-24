import XCTest

/// A pattern made with 自分で作る is kept as its page showed it (POC-244):
/// the second one too, whose color is past the palette's first.
@MainActor
final class NewPatternTests: XCTestCase {
  private let app = XCUIApplication()

  func testANewPatternKeepsTheColorItWasShownIn() throws {
    continueAfterFailure = false
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
    let settings = app.tabBars.buttons["設定"]
    XCTAssertTrue(settings.waitForExistence(timeout: 20))
    settings.tap()

    tapRow("シフトパターン")
    XCTAssertTrue(app.navigationBars["シフトパターン"].waitForExistence(timeout: 5))
    _ = try make("日勤")
    let second = try make("夜勤")
    XCTAssertEqual(second.reopened, second.shown, "the pattern is kept as it was shown")
  }

  private func make(_ named: String) throws -> (shown: String, reopened: String) {
    tapRow("パターンを追加")
    XCTAssertTrue(app.navigationBars["パターンを追加"].waitForExistence(timeout: 5))
    tapRow("自分で作る")
    let mark = app.buttons.matching(identifier: "印と色を変える").firstMatch
    XCTAssertTrue(mark.waitForExistence(timeout: 5))
    let name = app.textFields.firstMatch
    name.tap()
    name.typeText(named)
    let shown = try XCTUnwrap(mark.value as? String)
    app.navigationBars.buttons["追加"].tap()

    XCTAssertTrue(app.navigationBars["シフトパターン"].waitForExistence(timeout: 5))
    tapRow(named)
    XCTAssertTrue(app.navigationBars["パターンを編集"].waitForExistence(timeout: 5))
    XCTAssertTrue(mark.waitForExistence(timeout: 5))
    let reopened = try XCTUnwrap(mark.value as? String)
    app.navigationBars.buttons.firstMatch.tap()
    XCTAssertTrue(app.navigationBars["シフトパターン"].waitForExistence(timeout: 5))
    return (shown, reopened)
  }

  private func tapRow(_ row: String) {
    let cell = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", row)).firstMatch
    var swipes = 0
    while !cell.isHittable, swipes < 4 {
      app.swipeUp()
      swipes += 1
    }
    cell.tap()
  }
}
