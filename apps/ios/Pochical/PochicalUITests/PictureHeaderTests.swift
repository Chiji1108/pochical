import XCTest

/// A pattern's page heads with its mark alone (POC-240), the way a face's
/// プロフィール and a group's アイコン head theirs: one button to VoiceOver,
/// named by the mark, which follows a new pattern's name as it is typed.
@MainActor
final class PictureHeaderTests: XCTestCase {
  private let app = XCUIApplication()

  func testPatternPagesHeadWithTheirMarkAsFacesAndGroupsDo() throws {
    continueAfterFailure = false
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
    let settings = app.tabBars.buttons["設定"]
    XCTAssertTrue(settings.waitForExistence(timeout: 20))
    settings.tap()

    tapRow("シフトパターン")
    XCTAssertTrue(app.navigationBars["シフトパターン"].waitForExistence(timeout: 5))
    tapRow("パターンを追加")
    XCTAssertTrue(app.navigationBars["パターンを追加"].waitForExistence(timeout: 5))
    tapRow("自分で作る")
    let mark = app.buttons.matching(identifier: "印と色を変える").firstMatch
    XCTAssertTrue(mark.waitForExistence(timeout: 5), "パターンを追加 heads with its mark")
    snap("1-pattern-new-blank")
    let name = app.textFields.firstMatch
    name.tap()
    name.typeText("夜勤")
    XCTAssertEqual(
      app.buttons.matching(identifier: "印と色を変える").count, 1, "the mark and its words are one button")
    let said = try XCTUnwrap(mark.value as? String)
    XCTAssertTrue(said.hasPrefix("月"), "the mark follows the name typed: \(said)")
    XCTAssertFalse(app.staticTexts["新しいパターン"].exists, "the top does not name the pattern")
    snap("2-pattern-new-typed")
    mark.tap()
    XCTAssertTrue(app.navigationBars["印と色"].waitForExistence(timeout: 5))
    snap("3-pattern-new-look")
    app.navigationBars.buttons.firstMatch.tap()
    XCTAssertTrue(mark.waitForExistence(timeout: 5))
    app.navigationBars.buttons["追加"].tap()

    XCTAssertTrue(app.navigationBars["シフトパターン"].waitForExistence(timeout: 5))
    tapRow("夜勤")
    XCTAssertTrue(app.navigationBars["パターンを編集"].waitForExistence(timeout: 5))
    XCTAssertTrue(mark.waitForExistence(timeout: 5), "パターンを編集 heads with its mark")
    snap("4-pattern-edit")
    app.navigationBars.buttons.firstMatch.tap()
    XCTAssertTrue(app.navigationBars["シフトパターン"].waitForExistence(timeout: 5))
    app.navigationBars.buttons.firstMatch.tap()

    tapRow("プロフィール")
    XCTAssertTrue(app.navigationBars["プロフィール"].waitForExistence(timeout: 5))
    XCTAssertTrue(header("写真を編集").exists, "プロフィール heads with the face")
    snap("5-profile")
    app.navigationBars.buttons.firstMatch.tap()

    app.tabBars.buttons["グループ"].tap()
    let new = app.buttons["グループを作る"].firstMatch
    XCTAssertTrue(new.waitForExistence(timeout: 5))
    new.tap()
    let groupName = app.textFields.firstMatch
    XCTAssertTrue(groupName.waitForExistence(timeout: 5))
    groupName.tap()
    groupName.typeText("家族")
    tapRow("アイコン")
    XCTAssertTrue(app.navigationBars["アイコン"].waitForExistence(timeout: 5))
    XCTAssertTrue(header("写真を使う").exists, "アイコン heads with the group's mark")
    snap("6-group-icon")
  }

  /// The button heading a page, its picture read with its words.
  private func header(_ words: String) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label CONTAINS %@", words)).firstMatch
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

  private func snap(_ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}
