import XCTest

/// What the UI tests run against a local server do to be in its group: go
/// through はじめの設定 as a new user would, and join by the invitation.
extension XCUIApplication {
  /// はじめの設定 through to the tabs, kept by the app, so a launch the
  /// test does not make (a notification's tap) is past it too.
  @MainActor func startsAsNewUser() {
    for step in ["はじめる", "繰り返しはない", "パート・アルバイト", "次へ", "毎月1日から末日まで"] {
      let button = buttons.matching(NSPredicate(format: "label BEGINSWITH %@", step)).firstMatch
      XCTAssertTrue(button.waitForExistence(timeout: 10), "はじめの設定 offers \(step)")
      button.tap()
    }
    XCTAssertTrue(tabBars.firstMatch.waitForExistence(timeout: 10), "the tabs show")
  }

  /// Joins the group of the invitation `code`, as `name` if given (else
  /// as the user already is), its hub shown.
  @MainActor func joins(code: String, named name: String?) {
    open(URL(string: "pochical://invite/\(code)")!)
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let confirm = springboard.buttons.matching(NSPredicate(format: "label IN {'開く', 'Open'}"))
      .firstMatch
    if confirm.waitForExistence(timeout: 5) { confirm.tap() }
    if let name {
      let profile = buttons.matching(NSPredicate(format: "label BEGINSWITH '名前を入れてください'"))
        .firstMatch
      XCTAssertTrue(profile.waitForExistence(timeout: 15), "the join screen opens")
      profile.tap()
      let field = textFields.firstMatch
      XCTAssertTrue(field.waitForExistence(timeout: 5), "the name can be typed")
      field.tap()
      field.typeText(name)
      navigationBars.buttons.firstMatch.tap()
    }
    let join = buttons["参加する"]
    XCTAssertTrue(join.waitForExistence(timeout: 15), "the join screen opens")
    join.tap()
    XCTAssertTrue(buttons["月で見る"].waitForExistence(timeout: 15), "the group's hub shows")
  }
}
