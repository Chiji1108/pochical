import XCTest

extension XCTestCase {
  /// With `first`'s day open in its sheet, a tap on `next` shows `next`'s
  /// day in the same sheet, at the height it was at: the sheet does not
  /// go down and come up again (POC-195). Days are named as their sheets'
  /// titles start, "10月23日".
  @MainActor func checkSheetFollows(
    _ app: XCUIApplication, from first: (cell: XCUIElement, day: String),
    to next: (cell: XCUIElement, day: String), _ when: String
  ) {
    first.cell.tap()
    guard let open = restingTitle(app, first.day) else {
      return XCTFail("\(first.day)'s sheet comes up, \(when)")
    }
    next.cell.tap()
    guard let followed = restingTitle(app, next.day) else {
      return XCTFail("\(next.day) shows in the sheet, \(when)")
    }
    XCTAssertEqual(followed.minY, open.minY, accuracy: 2, "the sheet stays at its height, \(when)")
  }

  /// The frame of the sheet's title naming `day`, once it has stopped
  /// moving; nil when no sheet names it.
  @MainActor private func restingTitle(_ app: XCUIApplication, _ day: String) -> CGRect? {
    let title = app.navigationBars.staticTexts
      .matching(NSPredicate(format: "label BEGINSWITH %@", day + "(")).firstMatch
    guard title.waitForExistence(timeout: 5) else { return nil }
    var frame = title.frame
    for _ in 0..<10 {
      RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.3))
      guard title.exists else { return nil }
      if title.frame == frame { return frame }
      frame = title.frame
    }
    return frame
  }
}
