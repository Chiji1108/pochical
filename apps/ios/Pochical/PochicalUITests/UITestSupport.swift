import XCTest

/// What the UI tests share: launching past はじめの設定 or going through
/// it as a new user would, joining a local server's group by its
/// invitation, and keeping a screenshot.
extension XCUIApplication {
  /// Launches as someone past はじめの設定, with `arguments` besides
  /// (`-sample` for the sample month).
  @MainActor func launchPastFirstRun(_ arguments: [String] = []) {
    launchArguments += ["-firstRunDone", "YES"] + arguments
    launch()
  }

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

  /// Joins the group whose invitation code the test's script kept in
  /// `invitation`, as `name` if given (else as the user already is), its
  /// hub shown.
  @MainActor func joins(invitation: URL, named name: String?) throws {
    let code = try String(contentsOf: invitation, encoding: .utf8)
      .trimmingCharacters(in: .whitespacesAndNewlines)
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

extension XCTestCase {
  /// Keeps a screenshot of `shown` with the test's results as `name`, and
  /// as `name`.png in `directory` when a script reads it from there.
  @MainActor func snap(
    _ name: String, of shown: any XCUIScreenshotProviding, into directory: URL? = nil
  ) {
    let screenshot = shown.screenshot()
    let shot = XCTAttachment(screenshot: screenshot)
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
    guard let directory else { return }
    do {
      try screenshot.pngRepresentation.write(to: directory.appending(path: "\(name).png"))
    } catch {
      XCTFail("\(name).png is not written: \(error)")
    }
  }
}
