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
    XCTAssertTrue(tab("カレンダー").waitForExistence(timeout: 10), "the tabs show")
  }

  /// The tab named `name`: in the tab bar, or on an iPad in the sidebar
  /// or the tab bar at the top.
  @MainActor func tab(_ name: String) -> XCUIElement {
    descendants(matching: .any).matching(
      NSPredicate(
        format: "label == %@ AND (elementType == %d OR elementType == %d)", name,
        XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.cell.rawValue)
    ).firstMatch
  }

  /// The bar's back button: in the bar over the page, or on iPhone Duo's
  /// outer display in the bar down its side, which is no navigation bar.
  @MainActor var backButton: XCUIElement {
    buttons["BackButton"]
  }

  /// Joins the group whose invitation code the test's script kept in
  /// `invitation`, as `name` if given (else as the user already is), its
  /// hub shown. The name is typed in the row that says one is needed, or
  /// where the device has a usual name already, in the row showing it,
  /// `usual`, for this group alone. `face` names the drawing to show as
  /// their photo, picked in place of the one a new person is given at
  /// random.
  @MainActor func joins(
    invitation: URL, named name: String?, over usual: String? = nil, face: String? = nil
  ) throws {
    let code = try String(contentsOf: invitation, encoding: .utf8)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    open(URL(string: "pochical://invite/\(code)")!)
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let confirm = springboard.buttons.matching(NSPredicate(format: "label IN {'開く', 'Open'}"))
      .firstMatch
    if confirm.waitForExistence(timeout: 5) { confirm.tap() }
    if let name {
      let profile = buttons
        .matching(NSPredicate(format: "label BEGINSWITH %@", usual ?? "名前を入れてください")).firstMatch
      XCTAssertTrue(profile.waitForExistence(timeout: 15), "the join screen opens")
      profile.tap()
      if let face {
        let photo = buttons.matching(NSPredicate(format: "label CONTAINS '写真を編集'")).firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 5), "the photo can be changed")
        photo.tap()
        buttons["イラストを選ぶ"].tap()
        let drawing = buttons[face]
        XCTAssertTrue(drawing.waitForExistence(timeout: 5), "\(face) is among the drawings")
        drawing.tap()
      }
      let field = textFields.firstMatch
      XCTAssertTrue(field.waitForExistence(timeout: 5), "the name can be typed")
      field.tap()
      field.typeText(name)
      backButton.tap()
    }
    let join = buttons["参加する"]
    XCTAssertTrue(join.waitForExistence(timeout: 15), "the join screen opens")
    join.tap()
    XCTAssertTrue(buttons["月で見る"].waitForExistence(timeout: 15), "the group's hub shows")
  }
}

extension XCTestCase {
  /// Whether `holds` comes true within a few seconds, a turn or a window
  /// resized included.
  func settled(_ holds: @escaping () -> Bool) -> Bool {
    let settled = XCTNSPredicateExpectation(
      predicate: NSPredicate { _, _ in holds() }, object: nil)
    return XCTWaiter().wait(for: [settled], timeout: 5) == .completed
  }

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
