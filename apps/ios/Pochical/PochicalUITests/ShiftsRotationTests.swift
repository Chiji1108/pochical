import XCTest

/// A big group's 一覧 turned to landscape and back (POC-132): its rows are
/// drawn where they are laid out, under their faces, and the list stays
/// on the days it showed. Run by `mise run ios:shifts-rotation`, against
/// the local server it starts with a group of twelve; skipped without it.
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
  func test4OpensInLandscape() throws {
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

  @MainActor private func launch(_ arguments: [String] = []) {
    app = XCUIApplication()
    app.launchArguments += ["-firstRunDone", "YES"] + arguments
    app.launch()
  }

  /// Opens 一覧, turns it to landscape and back, and checks it each time.
  @MainActor private func turn(_ name: String) {
    XCUIDevice.shared.orientation = .portrait
    openList()
    continueAfterFailure = true
    let portrait = settled()
    snap("\(name)-portrait")
    XCTAssertEqual(portrait.top, today(), "一覧 opens on today")

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

  /// The group's 一覧, from the グループ tab.
  @MainActor private func openList() {
    let tab = app.tabBars.buttons["グループ"]
    if tab.waitForExistence(timeout: 10) { tab.tap() }
    let shifts = app.buttons["月で見る"]
    XCTAssertTrue(shifts.waitForExistence(timeout: 15), "the group's hub shows")
    shifts.tap()
    let layout = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '週ごと'")).firstMatch
    XCTAssertTrue(layout.waitForExistence(timeout: 10), "a big group opens on 週ごと")
    layout.tap()
    app.buttons["一覧"].tap()
    XCTAssertTrue(topRow().waitForExistence(timeout: 10), "一覧's rows show")
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
