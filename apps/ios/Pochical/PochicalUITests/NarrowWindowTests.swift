import XCTest

/// In an iPad's narrowest window, as narrow as the narrowest iPhone: every
/// screen is the phone's, its own parts clear of the window's controls at
/// the top-leading corner (spec/calendar.md, In a narrow window). Run by
/// `mise run ios:narrow-window` on an iPad simulator, against the local
/// server it starts and the group it makes there; skipped without it.
@MainActor
final class NarrowWindowTests: XCTestCase {
  private let app = XCUIApplication()
  /// Where the script leaves the invitation code and reads the screenshots.
  private var shared: URL!

  override func setUpWithError() throws {
    continueAfterFailure = false
    try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "an iPad's windows")
    guard let dir = ProcessInfo.processInfo.environment["NARROW_WINDOW_DIR"] else {
      throw XCTSkip("run by mise run ios:narrow-window")
    }
    shared = URL(filePath: dir)
  }

  override func tearDown() async throws {
    XCUIDevice.shared.orientation = .portrait
  }

  func testEveryScreenFitsTheNarrowestWindow() throws {
    app.launch()
    narrowed()
    app.startsAsNewUser()
    try app.joins(invitation: shared.appending(path: "invite"), named: "テスト")
    walk("upright")
    XCUIDevice.shared.orientation = .landscapeLeft
    narrowed()
    walk("on its side")
  }

  /// The window dragged by its corner as far in as it goes, which the
  /// system stops at the narrowest iPhone's width.
  private func narrowed() {
    let window = app.windows.firstMatch
    let frame = window.frame
    let origin = window.coordinate(withNormalizedOffset: .zero)
    origin.withOffset(CGVector(dx: frame.width - 4, dy: frame.height - 4))
      .press(
        forDuration: 0.5, thenDragTo: origin.withOffset(CGVector(dx: 10, dy: frame.height - 4)))
    XCTAssertTrue(settled { window.frame.width < 400 }, "the window narrows")
    XCTAssertGreaterThanOrEqual(window.frame.width, 375, "no narrower than an iPhone")
  }

  private func walk(_ how: String) {
    let window = app.windows.firstMatch.frame
    app.tab("カレンダー").tap()
    let month = app.buttons.matching(NSPredicate(format: "label ENDSWITH '月'")).firstMatch
    XCTAssertTrue(month.waitForExistence(timeout: 10), "the month's name shows")
    snap("calendar \(how)", of: XCUIScreen.main, into: shared)
    clearOfControls(month, in: window, "the month's name")

    app.buttons["ポチポチ入力"].tap()
    let done = app.buttons["完了"].firstMatch
    XCTAssertTrue(done.waitForExistence(timeout: 5), "entering starts")
    XCTAssertTrue(app.buttons["翌日へ"].isHittable, "the tray fits")
    snap("tray \(how)", of: XCUIScreen.main, into: shared)
    done.tap()

    app.tab("グループ").tap()
    let hub = app.buttons["月で見る"]
    XCTAssertTrue(hub.waitForExistence(timeout: 10), "the group's hub shows")
    XCTAssertTrue(hub.isHittable, "月で見る fits")
    let rail = app.buttons["ポチカルのテスト"].firstMatch
    XCTAssertTrue(rail.isHittable, "the rail's group shows")
    snap("groups \(how)", of: XCUIScreen.main, into: shared)
    clearOfControls(rail, in: window, "the rail's group")
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH '全体チャット'")).firstMatch.tap()
    let field = app.textViews["メッセージ"]
    XCTAssertTrue(field.waitForExistence(timeout: 15), "the chat opens")
    XCTAssertTrue(field.isHittable, "the composer fits")
    snap("chat \(how)", of: XCUIScreen.main, into: shared)
    app.backButton.tap()
    hub.tap()
    XCTAssertTrue(
      app.navigationBars["ポチカルのテスト"].waitForExistence(timeout: 10), "みんなのシフト opens")
    snap("shifts \(how)", of: XCUIScreen.main, into: shared)
    app.backButton.tap()

    app.tab("設定").tap()
    XCTAssertTrue(app.navigationBars["設定"].waitForExistence(timeout: 5), "設定 shows")
    snap("settings \(how)", of: XCUIScreen.main, into: shared)
  }

  /// `part` is clear of the window's controls: the system draws them in
  /// the window's top-leading corner, over what is under them, so a part
  /// there has to have moved off the corner, to its trailing side or below.
  /// They are no element the test can find; this is where iPadOS draws
  /// them, measured from its screenshot (a pill 20pt in from the window's
  /// leading edge and 42pt down, 43 by 23pt), with the corner around it.
  private func clearOfControls(_ part: XCUIElement, in window: CGRect, _ name: String) {
    let controls = CGRect(x: window.minX, y: window.minY, width: 64, height: 66)
    XCTAssertFalse(
      part.frame.intersects(controls),
      "\(name), at \(part.frame), is clear of the window's controls, at \(controls)")
  }
}
