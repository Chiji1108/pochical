import XCTest

/// A big group's 一覧 turned to landscape and back (POC-132): its rows are
/// drawn where they are laid out, under their faces, and the list stays
/// on the days it showed; its 今日 shows while today is out of sight
/// (POC-156); and its 週ごと opens on today's week (POC-162). Run by
/// `mise run ios:shifts-rotation`, against the local server it starts
/// with a group of twelve; skipped without it.
final class ShiftsRotationTests: XCTestCase {
  private var app: XCUIApplication!
  private var shared: URL!

  override func setUpWithError() throws {
    continueAfterFailure = false
    guard let dir = ProcessInfo.processInfo.environment["SHIFTS_ROTATION_DIR"] else {
      throw XCTSkip("run by mise run ios:shifts-rotation")
    }
    shared = URL(filePath: dir)
  }

  /// Upright again for the next test, however this one ended.
  override func tearDown() {
    MainActor.assumeIsolated { XCUIDevice.shared.orientation = .portrait }
  }

  @MainActor
  func test1JoinsTheGroup() throws {
    launch()
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
    XCTAssertTrue(app.buttons["月で見る"].waitForExistence(timeout: 15), "the group's hub shows")
  }

  @MainActor
  func test2Turns() throws {
    launch()
    turn("default")
  }

  @MainActor
  func test3TurnsAtTheLargestText() throws {
    launch(["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
    turn("largest")
  }

  @MainActor
  func test4PicksAMonthAndTurns() throws {
    launch()
    turn("picked", year: year(1))
  }

  @MainActor
  func test5PicksAMonthAndTurnsAtTheLargestText() throws {
    launch(["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
    turn("picked-largest", year: year(1))
  }

  @MainActor
  func test6OpensInLandscape() throws {
    launch()
    XCUIDevice.shared.orientation = .landscapeLeft
    openList()
    continueAfterFailure = true
    let landscape = settled()
    snap("opened-landscape")
    XCTAssertEqual(landscape.top, today(), "landscape opens on today")
    checkRows("opened in landscape")

    let row = topRow()
    row.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 2))
      .press(
        forDuration: 0.05, thenDragTo: row.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: -2)),
        withVelocity: .fast, thenHoldForDuration: 0)
    // The カレンダー tab has its own, out of sight.
    let buttons = app.buttons.matching(NSPredicate(format: "label == '今日に戻る'"))
    let shows = expectation(
      for: NSPredicate { _, _ in buttons.allElementsBoundByIndex.contains(where: \.isHittable) },
      evaluatedWith: nil)
    wait(for: [shows], timeout: 5)
    buttons.allElementsBoundByIndex.first(where: \.isHittable)?.tap()
    XCTAssertEqual(settled().top, today(), "今日 goes back to today")
    snap("today-again-landscape")
    checkRows("back on today")
    XCUIDevice.shared.orientation = .portrait
  }

  /// 今日 shows exactly while today is out of sight, after 月を選ぶ, a
  /// change of layout and 今日 itself move the list (POC-156).
  @MainActor
  func test7ShowsTodayAfterAJump() throws {
    launch()
    openList(in: nil)
    continueAfterFailure = true
    _ = settled()
    snap("today-opened")
    checkToday("opened in 週ごと")

    switchLayout(from: "週ごと", to: "一覧")
    XCTAssertEqual(settled().top, today(), "一覧 goes to today")
    checkToday("in 一覧, on today")

    pick(year(1))
    _ = settled()
    snap("today-far")
    checkAway("a year on")

    pick(year(0))
    _ = settled()
    snap("today-month")
    checkToday("back in today's month")

    // A new layout goes to today's day or week.
    switchLayout(from: "一覧", to: "週ごと")
    _ = settled()
    snap("today-weeks")
    checkToday("in 週ごと, on today's week")

    pick(year(1))
    _ = settled()
    checkAway("in 週ごと, a year on")

    switchLayout(from: "週ごと", to: "一覧")
    XCTAssertEqual(settled().top, today(), "一覧 goes to today")
    snap("today-days")
    checkToday("in 一覧 again, on today")

    pick(year(1))
    _ = settled()
    todayButton().tap()
    XCTAssertEqual(settled().top, today(), "今日 goes back to today")
    snap("today-tapped")
    checkToday("after 今日")
  }

  /// Launched and opened again and again, its members read later each
  /// time, up to two seconds, 週ごと lands on today's week, not on one the
  /// heights SwiftUI guesses put at the top (POC-162).
  @MainActor
  func test8OpensOnTodaysWeek() throws {
    continueAfterFailure = true
    for open in 1...20 {
      launch(["-membersReadLate", "\(open * 100)"])
      let tab = app.tabBars.buttons["グループ"]
      if tab.waitForExistence(timeout: 10) { tab.tap() }
      let shifts = app.buttons["月で見る"]
      XCTAssertTrue(shifts.waitForExistence(timeout: 15), "the group's hub shows")
      shifts.tap()
      let row = app.buttons.matching(NSPredicate(format: "label MATCHES %@", today() + "([^0-9].*)?"))
        .firstMatch
      // Until the list has stopped where it lands.
      var frame = CGRect.null
      var tries = 0
      while row.waitForExistence(timeout: 5), row.frame != frame, tries < 10 {
        frame = row.frame
        tries += 1
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.5))
      }
      let landed = row.exists && row.isHittable && !todayButton().exists
      if !landed { snap("opened-\(open)") }
      XCTAssertTrue(landed, "open \(open) lands on today's week")
    }
  }

  @MainActor private func launch(_ arguments: [String] = []) {
    app = XCUIApplication()
    app.launchArguments += ["-firstRunDone", "YES"] + arguments
    app.launch()
  }

  /// Opens 一覧, goes to the month in sight in `year` with 月を選ぶ if
  /// given, turns it to landscape and back, and checks it each time.
  @MainActor private func turn(_ name: String, year: String? = nil) {
    XCUIDevice.shared.orientation = .portrait
    openList()
    continueAfterFailure = true
    if let year {
      let month = settled().month.replacing(/^[0-9]{4}年/, with: year)
      pick(year)
      XCTAssertEqual(settled().month, month, "月を選ぶ goes to the month")
      let picked = settled().top
      scrollByHand()
      XCTAssertNotEqual(settled().top, picked, "the list is scrolled by hand")
    } else {
      XCTAssertEqual(settled().top, today(), "一覧 opens on today")
    }
    let portrait = settled()
    snap("\(name)-portrait")

    XCUIDevice.shared.orientation = .landscapeLeft
    let landscape = settled()
    snap("\(name)-landscape")
    XCTAssertEqual(landscape.month, portrait.month, "landscape stays on the month")
    XCTAssertEqual(landscape.top, portrait.top, "landscape stays on the day at the top")
    checkRows("in landscape")

    XCUIDevice.shared.orientation = .portrait
    let back = settled()
    snap("\(name)-portrait-again")
    XCTAssertEqual(back.month, portrait.month, "portrait again stays on the month")
    XCTAssertEqual(back.top, portrait.top, "portrait again stays on the day at the top")
    checkRows("in portrait again")
  }

  /// The bar's 今日; the カレンダー tab has its own, out of sight.
  @MainActor private func todayButton() -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label == '今日に戻る'"))
      .allElementsBoundByIndex.first(where: \.isHittable) ?? app.buttons["no 今日"]
  }

  /// 今日 is in the bar exactly while less than half of today's row is in
  /// sight below the faces; not judged with the row near half, at the
  /// screen's edge. Only with this year's months in sight: rows name no
  /// year.
  @MainActor private func checkToday(_ when: String) {
    let below = faces().first?.frame.maxY ?? 0
    var sight = app.windows.firstMatch.frame
    sight = sight.divided(atDistance: below - sight.minY, from: .minYEdge).remainder
    let row = app.buttons.matching(NSPredicate(format: "label MATCHES %@", today() + "([^0-9].*)?"))
      .allElementsBoundByIndex.first(where: \.isHittable)
    let shown = row.map { $0.frame.intersection(sight).height / $0.frame.height } ?? 0
    guard abs(shown - 0.5) > 0.25 else { return }
    XCTAssertEqual(todayButton().exists, shown < 0.5, "今日 shows while today is out of sight, \(when)")
  }

  /// 今日 is in the bar, the list a year or more from today.
  @MainActor private func checkAway(_ when: String) {
    XCTAssertTrue(todayButton().exists, "今日 shows, \(when)")
  }

  /// The year `offset` years from this one, as 月を選ぶ's wheel names it.
  private func year(_ offset: Int) -> String {
    "\(Calendar.current.component(.year, from: Date()) + offset)年"
  }

  /// A member's column across a big group's 一覧.
  private let column: CGFloat = 40

  /// The top row is drawn where it is laid out, and, with everyone in
  /// sight, its last column under the last face.
  @MainActor private func checkRows(_ when: String) {
    let row = topRow()
    let start = drawnStart(of: row)
    XCTAssertGreaterThanOrEqual(start, row.frame.minX - 1, "the row is drawn where it is, \(when)")
    XCTAssertLessThanOrEqual(start, row.frame.minX + 16, "the row is drawn where it is, \(when)")
    let faces = self.faces()
    if faces.count == 12, let last = faces.last {
      XCTAssertEqual(
        last.frame.midX, row.frame.maxX - column / 2, accuracy: 4,
        "the last face is over the last column, \(when)")
    }
  }

  /// Where the screen shows anything along `row`'s middle, from the left:
  /// today's bar, at the row's own start, or its date just after.
  @MainActor private func drawnStart(of row: XCUIElement) -> CGFloat {
    let shot = XCUIScreen.main.screenshot().image
    // Upright: a landscape screenshot's pixels are kept as the portrait
    // screen's, turned by its orientation.
    let format = UIGraphicsImageRendererFormat()
    format.scale = shot.scale
    let upright = UIGraphicsImageRenderer(size: shot.size, format: format).image { _ in
      shot.draw(at: .zero)
    }
    guard let image = upright.cgImage, let data = image.dataProvider?.data,
      let bytes = CFDataGetBytePtr(data)
    else { return -1 }
    let scale = CGFloat(image.width) / upright.size.width
    let y = Int(row.frame.midY * scale)
    let stride = image.bytesPerRow
    let step = image.bitsPerPixel / 8
    func pixel(_ x: Int) -> [UInt8] { (0..<3).map { bytes[y * stride + x * step + $0] } }
    let ground = pixel(1)
    let start = (1..<image.width).first { x in
      zip(pixel(x), ground).contains { abs(Int($0) - Int($1)) > 24 }
    }
    return CGFloat(start ?? 0) / scale
  }

  /// Drags the list up a few rows, held at the end so it stops there.
  @MainActor private func scrollByHand() {
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
      .press(
        forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)),
        withVelocity: .default, thenHoldForDuration: 0.5)
  }

  /// Turns 月を選ぶ's year wheel to `year`, and closes it. One wheel
  /// only: the wheels follow the list, which moves as each one stops.
  @MainActor private func pick(_ year: String) {
    app.buttons.matching(NSPredicate(format: "label MATCHES '[0-9]{4}年[0-9]{1,2}月'")).firstMatch
      .tap()
    let wheels = app.pickerWheels
    XCTAssertTrue(wheels.firstMatch.waitForExistence(timeout: 5), "月を選ぶ opens")
    wheels.matching(NSPredicate(format: "value ENDSWITH '年'")).firstMatch
      .adjust(toPickerWheelValue: year)
    // A tap outside the wheels closes them: low on the screen, as they can
    // come up over the bar.
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)).tap()
    let closed = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: wheels.firstMatch)
    wait(for: [closed], timeout: 5)
  }

  /// The group's 一覧, or what it opens on, from the グループ tab.
  @MainActor private func openList(in layout: String? = "一覧") {
    let tab = app.tabBars.buttons["グループ"]
    if tab.waitForExistence(timeout: 10) { tab.tap() }
    let shifts = app.buttons["月で見る"]
    XCTAssertTrue(shifts.waitForExistence(timeout: 15), "the group's hub shows")
    shifts.tap()
    if let layout { switchLayout(from: "週ごと", to: layout) }
    XCTAssertTrue(topRow().waitForExistence(timeout: 10), "the rows show")
  }

  /// From the layout menu, which a big group opens on 週ごと.
  @MainActor private func switchLayout(from: String, to: String) {
    let menu = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", from)).firstMatch
    XCTAssertTrue(menu.waitForExistence(timeout: 10), "the layout menu shows \(from)")
    menu.tap()
    app.buttons[to].tap()
  }

  /// The month named over the list, and the day of the row at its top.
  @MainActor private func shown() -> (month: String, top: String) {
    let month = app.buttons.matching(NSPredicate(format: "label MATCHES '[0-9]{4}年[0-9]{1,2}月'"))
      .firstMatch
    XCTAssertTrue(month.waitForExistence(timeout: 5), "the month in sight is named")
    return (month.label, topRow().label)
  }

  /// What `shown` reads once the turn has finished.
  @MainActor private func settled() -> (month: String, top: String) {
    var last = shown()
    for _ in 0..<10 {
      RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.5))
      let now = shown()
      if now == last { return now }
      last = now
    }
    return last
  }

  /// Today's row as it is named.
  private func today() -> String {
    let today = Calendar.current.dateComponents([.month, .day], from: Date())
    return "\(today.month!)月\(today.day!)日"
  }

  /// The faces over the columns, a member each, left to right.
  @MainActor private func faces() -> [XCUIElement] {
    let all = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label MATCHES 'テスト[0-9]*'"))
      .allElementsBoundByIndex.filter(\.isHittable)
    var seen = Set<CGFloat>()
    return all.filter { seen.insert($0.frame.minX).inserted }.sorted { $0.frame.minX < $1.frame.minX }
  }

  /// The highest day's row in sight, under the faces.
  @MainActor private func topRow() -> XCUIElement {
    let below = faces().first?.frame.maxY ?? 0
    let rows = app.buttons.matching(NSPredicate(format: "label MATCHES '[0-9]{1,2}月[0-9]{1,2}日.*'"))
      .allElementsBoundByIndex.filter { $0.isHittable && $0.frame.minY >= below }
    return rows.min { $0.frame.minY < $1.frame.minY } ?? app.buttons["no row"]
  }

  @MainActor private func snap(_ name: String) {
    let screenshot = XCUIScreen.main.screenshot()
    let shot = XCTAttachment(screenshot: screenshot)
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
    try? screenshot.pngRepresentation.write(to: shared.appending(path: "\(name).png"))
  }
}
