import XCTest

/// A chat with a pointer, as Messages takes one on iPad (spec/chat.md, A
/// keyboard and a mouse). Run by `mise run ios:chat-pointer`, against the
/// local server it starts and the group it makes there; skipped without
/// it.
@MainActor
final class ChatPointerTests: XCTestCase {
  private let app = XCUIApplication()
  /// Where the script leaves the invitation code and reads the screenshots.
  private var shared: URL!
  private var menu: XCUIElement { app.buttons["ほかの絵文字でリアクション"] }

  override func setUp() async throws {
    continueAfterFailure = false
    guard let dir = ProcessInfo.processInfo.environment["CHAT_POINTER_DIR"] else {
      throw XCTSkip("run by mise run ios:chat-pointer")
    }
    shared = URL(filePath: dir)
  }

  /// A right click on a line opens its menu at once, as the button goes
  /// down, and leaves it open for a pick; a tap off it closes it. The keys
  /// are pinned by ComposerKeysTests: a simulator with no hardware keyboard
  /// attached (no Simulator app showing it) takes no Return or Esc typed
  /// by a test.
  func testRightClickOpensALinesMenu() throws {
    app.launch()
    app.startsAsNewUser()
    try app.joins(invitation: shared.appending(path: "invite"), named: "テスト")
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH '全体チャット'")).firstMatch.tap()
    let last = app.staticTexts["テスト 30"]
    XCTAssertTrue(last.waitForExistence(timeout: 15), "the chat's latest line shows")

    last.rightClick()
    XCTAssertTrue(menu.waitForExistence(timeout: 2), "a right click opens the line's menu")
    snap("right-clicked", of: XCUIScreen.main, into: shared)
    XCTAssertTrue(menu.isHittable, "it stays open for a pick")
    app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap()
    XCTAssertTrue(gone(menu), "a tap off it closes it")
  }

  private func gone(_ element: XCUIElement) -> Bool {
    let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: element)
    return XCTWaiter.wait(for: [gone], timeout: 3) == .completed
  }
}
