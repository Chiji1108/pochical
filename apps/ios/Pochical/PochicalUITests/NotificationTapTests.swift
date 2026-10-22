import XCTest

/// A tapped chat notification (POC-157): its chat opens over the グループ
/// tab alone, whatever was open, and back goes to that group's hub, from
/// the background over another tab's page and from a cold start alike.
/// Run by `mise run ios:notification-taps`, against the local server it
/// starts, which pushes the notification when told; skipped without it.
final class NotificationTapTests: XCTestCase {
  private var app: XCUIApplication!
  @MainActor private var springboard: XCUIApplication {
    XCUIApplication(bundleIdentifier: "com.apple.springboard")
  }
  /// Where the script leaves the invitation code and the two of them
  /// tell each other a step is done.
  private var shared: URL!

  override func setUpWithError() throws {
    continueAfterFailure = false
    guard let dir = ProcessInfo.processInfo.environment["NOTIFICATION_TAP_DIR"] else {
      throw XCTSkip("run by mise run ios:notification-taps")
    }
    shared = URL(filePath: dir)
    app = XCUIApplication()
  }

  /// Starts as a new user would, so the app opened by a notification later
  /// is past はじめの設定 too, joins the group and lets notifications in.
  @MainActor
  func test1JoinsAndAllowsNotifications() throws {
    app.launch()
    for step in ["はじめる", "繰り返しはない", "パート・アルバイト", "はじめる"] {
      let button = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", step)).firstMatch
      XCTAssertTrue(button.waitForExistence(timeout: 10), "はじめの設定 offers \(step)")
      button.tap()
    }
    XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10), "the tabs show")
    let code = try String(contentsOf: shared.appending(path: "invite"), encoding: .utf8)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    app.open(URL(string: "pochical://invite/\(code)")!)
    let open = springboard.buttons.matching(NSPredicate(format: "label IN {'開く', 'Open'}"))
      .firstMatch
    if open.waitForExistence(timeout: 5) { open.tap() }
    let profile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '名前を入れてください'"))
      .firstMatch
    XCTAssertTrue(profile.waitForExistence(timeout: 15), "the join screen opens")
    profile.tap()
    let name = app.textFields.firstMatch
    XCTAssertTrue(name.waitForExistence(timeout: 5), "the name can be typed")
    name.tap()
    name.typeText("テスト")
    app.navigationBars.buttons.firstMatch.tap()
    app.buttons["参加する"].tap()
    XCTAssertTrue(app.buttons["月で見る"].waitForExistence(timeout: 15), "the group's hub shows")
    // Its lines read, for the chat a notification opens to come on the
    // latest, those before it under the bar.
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH '全体チャット'")).firstMatch.tap()
    let last = app.staticTexts["テスト 30"]
    for _ in 0..<5 where !last.isHittable { app.swipeUp() }
    XCTAssertTrue(last.isHittable, "the chat's lines are read to the latest")
    app.navigationBars.firstMatch.buttons.firstMatch.tap()
    app.tabBars.buttons["設定"].tap()
    openRow("チャット")
    app.buttons["通知をオンにする"].tap()
    let allow = springboard.buttons.matching(NSPredicate(format: "label IN {'許可', 'Allow'}"))
      .firstMatch
    XCTAssertTrue(allow.waitForExistence(timeout: 5), "the system asks")
    allow.tap()
    try signal("joined")
  }

  /// From the background, over 設定 › 外観: the chat over グループ alone.
  @MainActor
  func test2TapInTheBackgroundOpensTheChatOverItsTab() throws {
    app.launch()
    app.tabBars.buttons["設定"].tap()
    openRow("外観")
    XCTAssertTrue(app.navigationBars["外観"].waitForExistence(timeout: 5), "外観 is open")
    XCUIDevice.shared.press(.home)
    try tapNotification("background")
    opensTheChat("2-background")
  }

  /// From a cold start: the chat over グループ alone.
  @MainActor
  func test3TapFromTerminatedOpensTheChatOverItsTab() throws {
    app.terminate()
    try tapNotification("cold")
    opensTheChat("3-cold")
  }

  /// Asks the script for a notification and taps it on the springboard.
  @MainActor private func tapNotification(_ step: String) throws {
    try signal(step)
    let banner = springboard.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS %@", "ポチカルのテスト")).firstMatch
    XCTAssertTrue(banner.waitForExistence(timeout: 20), "the notification comes")
    banner.tap()
  }

  /// The group's chat, over the tabs with one bar, back to the group's hub.
  @MainActor private func opensTheChat(_ name: String) {
    let bar = app.navigationBars.firstMatch
    XCTAssertTrue(
      bar.buttons["チャットのメニュー"].waitForExistence(timeout: 15), "the chat opens")
    XCTAssertTrue(app.cells.firstMatch.waitForExistence(timeout: 10), "with its lines")
    XCTAssertEqual(app.navigationBars.count, 1, "the chat has one bar")
    XCTAssertFalse(app.tabBars.firstMatch.isHittable, "the chat is over the tabs")
    snap(name)
    bar.buttons.firstMatch.tap()
    XCTAssertTrue(app.buttons["月で見る"].waitForExistence(timeout: 5), "back is the group's hub")
    XCTAssertTrue(app.tabBars.buttons["グループ"].isSelected, "over グループ")
    snap("\(name)-back")
  }

  /// Taps 設定's row named `row`.
  @MainActor private func openRow(_ row: String) {
    app.collectionViews.firstMatch.buttons
      .matching(NSPredicate(format: "label BEGINSWITH %@", row)).firstMatch.tap()
  }

  @MainActor private func snap(_ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }

  private func signal(_ step: String) throws {
    try Data().write(to: shared.appending(path: step))
  }
}
