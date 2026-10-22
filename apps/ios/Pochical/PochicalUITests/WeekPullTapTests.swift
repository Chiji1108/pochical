import XCTest

/// Who takes the touch on an opened day's week (POC-134): a pull down,
/// however fast, never picks the day it starts on; a tap always does.
@MainActor
final class WeekPullTapTests: XCTestCase {
  private let app = XCUIApplication()

  func testTapOpensTheDay() throws {
    let (opened, other) = try openADay()
    other.tap()
    XCTAssertTrue(becomesSelected(other), "a tap on another day of the week opens it")
    XCTAssertFalse(opened.isSelected, "the day open before closes")
  }

  func testSlowPullFoldingBackPicksNoDay() throws {
    let (opened, other) = try openADay()
    let start = other.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(
      forDuration: 0, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 30)),
      withVelocity: 100, thenHoldForDuration: 0)
    snap("slow-pull")
    XCTAssertFalse(becomesSelected(other), "a slow pull let go picks no day")
    XCTAssertTrue(opened.isSelected, "the week folds back on the day open")
  }

  func testFastPullUnfoldsTheMonthPickingNoDay() throws {
    let (_, other) = try openADay()
    let start = other.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(
      forDuration: 0, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 60)),
      withVelocity: 600, thenHoldForDuration: 0)
    snap("fast-pull")
    XCTAssertFalse(becomesSelected(other), "a flick down picks no day")
    XCTAssertFalse(anySelected, "the flick unfolds the month with no day open")
  }

  func testSwipeOpensTheNextWeek() throws {
    let (opened, _) = try openADay()
    let start = opened.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(
      forDuration: 0, thenDragTo: start.withOffset(CGVector(dx: -220, dy: 0)),
      withVelocity: 1500, thenHoldForDuration: 0)
    let next = days.matching(NSPredicate(format: "label BEGINSWITH %@", "\(thisMonth)月22日、"))
      .firstMatch
    let swiped = becomesSelected(next)
    snap("swipe")
    XCTAssertTrue(swiped, "a swipe opens the same weekday a week on")
    XCTAssertFalse(opened.isSelected, "the day open before closes")
  }

  /// Opens a day mid-month and returns it with another day of its week.
  private func openADay() throws -> (opened: XCUIElement, other: XCUIElement) {
    continueAfterFailure = false
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
    let day = days.matching(NSPredicate(format: "label BEGINSWITH %@", "\(thisMonth)月15日、"))
      .firstMatch
    XCTAssertTrue(day.waitForExistence(timeout: 15), "the month shows")
    day.tap()
    XCTAssertTrue(becomesSelected(day), "a tap opens the day")
    let row = day.frame.minY...day.frame.maxY
    let screen = app.frame
    let other = try XCTUnwrap(
      days.allElementsBoundByIndex.first {
        row.contains($0.frame.midY) && screen.contains($0.frame) && $0.label != day.label
      }, "the week shows another day")
    return (day, other)
  }

  private var days: XCUIElementQuery {
    app.buttons.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]+月[0-9]+日、.*"))
  }

  private var anySelected: Bool {
    days.allElementsBoundByIndex.contains { $0.isSelected }
  }

  private var thisMonth: Int { Calendar.current.component(.month, from: .now) }

  /// Whether `day` is open within the time a picked day takes to show.
  private func becomesSelected(_ day: XCUIElement) -> Bool {
    let selected = expectation(for: NSPredicate(format: "isSelected == true"), evaluatedWith: day)
    return XCTWaiter().wait(for: [selected], timeout: 3) == .completed
  }

  private func snap(_ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}
