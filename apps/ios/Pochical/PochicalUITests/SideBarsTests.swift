import XCTest

/// The app's own parts stay clear of the system's bars wherever the bars
/// stand: under and over the screen on most iPhones, down its side on
/// iPhone Duo's outer display, with the camera above them (#1224). Run by
/// `mise run ios:side-bars`, against the local server it starts and the
/// group it makes there; skipped without it.
@MainActor
final class SideBarsTests: XCTestCase {
  private let app = XCUIApplication()
  /// Where the script leaves the invitation code and reads the screenshots.
  private var shared: URL!

  override func setUpWithError() throws {
    continueAfterFailure = false
    guard let dir = ProcessInfo.processInfo.environment["SIDE_BARS_DIR"] else {
      throw XCTSkip("run by mise run ios:side-bars")
    }
    shared = URL(filePath: dir)
  }

  func testOwnPartsStayClearOfTheBars() throws {
    app.launch()
    app.startsAsNewUser()
    try app.joins(invitation: shared.appending(path: "invite"), named: "テスト")
    let hub = app.buttons["月で見る"]
    XCTAssertTrue(hub.waitForExistence(timeout: 15), "the group's hub shows")
    clearOfBars(hub, "the hub's 月で見る")
    // The group's heading, in the bar's band over the hub, or over it
    // where the bar stands down the side.
    let heading = app.staticTexts["ポチカルのテスト"].firstMatch
    XCTAssertTrue(heading.exists, "the group's heading shows")
    XCTAssertLessThanOrEqual(heading.frame.maxY, hub.frame.minY, "the heading is over the hub")
    snap("groups", of: XCUIScreen.main, into: shared)

    app.buttons.matching(NSPredicate(format: "label BEGINSWITH '全体チャット'")).firstMatch.tap()
    let field = app.textViews["メッセージ"]
    XCTAssertTrue(field.waitForExistence(timeout: 15), "the chat opens")
    let last = app.staticTexts["テスト 30"]
    XCTAssertTrue(last.waitForExistence(timeout: 15), "the chat's latest line shows")
    clearOfBars(field, "the composer")
    clearOfBars(last, "the latest line")
    snap("chat", of: XCUIScreen.main, into: shared)
    app.swipeDown()
    app.swipeDown()
    let latest = app.buttons["最新のメッセージへ"]
    if latest.waitForExistence(timeout: 5) { clearOfBars(latest, "↓") }
    snap("chat scrolled", of: XCUIScreen.main, into: shared)
    // A line of one's own, at the trailing side the bar may stand on.
    field.tap()
    field.typeText("わたしの行")
    app.buttons["送る"].tap()
    // The system asks once, as a first line is sent, whether to notify.
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let later = springboard.buttons.matching(
      NSPredicate(format: "label IN {'許可しない', 'Don’t Allow'}")
    ).firstMatch
    if later.waitForExistence(timeout: 5) { later.tap() }
    let mine = app.staticTexts["わたしの行"]
    XCTAssertTrue(mine.waitForExistence(timeout: 10), "one's own line shows")
    // The keyboard put away by a tap on the lines, as LINE's is.
    app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.3)).tap()
    clearOfBars(mine, "one's own line")
    snap("chat own line", of: XCUIScreen.main, into: shared)
    app.backButton.tap()

    hub.tap()
    XCTAssertTrue(app.navigationBars["ポチカルのテスト"].waitForExistence(timeout: 10), "みんなのシフト opens")
    snap("shifts", of: XCUIScreen.main, into: shared)
    app.backButton.tap()

    app.tab("カレンダー").tap()
    let enter = app.buttons["ポチポチ入力"]
    XCTAssertTrue(enter.waitForExistence(timeout: 5), "the calendar shows")
    clearOfBars(enter, "ポチポチ入力")
    snap("calendar", of: XCUIScreen.main, into: shared)
    enter.tap()
    let done = app.buttons["完了"]
    XCTAssertTrue(done.waitForExistence(timeout: 5), "entering starts")
    clearOfBars(done, "完了")
    snap("entering", of: XCUIScreen.main, into: shared)
    done.tap()

    app.tab("設定").tap()
    XCTAssertTrue(app.navigationBars["設定"].waitForExistence(timeout: 5), "設定 shows")
    snap("settings", of: XCUIScreen.main, into: shared)
  }

  /// `element` is in the window, and beside the bars: under or over a
  /// bar across the screen, and beside one down its side, as iPhone Duo's
  /// outer display has its bars (whose buttons are a toolbar's), whatever
  /// its height.
  private func clearOfBars(_ element: XCUIElement, _ name: String) {
    XCTAssertTrue(element.waitForExistence(timeout: 5), "\(name) shows")
    let frame = element.frame
    XCTAssertTrue(
      app.windows.firstMatch.frame.contains(frame), "\(name) is in the window: \(frame)")
    let kinds = [app.navigationBars, app.tabBars, app.toolbars]
    for bars in kinds {
      for bar in bars.allElementsBoundByIndex where bar.exists {
        let buttons = bar.buttons.allElementsBoundByIndex.map(\.frame).filter { !$0.isEmpty }
        guard let first = buttons.first else { continue }
        let span = buttons.dropFirst().reduce(first) { $0.union($1) }
        let clear =
          span.height > span.width
          ? frame.maxX <= span.minX || frame.minX >= span.maxX
          : frame.maxY <= span.minY || frame.minY >= span.maxY
        XCTAssertTrue(clear, "\(name) \(frame) is clear of a bar's buttons \(span)")
      }
    }
  }
}
