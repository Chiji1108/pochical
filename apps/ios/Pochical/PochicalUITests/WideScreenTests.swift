import XCTest

/// On an iPad (#1222): the tabs are the system's tab bar at the top as the
/// app opens, or its sidebar once turned, and グループ's and 設定's pages open beside the tab's screen,
/// their rows kept to the readable width.
@MainActor
final class WideScreenTests: XCTestCase {
  private let app = XCUIApplication()

  override func setUp() async throws {
    try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "an iPad's layout")
    XCUIDevice.shared.orientation = .landscapeLeft
  }

  override func tearDown() async throws {
    XCUIDevice.shared.orientation = .portrait
  }

  func testSettingsPagesOpenBesideTheTabs() throws {
    continueAfterFailure = false
    app.launchPastFirstRun(["-sample"])
    let settings = app.tab("設定")
    XCTAssertTrue(settings.waitForExistence(timeout: 15), "the tabs show")
    // The tab bar at the top, not the sidebar's rows, even on its side.
    XCTAssertEqual(settings.elementType, .button, "the app opens with the tab bar")
    XCTAssertLessThan(
      settings.frame.midY, app.windows.firstMatch.frame.height / 4, "the tab bar is at the top")
    snap("calendar", of: XCUIScreen.main)
    settings.tap()
    XCTAssertTrue(app.navigationBars["設定"].waitForExistence(timeout: 5), "設定 is titled in its bar")
    row("外観").tap()
    let page = app.navigationBars["外観"]
    XCTAssertTrue(page.waitForExistence(timeout: 5), "外観 is titled in its bar")
    XCTAssertTrue(app.navigationBars["設定"].exists, "設定 stays beside it")
    XCTAssertTrue(settings.isHittable, "the tabs stay beside it")
    snap("beside landscape", of: XCUIScreen.main)
    XCUIDevice.shared.orientation = .portrait
    let window = app.windows.firstMatch
    XCTAssertTrue(settled { window.frame.width < window.frame.height }, "the app turns upright")
    XCTAssertTrue(page.exists && app.navigationBars["設定"].exists, "the page stays beside 設定 upright")
    snap("beside portrait", of: XCUIScreen.main)
  }

  /// A group's chat opens beside its column, and keeps its keyboard's
  /// room once the app has been in the background (RootNavigation). Run
  /// against a local server whose group's invitation the script leaves
  /// in WIDE_SCREEN_DIR; skipped without it.
  func testGroupsChatOpensBeside() throws {
    continueAfterFailure = false
    guard let dir = ProcessInfo.processInfo.environment["WIDE_SCREEN_DIR"] else {
      throw XCTSkip("run against a local server's group")
    }
    app.launch()
    app.startsAsNewUser()
    try app.joins(invitation: URL(filePath: dir).appending(path: "invite"), named: "テスト")
    let hub = app.buttons["月で見る"]
    snap("groups", of: XCUIScreen.main)
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH '全体チャット'")).firstMatch.tap()
    XCTAssertTrue(
      app.textViews["メッセージ"].waitForExistence(timeout: 15), "the chat opens")
    XCTAssertTrue(hub.isHittable, "the group's column stays beside the chat")
    snap("chat beside", of: XCUIScreen.main)
    XCUIDevice.shared.press(.home)
    app.activate()
    let field = app.textViews["メッセージ"]
    XCTAssertTrue(field.waitForExistence(timeout: 10), "the composer shows")
    field.tap()
    field.typeText("こんにちは")
    let keyboard = app.keyboards.firstMatch
    if keyboard.waitForExistence(timeout: 5) {
      XCTAssertLessThanOrEqual(
        field.frame.maxY, keyboard.frame.minY, "the composer stays over the keyboard")
    }
    snap("typing", of: XCUIScreen.main)
    // Upright, the tab bar at the top over the column and the chat.
    XCUIDevice.shared.orientation = .portrait
    let window = app.windows.firstMatch
    XCTAssertTrue(settled { window.frame.width < window.frame.height }, "the app turns upright")
    XCTAssertTrue(hub.isHittable, "the group's column stays beside the chat upright")
    snap("chat beside portrait", of: XCUIScreen.main)
  }

  /// The row named `name` of the list it is in.
  private func row(_ name: String) -> XCUIElement {
    app.collectionViews.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
  }
}
