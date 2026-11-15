import XCTest

/// The calendar on a wide screen, a large iPhone on its side (#1223): the
/// day's detail stands in a pane beside the month, which never folds, and
/// a day open moves between the pane and the phone's sheet as the screen
/// turns, with the memo being written, its caret, and a list open in it
/// (spec/calendar.md, On a wide screen). Skipped where the side is still
/// a compact width.
@MainActor
final class WideCalendarTests: XCTestCase {
  private let app = XCUIApplication()

  override func tearDown() {
    MainActor.assumeIsolated { XCUIDevice.shared.orientation = .portrait }
  }

  /// Today's detail is in the pane with no tap, and a day tapped takes
  /// its place, the month staying as it is.
  func testThePaneShowsTodayThenTheDayTapped() throws {
    try launchWide()
    XCTAssertTrue(title(of: today).waitForExistence(timeout: 5), "today's detail is in the pane")
    XCTAssertFalse(app.buttons["閉じる"].exists, "the pane has no ×")
    let day = self.day(on: 13)
    day.tap()
    XCTAssertTrue(title(of: "\(thisMonth)月13日").waitForExistence(timeout: 5), "the day tapped is in the pane")
    XCTAssertTrue(self.day(on: 1).isHittable, "the month stays unfolded")
    snap("pane", of: XCUIScreen.main)
  }

  /// A memo being written in the pane goes on being written in the sheet
  /// as the phone turns upright, with its words and caret, and back.
  func testTheMemoMovesAsItIsWritten() throws {
    try launchWide()
    day(on: 13).tap()
    XCTAssertTrue(title(of: "\(thisMonth)月13日").waitForExistence(timeout: 5), "the day is in the pane")
    // The pane's rows scrolled up to the memo, on a short side.
    let memo = app.textFields.firstMatch
    let paneX = title(of: "\(thisMonth)月13日").frame.midX
    let middle = app.coordinate(withNormalizedOffset: .zero)
      .withOffset(CGVector(dx: paneX, dy: app.frame.height * 0.45))
    // Above the screen's foot, held still as it ends so a tap reaches it.
    for _ in 0..<6 where memo.frame.maxY > app.frame.maxY - 80 {
      middle.press(
        forDuration: 0.05, thenDragTo: middle.withOffset(CGVector(dx: 0, dy: -60)),
        withVelocity: 200, thenHoldForDuration: 0.3)
    }
    // A tap as the rows settle stops them rather than reaching the memo.
    let keyboard = app.keyboards.firstMatch
    for _ in 0..<3 where !keyboard.waitForExistence(timeout: 1) { memo.tap() }
    XCTAssertTrue(keyboard.exists, "the memo is being written")
    app.typeText("ABCD")
    snap("memo-written", of: XCUIScreen.main)
    XCUIDevice.shared.orientation = .portrait
    XCTAssertTrue(title(of: "\(thisMonth)月13日").waitForExistence(timeout: 5), "the day is in the sheet")
    let moved = memoField(holding: "ABCD")
    XCTAssertTrue(moved.waitForExistence(timeout: 5), "the memo's words come along")
    XCTAssertTrue(hasFocus(moved), "the memo is still being written")
    app.typeText("E")
    XCTAssertTrue(
      memoField(holding: "ABCDE").exists,
      "the caret is where it was: \(String(describing: memoField(holding: "ABCD").value))")
    snap("memo-sheet", of: XCUIScreen.main)
    XCUIDevice.shared.orientation = .landscapeLeft
    let back = memoField(holding: "ABCDE")
    XCTAssertTrue(back.waitForExistence(timeout: 5), "the memo comes back to the pane")
    XCTAssertTrue(hasFocus(back), "and is still being written")
    snap("memo-pane", of: XCUIScreen.main)
  }

  /// シフト's list open in the pane stays open in the sheet.
  func testAnOpenListMoves() throws {
    try launchWide()
    day(on: 13).tap()
    XCTAssertTrue(title(of: "\(thisMonth)月13日").waitForExistence(timeout: 5), "the day is in the pane")
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'シフト'")).firstMatch.tap()
    XCTAssertTrue(app.navigationBars["シフト"].waitForExistence(timeout: 5), "シフト's list is pushed in the pane")
    XCUIDevice.shared.orientation = .portrait
    XCTAssertTrue(app.navigationBars["シフト"].waitForExistence(timeout: 5), "the list stays open in the sheet")
    snap("list-sheet", of: XCUIScreen.main)
  }

  /// The pane's day tapped again while シフト's list is open shows the
  /// day in the list's place.
  func testTheDayTappedAgainTakesTheListsPlace() throws {
    try launchWide()
    day(on: 13).tap()
    XCTAssertTrue(title(of: "\(thisMonth)月13日").waitForExistence(timeout: 5), "the day is in the pane")
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'シフト'")).firstMatch.tap()
    XCTAssertTrue(app.navigationBars["シフト"].waitForExistence(timeout: 5), "シフト's list is pushed in the pane")
    day(on: 13).tap()
    XCTAssertTrue(title(of: "\(thisMonth)月13日").waitForExistence(timeout: 5), "the day takes the list's place")
    XCTAssertFalse(app.navigationBars["シフト"].exists, "the list is gone")
  }

  /// ポチポチ入力 puts the tray under the month in its place, as on a
  /// phone, and the pane shows the detail of the day being entered, which
  /// follows the day a tap or 翌日へ moves entering to; the tabs stay.
  func testEnteringIsUnderTheMonth() throws {
    try launchWide()
    let enter = app.buttons["ポチポチ入力"]
    XCTAssertTrue(enter.waitForExistence(timeout: 5), "ポチポチ入力 is under the month")
    enter.tap()
    XCTAssertTrue(app.buttons["完了"].waitForExistence(timeout: 5), "entering, 完了 is in the heading")
    XCTAssertTrue(app.buttons["翌日へ"].exists, "the tray is in ポチポチ入力's place")
    XCTAssertLessThan(
      app.buttons["翌日へ"].frame.maxX, title(of: "\(thisMonth)月1日").frame.minX, "the tray is under the month")
    XCTAssertTrue(day(on: 1).isHittable, "the month stays beside it")
    XCTAssertTrue(app.tab("グループ").exists, "the tabs stay")
    day(on: 13).tap()
    XCTAssertTrue(
      title(of: "\(thisMonth)月13日").waitForExistence(timeout: 5), "the day being entered is in the pane")
    XCTAssertFalse(app.buttons["この日のシフトを消す"].exists, "the shift is the tray's to clear")
    snap("entering", of: XCUIScreen.main)
    app.buttons["翌日へ"].tap()
    XCTAssertTrue(title(of: "\(thisMonth)月14日").waitForExistence(timeout: 5), "the detail follows 翌日へ")
  }

  /// ポチポチ入力 tapped while シフト's list is open on the day entering
  /// starts on (the 1st, the sample month having no blank day) closes the
  /// list: the shift is the tray's while entering.
  func testEnteringClosesTheShiftList() throws {
    try launchWide()
    day(on: 1).tap()
    XCTAssertTrue(title(of: "\(thisMonth)月1日").waitForExistence(timeout: 5), "the day is in the pane")
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'シフト'")).firstMatch.tap()
    XCTAssertTrue(app.navigationBars["シフト"].waitForExistence(timeout: 5), "シフト's list is pushed in the pane")
    app.buttons["ポチポチ入力"].tap()
    XCTAssertTrue(app.buttons["翌日へ"].waitForExistence(timeout: 5), "entering, the tray is under the month")
    XCTAssertTrue(title(of: "\(thisMonth)月1日").waitForExistence(timeout: 5), "the day being entered is in the pane")
    XCTAssertFalse(app.navigationBars["シフト"].exists, "the list is gone")
  }

  /// 今月のお休み and ポチポチ入力 stand under the month, as on a phone,
  /// not in the pane, and the six weeks fill the room down to them where
  /// the side is tall enough for more than the shortest days and the
  /// days are not yet as tall as a phone's for their width.
  func testTheFootIsUnderTheMonth() throws {
    try launchWide()
    let enter = app.buttons["ポチポチ入力"]
    let summary = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '今月のお休み'")).firstMatch
    XCTAssertTrue(enter.waitForExistence(timeout: 5), "ポチポチ入力 shows")
    XCTAssertTrue(summary.exists, "今月のお休み shows")
    let first = day(on: 1).frame
    let paneX = title(of: today).frame.minX
    XCTAssertLessThan(enter.frame.maxX, paneX, "ポチポチ入力 is under the month, not in the pane")
    XCTAssertGreaterThan(enter.frame.minY, summary.frame.maxY, "ポチポチ入力 is under 今月のお休み")
    // Short of a phone's day for its width (design/src/metrics.ts,
    // DAY_PROPORTION, about 1.34), with a point to spare for rounding.
    if first.height > 44 && first.height < first.width * 1.34 - 1 {
      // Six weeks and the gaps between them, from the first week's top.
      let gap: CGFloat = 4
      let monthFoot = first.minY + 6 * first.height + 5 * gap
      let spare = summary.frame.minY - monthFoot
      XCTAssertTrue((0...16).contains(spare), "the weeks fill the room down to 今月のお休み: \(spare) left")
    }
    snap("foot", of: XCUIScreen.main)
  }

  /// Launches with the sample month on its side; skipped on a compact one.
  private func launchWide() throws {
    continueAfterFailure = false
    XCUIDevice.shared.orientation = .landscapeLeft
    app.launchPastFirstRun(["-sample"])
    XCTAssertTrue(day(on: 1).waitForExistence(timeout: 15), "the month shows")
    try XCTSkipUnless(
      app.navigationBars.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", today))
        .firstMatch.waitForExistence(timeout: 5),
      "a compact width on its side, with no pane")
  }

  private func day(on date: Int) -> XCUIElement {
    app.buttons.matching(
      NSPredicate(format: "label MATCHES %@", "^(今日、)?\(thisMonth)月\(date)日\\(.*")
    ).firstMatch
  }

  /// The detail's title naming `day`, "11月13日".
  private func title(of day: String) -> XCUIElement {
    app.navigationBars.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", day + "("))
      .firstMatch
  }

  /// The memo holding `words`: a field, or once written in, a text view.
  private func memoField(holding words: String) -> XCUIElement {
    app.descendants(matching: .any).matching(
      NSPredicate(format: "(elementType == %d OR elementType == %d) AND value CONTAINS %@",
        XCUIElement.ElementType.textField.rawValue, XCUIElement.ElementType.textView.rawValue, words)
    ).firstMatch
  }

  private func hasFocus(_ field: XCUIElement) -> Bool {
    let focused = expectation(for: NSPredicate(format: "hasKeyboardFocus == true"), evaluatedWith: field)
    return XCTWaiter().wait(for: [focused], timeout: 3) == .completed
  }

  private var today: String {
    let now = Calendar.current.dateComponents([.month, .day], from: .now)
    return "\(now.month!)月\(now.day!)日"
  }

  private var thisMonth: Int { Calendar.current.component(.month, from: .now) }
}
