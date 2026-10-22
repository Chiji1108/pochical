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
      "カレンダー", "アプリアイコン", "プロフィール", "アカウント",
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

  /// Taps 設定's row named `row`, scrolling to it.
  private func open(_ row: String) {
    let cell = app.collectionViews.firstMatch.buttons
      .matching(NSPredicate(format: "label BEGINSWITH %@", row)).firstMatch
    var swipes = 0
    while !cell.isHittable, swipes < 4 {
      app.swipeUp()
      swipes += 1
    }
    cell.tap()
  }

  private func snap(_ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}
