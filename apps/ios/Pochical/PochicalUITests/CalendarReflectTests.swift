import XCTest

/// 自動で反映 (spec/calendar.md, Reflecting automatically, #1153): adding a
/// month asks once whether the days ahead follow by themselves; turned on,
/// a day's shift changed changes that day's event and no other, however
/// often and across a relaunch; turned off, it stops. And the sheet's
/// link to the Google Calendar guide opens it. Run by
/// `mise run ios:calendar-reflect`, whose script lets the app into the
/// simulator's calendars and reads them after each step; skipped without it.
final class CalendarReflectTests: XCTestCase {
  private var app: XCUIApplication!
  /// Where the test and the script tell each other a step is done.
  private var shared: URL!

  override func setUpWithError() throws {
    continueAfterFailure = false
    guard let dir = ProcessInfo.processInfo.environment["CALENDAR_REFLECT_DIR"] else {
      throw XCTSkip("run by mise run ios:calendar-reflect")
    }
    shared = URL(filePath: dir)
    app = XCUIApplication()
  }

  @MainActor
  func testAMonthAddedIsReflectedFromThenOn() throws {
    app.launchArguments += ["-sample", "-firstRunDone", "YES"]
    app.launch()
    XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15), "the tabs show")

    // The month put in by hand: the question comes once, over what was done.
    openSheet()
    let add = app.buttons.matching(NSPredicate(format: "label ENDSWITH '件を追加'")).firstMatch
    XCTAssertTrue(add.waitForExistence(timeout: 10), "the sheet offers to add")
    XCTAssertTrue(reveal(toggle), "its switch is on the sheet")
    XCTAssertEqual(toggle.value as? String, "0", "it is off until asked for")
    reveal(add)
    add.tap()
    let question = app.alerts["これからも自動で反映しますか？"]
    XCTAssertTrue(question.waitForExistence(timeout: 10), "adding a month asks")
    snap("1-question")
    question.buttons["自動で反映する"].tap()
    XCTAssertTrue(app.navigationBars["保存しました"].waitForExistence(timeout: 5), "the month was put in")
    app.buttons.matching(NSPredicate(format: "label == '閉じる'")).firstMatch.tap()
    try step("reflecting")

    // A day's shift changed, several times: its event follows each time.
    let day = Self.day
    var title = ""
    for _ in 0..<3 {
      title = try change(day)
      try step("changed", saying: "\(Self.key(day)) \(title)")
    }

    // Launched again with nothing changed: nothing is written.
    app.terminate()
    app.launch()
    XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15), "the tabs show again")
    try step("relaunched")

    // Not asked a second time; turned off on the sheet, a change stays in the app.
    openSheet()
    XCTAssertTrue(reveal(toggle), "the switch is on the sheet")
    XCTAssertEqual(toggle.value as? String, "1", "it is on")
    snap("2-on")
    toggle.switches.firstMatch.tap()
    XCTAssertEqual(toggle.value as? String, "0", "it is turned off")
    app.navigationBars.buttons["閉じる"].tap()
    _ = try change(day)
    try step("off", saying: "\(Self.key(day)) \(title)")
  }

  /// Googleカレンダーに入れるには opens the site's guide in the system's
  /// browser over the sheet, each time it is tapped (spec/calendar.md).
  @MainActor
  func testTheGuideToGoogleCalendarOpens() throws {
    app.launchArguments += ["-sample", "-firstRunDone", "YES"]
    app.launch()
    XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15), "the tabs show")
    openSheet()
    let guide = app.buttons["Googleカレンダーに入れるには"]
    let browser = app.otherElements
      .matching(NSPredicate(format: "identifier BEGINSWITH 'BrowserView'")).firstMatch
    for time in ["first", "second"] {
      XCTAssertTrue(reveal(guide), "the guide's link is on the sheet")
      guide.tap()
      XCTAssertTrue(
        browser.webViews.firstMatch.waitForExistence(timeout: 10), "the browser opens, \(time)")
      snap("guide-\(time)")
      browser.buttons["閉じる"].firstMatch.tap()
      XCTAssertTrue(browser.waitForNonExistence(timeout: 5), "the browser closes, \(time)")
    }
  }

  /// A day of this month that is not today, so its cell is no other's.
  private static var day: DateComponents {
    var parts = Calendar.current.dateComponents([.year, .month, .day], from: .now)
    parts.day = parts.day == 20 ? 21 : 20
    return parts
  }

  private static func key(_ day: DateComponents) -> String {
    String(format: "%04d-%02d-%02d", day.year!, day.month!, day.day!)
  }

  /// The sheet's switch, named with the line under it.
  @MainActor private var toggle: XCUIElement {
    app.switches.matching(NSPredicate(format: "label BEGINSWITH '自動で反映'")).firstMatch
  }

  @MainActor private func openSheet() {
    let save = app.buttons["この月のシフトを保存"]
    XCTAssertTrue(save.waitForExistence(timeout: 10), "the month can be saved")
    save.tap()
    let item = app.buttons["端末カレンダーに追加"]
    XCTAssertTrue(item.waitForExistence(timeout: 5), "the menu offers the device's calendar")
    item.tap()
    XCTAssertTrue(
      app.navigationBars["端末カレンダーに追加"].waitForExistence(timeout: 10), "the sheet opens")
  }

  /// Scrolls the sheet until `element` can be tapped.
  @MainActor @discardableResult private func reveal(_ element: XCUIElement) -> Bool {
    for _ in 0..<4 where !(element.exists && element.isHittable) { app.swipeUp() }
    return element.exists && element.isHittable
  }

  /// Gives `day` another shift, 日勤 or else 夜勤, in its sheet, and says which.
  @MainActor private func change(_ day: DateComponents) throws -> String {
    let cell = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS %@", "\(day.month!)月\(day.day!)日(")).firstMatch
    XCTAssertTrue(cell.waitForExistence(timeout: 10), "the day shows")
    let title = cell.label.contains("日勤") ? "夜勤" : "日勤"
    cell.tap()
    let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'シフト'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the day's sheet shows its shift")
    row.tap()
    let choice = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
    XCTAssertTrue(choice.waitForExistence(timeout: 5), "\(title) is offered")
    choice.tap()
    let close = app.navigationBars.buttons["閉じる"]
    XCTAssertTrue(close.waitForExistence(timeout: 5), "back at the day")
    close.tap()
    XCTAssertTrue(
      app.descendants(matching: .any)
        .matching(
          NSPredicate(
            format: "label CONTAINS %@ AND label CONTAINS %@", "\(day.month!)月\(day.day!)日(",
            ")、\(title)")
        ).firstMatch.waitForExistence(timeout: 5), "the day shows \(title)")
    return title
  }

  @MainActor private func snap(_ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }

  /// Tells the script `name` is done, with what it is to look for, and
  /// waits for it to have read the calendar, failing when it says the
  /// calendar is not as it should be or says nothing in a minute.
  private func step(_ name: String, saying words: String = "") throws {
    let asked = shared.appending(path: name)
    let checked = shared.appending(path: "\(name).checked")
    let refused = shared.appending(path: "\(name).failed")
    try? FileManager.default.removeItem(at: checked)
    try Data(words.utf8).write(to: asked)
    let until = Date.now.addingTimeInterval(60)
    while Date.now < until {
      if FileManager.default.fileExists(atPath: checked.path) {
        try FileManager.default.removeItem(at: asked)
        return
      }
      if let why = try? String(contentsOf: refused, encoding: .utf8) {
        return XCTFail("\(name): \(why)")
      }
      RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.5))
    }
    XCTFail("the script did not answer \(name)")
  }
}
