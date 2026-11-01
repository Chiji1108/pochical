import XCTest

/// The app's one navigation (POC-157): 設定's pages are pushed over the
/// tabs, in the one bar the tabs' title is in, the tab bar going with the
/// tabs, and come back to 設定 as it was.
@MainActor
final class NavigationTests: XCTestCase {
  private let app = XCUIApplication()

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
      app.swipeUp()
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
