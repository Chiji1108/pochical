import XCTest

/// Who takes which touch on a chat's photo line (POC-130): the line's long
/// press opens its reactions and menu, and the photo's own × and ↻ still
/// take their taps. Run by `tools/photo-line-touches/run.sh`, against
/// the local server it starts: it makes the group, sends the photos, and
/// between the steps stops and starts the server and hides a photo;
/// skipped without it.
final class PhotoLineTouchTests: XCTestCase {
  private var app: XCUIApplication!
  /// Where the script leaves the invitation code and the two of them
  /// tell each other a step is done.
  private var shared: URL!

  override func setUpWithError() throws {
    continueAfterFailure = false
    guard let dir = ProcessInfo.processInfo.environment["PHOTO_TOUCH_DIR"] else {
      throw XCTSkip("run by tools/photo-line-touches/run.sh")
    }
    shared = URL(filePath: dir)
    app = XCUIApplication()
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
  }

  @MainActor
  func test1HoldingOthersPhotoOpensItsMenu() throws {
    let code = try String(contentsOf: shared.appending(path: "invite"), encoding: .utf8)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    app.open(URL(string: "pochical://invite/\(code)")!)
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
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
    openChat()

    newestPhoto().press(forDuration: 1)
    let opened = menu.waitForExistence(timeout: 5)
    snap("1-held-others-photo")
    XCTAssertTrue(opened, "holding a photo opens its line's menu")
  }

  @MainActor
  func test2HoldingOnesOwnPhotoJustSentOpensItsMenu() throws {
    openChat()
    let photos = app.images.matching(NSPredicate(format: "label == '写真'"))
    XCTAssertTrue(photos.firstMatch.waitForExistence(timeout: 15), "a photo line shows")
    let before = photos.count
    sendPhoto()
    let going = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS '送信中'"))
    let sent = expectation(
      for: NSPredicate { _, _ in photos.count > before && going.count == 0 }, evaluatedWith: nil)
    wait(for: [sent], timeout: 20)

    newestPhoto().press(forDuration: 1)
    let opened = menu.waitForExistence(timeout: 5)
    snap("2-held-own-photo-just-sent")
    XCTAssertTrue(opened, "holding one's photo just sent opens its line's menu")
  }

  @MainActor
  func test3TappingXStopsAPhotoGoingUp() throws {
    openChat()
    sendPhoto()
    let stop = app.buttons["送信をやめる"]
    XCTAssertTrue(stop.waitForExistence(timeout: 10), "× shows on the photo going up")
    snap("3-going-up")
    stop.tap()
    let stopped = app.buttons["送れませんでした"].waitForExistence(timeout: 5)
    snap("3-stopped-by-x")
    XCTAssertTrue(stopped, "× stopped it, leaving its line not sent")
    XCTAssertFalse(menu.exists, "the tap on × opened no menu")
  }

  @MainActor
  func test4HoldingAndTappingAPhotoNotFetched() throws {
    openChat()
    let retry = app.buttons["写真をもう一度読み込む"]
    XCTAssertTrue(retry.waitForExistence(timeout: 15), "↻ shows on the photo not fetched")
    retry.press(forDuration: 1)
    let opened = menu.waitForExistence(timeout: 5)
    snap("4-held-photo-not-fetched")
    XCTAssertTrue(opened, "holding a photo not fetched opens its line's menu")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)).tap()
    let closed = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: menu)
    wait(for: [closed], timeout: 5)

    try signal("retry-shown")
    try waitFor("photo-back")
    retry.tap()
    let fetched = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: retry)
    wait(for: [fetched], timeout: 10)
    snap("4-fetched-by-retry")
    XCTAssertFalse(menu.exists, "the tap on ↻ opened no menu")
    XCTAssertFalse(app.buttons["閉じる"].exists, "the tap on ↻ did not open the photo")
  }

  /// A line's reactions and menu, open.
  @MainActor private var menu: XCUIElement { app.buttons["ほかの絵文字でリアクション"] }

  /// Sends the library's first photo from the composer.
  @MainActor private func sendPhoto() {
    app.buttons["写真や日にちを送る"].tap()
    app.buttons["写真"].tap()
    let picked = app.images.matching(NSPredicate(format: "identifier BEGINSWITH 'PXGGridLayout'"))
      .firstMatch
    XCTAssertTrue(picked.waitForExistence(timeout: 10), "the photo picker opens")
    picked.tap()
    app.buttons["Add"].tap()
    let send = app.buttons["送る"]
    XCTAssertTrue(send.waitForExistence(timeout: 5), "the photo is in the tray")
    send.tap()
  }

  /// The group's chat, from the グループ tab.
  @MainActor private func openChat() {
    let tab = app.tabBars.buttons["グループ"]
    if tab.waitForExistence(timeout: 10) { tab.tap() }
    let chat = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '全体チャット'"))
      .firstMatch
    XCTAssertTrue(chat.waitForExistence(timeout: 15), "the group's chat is listed")
    chat.tap()
  }

  /// The newest photo line, the lowest in the chat.
  @MainActor private func newestPhoto() -> XCUIElement {
    let photos = app.images.matching(NSPredicate(format: "label == '写真'"))
    XCTAssertTrue(photos.firstMatch.waitForExistence(timeout: 15), "a photo line shows")
    return photos.allElementsBoundByIndex.max { $0.frame.midY < $1.frame.midY }!
  }

  /// The screen now, kept with the results.
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
