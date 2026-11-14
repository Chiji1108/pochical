import XCTest

/// The app's navigation (POC-157): 設定's pages are pushed over it, in the
/// bar its title is in, the tab bar going with it, and come back to 設定 as
/// it was, at every width (#1237).
@MainActor
final class NavigationTests: XCTestCase {
  private let app = XCUIApplication()

  /// Upright, whatever a test before left.
  override func setUp() async throws {
    XCUIDevice.shared.orientation = .portrait
  }

  func testSettingsPagesOpenOverTheTabs() throws {
    continueAfterFailure = false
    app.launchPastFirstRun()
    let tab = app.tab("設定")
    XCTAssertTrue(tab.waitForExistence(timeout: 15), "the tabs show")
    tab.tap()
    XCTAssertTrue(app.navigationBars["設定"].waitForExistence(timeout: 5), "設定 is titled in the bar")
    snap("settings", of: app)
    for row in [
      "シフトパターン", "繰り返し", "一緒に働く人", "リマインド", "チャット", "スタイル", "外観",
      "カレンダー", "アプリアイコン", "プロフィール", "アカウント", "ライセンス",
    ] {
      open(row)
      let title = app.navigationBars[row]
      XCTAssertTrue(title.waitForExistence(timeout: 5), "\(row) is titled in the bar")
      XCTAssertEqual(app.navigationBars.count, 1, "\(row) has one bar")
      XCTAssertFalse(app.tabBars.firstMatch.isHittable, "\(row) is over the tabs")
      snap(row, of: app)
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
    app.launchPastFirstRun()
    let tab = app.tab("設定")
    XCTAssertTrue(tab.waitForExistence(timeout: 15), "the tabs show")
    tab.tap()
    let bar = app.navigationBars["設定"]
    XCTAssertTrue(bar.waitForExistence(timeout: 5), "設定 is titled in the bar")
    let page = app.navigationBars["外観"]
    open("外観")
    XCTAssertTrue(page.waitForExistence(timeout: 5), "外観 is titled in the bar")
    let inline = page.frame.height
    snap("page", of: app)
    page.buttons.firstMatch.tap()
    XCTAssertTrue(settles(bar) { $0 > inline + 30 }, "back at 設定, its title is large")
    let large = bar.frame.height
    snap("large", of: app)
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
    snap("scrolled", of: app)
    app.tab("グループ").tap()
    tab.tap()
    XCTAssertTrue(
      settles(bar) { $0 < large - 30 }, "the title stays in the bar while the list is scrolled")
    // Down until the list is at its top, each swipe let come to rest.
    var top = false
    for _ in 0..<5 where !top {
      list.swipeDown()
      top = settles(bar) { $0 == large }
    }
    XCTAssertTrue(top, "the title comes out again at the list's top")
  }

  /// On a wide screen (a large iPhone on its side), 設定's pages open
  /// beside its column, each in a bar of its own (#1023).
  func testSettingsPagesOpenBesideOnAWideScreen() throws {
    continueAfterFailure = false
    app.launchPastFirstRun()
    XCUIDevice.shared.orientation = .landscapeLeft
    let tab = app.tab("設定")
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
    snap("beside", of: app)
  }

  /// 設定's list stays where it was scrolled to as the screen widens and
  /// narrows again (#1237): on a large iPhone turned on its side, its
  /// width regular, the same list stands in its column.
  func testSettingsKeepsItsPlaceAsTheScreenTurns() throws {
    continueAfterFailure = false
    app.launchPastFirstRun()
    let tab = app.tab("設定")
    XCTAssertTrue(tab.waitForExistence(timeout: 15), "the tabs show")
    tab.tap()
    let first = app.collectionViews.firstMatch.buttons
      .matching(NSPredicate(format: "label BEGINSWITH %@", "シフトパターン")).firstMatch
    XCTAssertTrue(first.waitForExistence(timeout: 5), "設定's list shows")
    let last = reveal("ライセンス")
    XCTAssertTrue(last.isHittable && !first.isHittable, "the list is scrolled to its end")
    for orientation in [UIDeviceOrientation.landscapeLeft, .portrait] {
      XCUIDevice.shared.orientation = orientation
      let window = app.windows.firstMatch
      let turned = XCTNSPredicateExpectation(
        predicate: NSPredicate { _, _ in
          (window.frame.width > window.frame.height) == orientation.isLandscape
        }, object: nil)
      XCTAssertEqual(XCTWaiter().wait(for: [turned], timeout: 5), .completed, "the app turns")
      if orientation.isLandscape {
        // 設定's side, which only a regular width has.
        try XCTSkipUnless(
          app.staticTexts["項目を選んでください"].waitForExistence(timeout: 5),
          "a compact width on its side, the same screen in the same navigation")
      }
      snap("turned \(orientation.rawValue)", of: app)
      XCTAssertFalse(first.isHittable, "the list stays scrolled")
    }
  }

  /// The tab bar gives way to ポチポチ入力's tray, as the calendar asks
  /// of the tab bar controller it is in (spec/calendar.md).
  func testTheTabBarGivesWayToTheTray() throws {
    continueAfterFailure = false
    app.launchPastFirstRun(["-sample"])
    let tab = app.tab("設定")
    XCTAssertTrue(tab.waitForExistence(timeout: 15), "the tabs show")
    let start = app.buttons["ポチポチ入力"]
    XCTAssertTrue(start.waitForExistence(timeout: 5), "ポチポチ入力 shows")
    start.tap()
    let gone = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "hittable == false"), object: tab)
    XCTAssertEqual(XCTWaiter().wait(for: [gone], timeout: 5), .completed, "the tab bar gives way")
    snap("tray", of: app)
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
    app.launchPastFirstRun()
    let tab = app.tab("設定")
    XCTAssertTrue(tab.waitForExistence(timeout: 15), "the tabs show")
    tab.tap()
    let row = reveal("ライセンス")
    snap("about", of: app)
    row.tap()
    XCTAssertTrue(app.navigationBars["ライセンス"].waitForExistence(timeout: 5), "ライセンス is titled in the bar")
    snap("licenses", of: app)
    open("GRDB")
    XCTAssertTrue(app.navigationBars["GRDB"].waitForExistence(timeout: 5), "a license is titled by its package")
    XCTAssertTrue(text("Permission is hereby granted").waitForExistence(timeout: 5), "its text shows")
    snap("license", of: app)
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
}
