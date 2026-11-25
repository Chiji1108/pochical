import XCTest

/// グループ's rail: every group in it can be picked, the first one too,
/// whose mark stands highest, and the one picked is open again once the
/// app is closed and opened (#1281). Run by `mise run ios:group-rail`,
/// against the local server it starts and the two groups it makes there;
/// skipped without it.
@MainActor
final class GroupRailTests: XCTestCase {
  private let app = XCUIApplication()
  /// Where the script leaves the invitation codes and reads the screenshots.
  private var shared: URL!

  override func setUpWithError() throws {
    continueAfterFailure = false
    guard let dir = ProcessInfo.processInfo.environment["GROUP_RAIL_DIR"] else {
      throw XCTSkip("run by mise run ios:group-rail")
    }
    shared = URL(filePath: dir)
  }

  func testEveryGroupIsPickedAndTheOnePickedStaysOpen() throws {
    app.launch()
    app.startsAsNewUser()
    // Joined in turn, so ひとつめ stands first in the rail and ふたつめ,
    // just joined, is open.
    try app.joins(invitation: shared.appending(path: "first"), named: "テスト")
    try app.joins(invitation: shared.appending(path: "second"), named: nil)
    let first = app.buttons["ひとつめ"]
    let second = app.buttons["ふたつめ"]
    XCTAssertTrue(second.waitForExistence(timeout: 15), "ふたつめ is in the rail")
    XCTAssertTrue(settled { second.isSelected }, "the group joined is open")

    // A tap where the person sees the mark, its middle, rather than
    // where XCUITest finds it uncovered, as `tap()` would.
    tapMiddle(first)
    XCTAssertTrue(settled { first.isSelected }, "the first group is picked")
    snap("first-picked", of: XCUIScreen.main, into: shared)
    tapMiddle(second)
    XCTAssertTrue(settled { second.isSelected }, "the second group is picked")

    // Closed, as a force-quit does, and opened again.
    app.terminate()
    app.launch()
    app.tab("グループ").tap()
    XCTAssertTrue(second.waitForExistence(timeout: 15), "ふたつめ is in the rail again")
    XCTAssertTrue(settled { second.isSelected }, "the group picked last is open again")
    snap("second-again", of: XCUIScreen.main, into: shared)
    tapMiddle(first)
    XCTAssertTrue(settled { first.isSelected }, "and the first can be picked from it")
  }

  /// A finger on `element`'s middle.
  private func tapMiddle(_ element: XCUIElement) {
    element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
  }
}
