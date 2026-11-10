import XCTest

/// The app's one navigation (POC-157): 設定's pages are pushed over the
/// tabs, in the one bar the tabs' title is in, the tab bar going with the
/// tabs, and come back to 設定 as it was.
@MainActor
final class NavigationTests: XCTestCase {
  private let app = XCUIApplication()

  /// Upright, whatever a test before left.
  override func setUp() async throws {
    XCUIDevice.shared.orientation = .portrait
  }

  func testSettingsPagesOpenOverTheTabs() throws {
    continueAfterFailure = false
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
    let tab = app.tabBars.buttons["設定"]
    XCTAssertTrue(tab.waitForExistence(timeout: 15), "the tabs show")
    tab.tap()
    XCTAssertTrue(app.navigationBars["設定"].waitForExistence(timeout: 5), "設定 is titled in the bar")
    snap("settings")
    for row in [
      "シフトパターン", "繰り返し", "一緒に働く人", "リマインド", "チャット", "スタイル", "外観",
      "カレンダー", "アプリアイコン", "プロフィール", "アカウント", "ライセンス",
    ] {
      open(row)
      let title = app.navigationBars[row]
      XCTAssertTrue(title.waitForExistence(timeout: 5), "\(row) is titled in the bar")
      XCTAssertEqual(app.navigationBars.count, 1, "\(row) has one bar")
      XCTAssertFalse(app.tabBars.firstMatch.isHittable, "\(row) is over the tabs")
      snap(row)
      title.buttons.firstMatch.tap()
      XCTAssertTrue(app.navigationBars["設定"].waitForExistence(timeout: 5), "back is 設定")
      XCTAssertTrue(tab.isHittable, "the tab bar comes back with 設定")
    }
  }

  /// 設定 is titled large at its root, as iOS's Settings is, whichever
  /// tab it is come to from, the title going into the bar as the list
  /// scrolls up under it, staying there while the list is scrolled, and
  /// coming out again at its top; its pages are titled in the bar, and back
  /// from one its title is large again.
  func testSettingsTitleIsLargeAtItsRoot() throws {
    continueAfterFailure = false
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
    let tab = app.tabBars.buttons["設定"]
    XCTAssertTrue(tab.waitForExistence(timeout: 15), "the tabs show")
    tab.tap()
    let bar = app.navigationBars["設定"]
    XCTAssertTrue(bar.waitForExistence(timeout: 5), "設定 is titled in the bar")
    let page = app.navigationBars["外観"]
    open("外観")
    XCTAssertTrue(page.waitForExistence(timeout: 5), "外観 is titled in the bar")
    let inline = page.frame.height
    snap("page")
    page.buttons.firstMatch.tap()
    XCTAssertTrue(settles(bar) { $0 > inline + 30 }, "back at 設定, its title is large")
    let large = bar.frame.height
    snap("large")
    // From the calendar, which has no bar, and from グループ, whose title
    // is in the bar.
    for other in ["カレンダー", "グループ"] {
      app.tabBars.buttons[other].tap()
      tab.tap()
      XCTAssertTrue(settles(bar) { $0 == large }, "設定's title is large from \(other)")
    }
    let list = app.collectionViews.firstMatch
    list.swipeUp()
    XCTAssertTrue(settles(bar) { $0 < large - 30 }, "the title goes into the bar as the list scrolls")
    let scrolled = bar.frame.height
    snap("scrolled")
    app.tabBars.buttons["グループ"].tap()
    tab.tap()
    XCTAssertTrue(settles(bar) { $0 == scrolled }, "the title stays in the bar while the list is scrolled")
    for _ in 0..<5 where bar.frame.height != large {
      list.swipeDown()
    }
    XCTAssertTrue(settles(bar) { $0 == large }, "the title comes out again at the list's top")
  }

  /// On a wide screen (a large iPhone on its side), 設定's pages open
  /// beside its column, each in a bar of its own (#1023).
  func testSettingsPagesOpenBesideOnAWideScreen() throws {
    continueAfterFailure = false
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
    XCUIDevice.shared.orientation = .landscapeLeft
    let tab = app.tabBars.buttons["設定"]
    XCTAssertTrue(tab.waitForExistence(timeout: 15), "the tabs show")
    tab.tap()
    let bar = app.navigationBars["設定"]
    XCTAssertTrue(bar.waitForExistence(timeout: 5), "設定 is titled in the bar")
    open("シフトパターン")
    let page = app.navigationBars["シフトパターン"]
    XCTAssertTrue(page.waitForExistence(timeout: 5), "シフトパターン is titled in the bar")
    // Pushed over the tabs, they go with it as the push ends.
    let over = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: bar)
    try XCTSkipIf(
      XCTWaiter().wait(for: [over], timeout: 2) == .completed,
      "a compact width, its pages over the tabs")
    XCTAssertTrue(tab.isHittable, "シフトパターン is beside the tabs")
    snap("beside")
  }

  /// Whether `bar`'s height comes to what `holds` asks within a few
  /// seconds, as the bar ends its move.
  private func settles(_ bar: XCUIElement, _ holds: @escaping (CGFloat) -> Bool) -> Bool {
    let settled = XCTNSPredicateExpectation(
      predicate: NSPredicate { _, _ in bar.exists && holds(bar.frame.height) }, object: nil)
    return XCTWaiter().wait(for: [settled], timeout: 5) == .completed
  }

  /// ライセンス lists the packages the build resolved beside design/'s
  /// notices, each opening its license's text.
  func testLicensesOpenTheirText() throws {
    continueAfterFailure = false
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
    let tab = app.tabBars.buttons["設定"]
    XCTAssertTrue(tab.waitForExistence(timeout: 15), "the tabs show")
    tab.tap()
    let row = reveal("ライセンス")
    snap("about")
    row.tap()
    XCTAssertTrue(app.navigationBars["ライセンス"].waitForExistence(timeout: 5), "ライセンス is titled in the bar")
    snap("licenses")
    open("GRDB")
    XCTAssertTrue(app.navigationBars["GRDB"].waitForExistence(timeout: 5), "a license is titled by its package")
    XCTAssertTrue(text("Permission is hereby granted").waitForExistence(timeout: 5), "its text shows")
    snap("license")
    app.navigationBars["GRDB"].buttons.firstMatch.tap()
    open("Phosphor Icons")
    XCTAssertTrue(text("Copyright (c) 2020 Phosphor Icons").waitForExistence(timeout: 5), "design/'s notices are listed")
  }

  private func text(_ part: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", part)).firstMatch
  }

  /// Taps 設定's row named `row`, scrolling to it.
  private func open(_ row: String) {
    reveal(row).tap()
  }

  /// The list's row named `row`, scrolled into sight.
  private func reveal(_ row: String) -> XCUIElement {
    let cell = app.collectionViews.firstMatch.buttons
      .matching(NSPredicate(format: "label BEGINSWITH %@", row)).firstMatch
    var swipes = 0
    while !cell.isHittable, swipes < 4 {
      app.collectionViews.firstMatch.swipeUp()
      swipes += 1
    }
    return cell
  }

  private func snap(_ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}
