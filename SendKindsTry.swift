import XCTest

/// POC-139's run in the simulator, not committed: each kind of send from
/// the composer, then a reply from a line's notification, against the
/// local server. The script leaves the invitation in SEND_KINDS_DIR and
/// pushes the notification once told the lines went.
final class SendKindsTry: XCTestCase {
  private var app: XCUIApplication!
  private var shared: URL!

  override func setUpWithError() throws {
    continueAfterFailure = false
    guard let dir = ProcessInfo.processInfo.environment["SEND_KINDS_DIR"] else {
      throw XCTSkip("run by the POC-139 script")
    }
    shared = URL(filePath: dir)
    app = XCUIApplication()
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
  }

  @MainActor
  func testEachKindThenANotificationReply() throws {
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
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
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("テスト")
    app.navigationBars.buttons.firstMatch.tap()
    app.buttons["参加する"].tap()
    let tab = app.tabBars.buttons["グループ"]
    if tab.waitForExistence(timeout: 10) { tab.tap() }
    let chat = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '全体チャット'"))
      .firstMatch
    XCTAssertTrue(chat.waitForExistence(timeout: 15), "the group's chat is listed")
    chat.tap()

    let field = app.textViews.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 10), "the composer shows")
    field.tap()
    field.typeText("ことばを送る")
    app.buttons["送る"].tap()
    let allow = springboard.buttons.matching(NSPredicate(format: "label IN {'許可', 'Allow'}"))
      .firstMatch
    if allow.waitForExistence(timeout: 5) { allow.tap() }
    snap("1-words")

    app.buttons["写真や日にちを送る"].tap()
    app.buttons["写真"].tap()
    let grid = app.images.matching(NSPredicate(format: "identifier BEGINSWITH 'PXGGridLayout'"))
    XCTAssertTrue(grid.firstMatch.waitForExistence(timeout: 10), "the photo picker opens")
    grid.element(boundBy: 0).tap()
    grid.element(boundBy: 1).tap()
    app.buttons["Add"].tap()
    let send = app.buttons["送る"]
    XCTAssertTrue(send.waitForExistence(timeout: 5), "the photos are in the tray")
    send.tap()
    snap("2-album")

    shareDays(["10月28日"], poll: false)
    snap("3-days")
    shareDays(["10月28日", "10月29日"], poll: true)
    snap("4-poll")

    let going = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS '送信中' OR label CONTAINS '送れませんでした'"))
    let sent = expectation(for: NSPredicate { _, _ in going.count == 0 }, evaluatedWith: nil)
    wait(for: [sent], timeout: 30)
    snap("5-all-sent")

    XCUIDevice.shared.press(.home)
    try signal("sent")
    try waitFor("pushed")
    let banner = springboard.descendants(matching: .any).matching(
      NSPredicate(format: "identifier == 'NotificationShortLookView'")
    ).firstMatch
    XCTAssertTrue(banner.waitForExistence(timeout: 15), "the line's notification shows")
    let listed = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    listed.name = "6-notification"
    listed.lifetime = .keepAlways
    add(listed)
    banner.press(forDuration: 1.5)
    // Holding a notification with one text action opens its field at once.
    let answer = springboard.buttons["送信"]
    XCTAssertTrue(answer.waitForExistence(timeout: 5), "the reply field opens")
    springboard.typeText("通知から返信")
    let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    shot.name = "7-notification-reply"
    shot.lifetime = .keepAlways
    add(shot)
    answer.tap()
    app.activate()
    let replied = app.staticTexts["通知から返信"]
    XCTAssertTrue(replied.waitForExistence(timeout: 30), "the reply shows in the chat")
    snap("8-reply-in-chat")
  }

  /// Shares `days` (as their labels begin), or puts them to the vote.
  @MainActor private func shareDays(_ days: [String], poll: Bool) {
    app.buttons["写真や日にちを送る"].tap()
    app.buttons["日にちを共有"].tap()
    if poll {
      let vote = app.buttons["投票"]
      XCTAssertTrue(vote.waitForExistence(timeout: 5))
      vote.tap()
    }
    for day in days {
      let button = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", day)).firstMatch
      XCTAssertTrue(button.waitForExistence(timeout: 5), "\(day) can be picked")
      button.tap()
    }
    app.navigationBars.buttons["送る"].tap()
    let gone = expectation(
      for: NSPredicate(format: "exists == false"), evaluatedWith: app.navigationBars.buttons["送る"])
    wait(for: [gone], timeout: 5)
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

  private func waitFor(_ step: String) throws {
    let file = shared.appending(path: step)
    let there = expectation(
      for: NSPredicate { _, _ in FileManager.default.fileExists(atPath: file.path()) },
      evaluatedWith: nil)
    wait(for: [there], timeout: 60)
  }
}
