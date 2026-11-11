import XCTest

/// プロフィール's イラストを選ぶ (#1163): the drawings a face can be in place
/// of a photo, one picked becoming the usual photo the way a photo does.
/// Needs `mise run server`, as the photo is sent.
@MainActor
final class FaceDrawingTests: XCTestCase {
  private let app = XCUIApplication()
  private let names = [
    "ねこ", "いぬ", "うさぎ", "くま", "ペンギン", "ひよこ", "コーヒー", "おにぎり", "いちご", "花", "サボテン", "月",
  ]

  func testADrawingPickedBecomesTheFace() {
    continueAfterFailure = false
    app.launch()
    app.startsAsNewUser()
    app.tabBars.buttons["設定"].tap()
    let profile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'プロフィール'"))
      .firstMatch
    XCTAssertTrue(profile.waitForExistence(timeout: 5))
    profile.tap()
    let face = app.buttons.matching(NSPredicate(format: "label CONTAINS '写真を編集'")).firstMatch
    XCTAssertTrue(face.waitForExistence(timeout: 5), "プロフィール heads with the face")
    face.tap()
    XCTAssertFalse(app.buttons["写真を削除"].exists, "a new user has no photo")
    app.buttons["イラストを選ぶ"].tap()
    XCTAssertTrue(app.navigationBars["イラストを選ぶ"].waitForExistence(timeout: 5))
    for name in names {
      XCTAssertTrue(app.buttons[name].exists, "the drawings offer \(name)")
    }
    snap("1-drawings")
    app.buttons["ねこ"].tap()

    // The drawing is the photo once it is sent: the face offers deleting it.
    let sent = expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: face)
    wait(for: [sent], timeout: 15)
    snap("2-face")
    face.tap()
    XCTAssertTrue(app.buttons["写真を削除"].waitForExistence(timeout: 5), "the drawing is the photo")
  }

  private func snap(_ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}
