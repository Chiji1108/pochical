import XCTest

/// The screens the stores' screenshots are drawn from (#806), photographed
/// in the order the app is walked rather than the stores': the sample
/// month and 端末カレンダーに追加; 職場のみんな's 一覧 and 全体チャット,
/// joined as 佐藤; the month again in 墨; the widgets in 墨, each put on
/// the Home Screen in turn; and last, as it takes days out of the month,
/// ポチポチ入力 halfway through it. Each is kept as the
/// file `packages/prototype/src/lib/store-shots.ts` names. Run by
/// `mise run store:shots:ios`, against the local server it seeds; skipped
/// without it.
final class StoreScreenshotTests: XCTestCase {
  private var app: XCUIApplication!
  /// Where the screens are kept, and the script's invitation is.
  private var raw: URL!

  override func setUpWithError() throws {
    continueAfterFailure = false
    guard let dir = ProcessInfo.processInfo.environment["STORE_SHOTS_DIR"] else {
      throw XCTSkip("run by mise run store:shots:ios")
    }
    raw = URL(filePath: dir)
    app = XCUIApplication()
  }

  @MainActor
  func test1Month() throws {
    launch()
    snap("02-calendar", of: XCUIScreen.main, into: raw)

    // 端末カレンダーに追加, with 自動で反映 turned on.
    let save = app.buttons["この月のシフトを保存"]
    XCTAssertTrue(save.waitForExistence(timeout: 10), "the month can be saved")
    save.tap()
    let item = app.buttons["端末カレンダーに追加"]
    XCTAssertTrue(item.waitForExistence(timeout: 5), "the menu offers the device's calendar")
    item.tap()
    XCTAssertTrue(
      app.navigationBars["端末カレンダーに追加"].waitForExistence(timeout: 10), "the sheet opens")
    let toggle = app.switches.matching(NSPredicate(format: "label BEGINSWITH '自動で反映'"))
      .firstMatch
    for _ in 0..<4 where !(toggle.exists && toggle.isHittable) { app.swipeUp() }
    toggle.switches.firstMatch.tap()
    XCTAssertEqual(toggle.value as? String, "1", "自動で反映 is on")
    snap("03-device-calendar", of: XCUIScreen.main, into: raw)
  }

  @MainActor
  func test2Group() throws {
    launch()
    try app.joins(invitation: raw.appending(path: "invite"), named: "佐藤")
    app.buttons["月で見る"].tap()
    let row = app.buttons.matching(NSPredicate(format: "label MATCHES '[0-9]{1,2}月[0-9]{1,2}日.*'"))
      .firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10), "一覧's rows show")
    snap("05-group-shifts", of: XCUIScreen.main, into: raw)
    app.navigationBars.firstMatch.buttons.firstMatch.tap()

    app.buttons.matching(NSPredicate(format: "label BEGINSWITH '全体チャット'")).firstMatch.tap()
    XCTAssertTrue(
      app.navigationBars.firstMatch.buttons["チャットのメニュー"].waitForExistence(timeout: 15),
      "the chat opens")
    let found = app.staticTexts
      .matching(NSPredicate(format: "label CONTAINS 'モバイルバッテリー'")).firstMatch
    XCTAssertTrue(found.waitForExistence(timeout: 10), "the chat's lines show")
    snap("06-chat", of: XCUIScreen.main, into: raw)
  }

  @MainActor
  func test3Sumi() throws {
    launch()
    pick(theme: "墨")
    snap("07-calendar-sumi", of: XCUIScreen.main, into: raw)
  }

  /// Each widget the gallery offers for the Home Screen, put on it,
  /// photographed by itself once it has drawn the person's days, and taken
  /// off again, so only one is ever there to find.
  @MainActor
  func test4Widgets() throws {
    let home = HomeScreen()
    let widgets = raw.appending(path: "04-widgets")
    try FileManager.default.createDirectory(at: widgets, withIntermediateDirectories: true)
    XCUIDevice.shared.press(.home)
    var page = 1
    var pages = 1
    while page <= pages {
      pages = home.openGallery()
      let (name, size) = home.show(page: page)
      guard let file = Self.widgetFiles[name], let suffix = Self.widgetSizes[size] else {
        return XCTFail("the widget \(name) (\(size)) has no file name")
      }
      home.addShown()
      snap("\(file)-\(suffix)", of: home.widgetFace, into: widgets)
      home.removeWidget()
      page += 1
    }
  }

  /// ポチポチ入力 halfway through the month, in the テーマ the app starts
  /// with: the sample month's days from the 16th taken out, as they are
  /// before they are entered, and the 16th the day to enter.
  @MainActor
  func test5Entry() throws {
    launch()
    pick(theme: "ポチカル")
    app.buttons["ポチポチ入力"].tap()
    let month = Calendar.current.component(.month, from: .now)
    let last = Calendar.current.range(of: .day, in: .month, for: .now)!.upperBound - 1
    let clear = app.buttons["消す"]
    let skip = app.buttons["翌日へ"]
    pickDay(month, 16)
    for day in 16...last {
      XCTAssertTrue(entering(month, day).waitForExistence(timeout: 5), "the tray is on \(day)日")
      // A day 夜勤 gave its 明け went with the 夜勤.
      if clear.isEnabled { clear.tap() } else if day < last { skip.tap() }
    }
    XCTAssertTrue(clear.wait(for: \.isEnabled, toEqual: false, timeout: 5), "the last day is blank")
    pickDay(month, 16)
    snap("01-entry", of: XCUIScreen.main, into: raw)
  }

  /// Taps the calendar's `day` while entering, for the tray to enter it.
  @MainActor private func pickDay(_ month: Int, _ day: Int) {
    let cell = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label BEGINSWITH %@", "\(month)月\(day)日、")).firstMatch
    XCTAssertTrue(cell.waitForExistence(timeout: 5), "the month shows \(day)日")
    cell.tap()
    XCTAssertTrue(entering(month, day).waitForExistence(timeout: 5), "the tray is on \(day)日")
  }

  /// The tray's words while it enters `day`.
  @MainActor private func entering(_ month: Int, _ day: Int) -> XCUIElement {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "label == %@", "入力する日付：\(month)月\(day)日")).firstMatch
  }

  /// Picks the テーマ named `theme` in 設定's スタイル, and comes back to
  /// the calendar in it.
  @MainActor private func pick(theme: String) {
    app.tabBars.buttons["設定"].tap()
    let style = app.collectionViews.firstMatch.buttons
      .matching(NSPredicate(format: "label BEGINSWITH 'スタイル'")).firstMatch
    XCTAssertTrue(style.waitForExistence(timeout: 5), "設定 lists スタイル")
    style.tap()
    let tile = app.buttons[theme]
    for _ in 0..<4 where !(tile.exists && tile.isHittable) { app.swipeUp() }
    tile.tap()
    XCTAssertTrue(tile.isSelected, "\(theme) is the テーマ")
    app.navigationBars["スタイル"].buttons.firstMatch.tap()
    app.tabBars.buttons["カレンダー"].tap()
    XCTAssertTrue(app.buttons["ポチポチ入力"].waitForExistence(timeout: 5), "the calendar shows")
  }

  /// The widgets by the names the gallery shows (PochicalWidgets), as their
  /// files are named, and their sizes as iOS words them.
  private static let widgetFiles = [
    "シンプル": "simple", "これから": "upcoming", "カレンダー": "calendar", "次の休み": "next-off",
    "いまのシフト": "now",
  ]
  private static let widgetSizes = ["小": "small", "中": "medium", "大": "large"]

  /// The app past はじめの設定 with the sample month, its tabs shown, and
  /// its offer of reminders already answered.
  @MainActor private func launch() {
    app.launchPastFirstRun(["-sample", "-reminderOffered", "YES"])
    XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15), "the tabs show")
  }
}

/// The Home Screen and its widget gallery: every step of SpringBoard's own
/// UI the widgets' photographs take, in the words iOS 27 has in Japanese,
/// the language the script sets the simulator to.
@MainActor private struct HomeScreen {
  private let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

  /// The app's widget on the Home Screen, with its name under it.
  private var widget: XCUIElement {
    springboard.icons
      .matching(NSPredicate(format: "identifier == 'ポチカル' AND value == 'ウィジェット'")).firstMatch
  }

  /// The widget alone, as it is drawn.
  var widgetFace: XCUIElement { widget.scrollViews.firstMatch }

  /// The gallery's pages of the app's widgets, one a widget and size.
  private var pages: XCUIElement {
    springboard.pageIndicators.matching(NSPredicate(format: "identifier != 'Page control'"))
      .firstMatch
  }

  /// Opens the gallery on the app's widgets, from the Home Screen at
  /// rest, and says how many pages it has.
  func openGallery() -> Int {
    XCTAssertTrue(
      springboard.otherElements["spotlight-pill"].waitForExistence(timeout: 10),
      "the Home Screen is at rest")
    // Between the icons' last row and the Dock, where no page has an icon.
    springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.79))
      .press(forDuration: 1.5)
    let edit = springboard.buttons["編集"]
    XCTAssertTrue(edit.waitForExistence(timeout: 5), "held, the Home Screen can be edited")
    edit.tap()
    let add = springboard.buttons["ウィジェットを追加"]
    XCTAssertTrue(add.waitForExistence(timeout: 5), "編集 offers a widget")
    add.tap()
    let search = springboard.searchFields.firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 5), "the gallery opens")
    search.tap()
    search.typeText("ポチカル")
    let app = springboard.cells["ポチカル"]
    XCTAssertTrue(app.waitForExistence(timeout: 5), "the gallery lists the app")
    app.tap()
    XCTAssertTrue(pages.waitForExistence(timeout: 5), "the app's widgets show")
    let value = pages.value as? String ?? ""
    let count = value.firstMatch(of: /全([0-9]+)ページ中/).flatMap { Int($0.1) }
    XCTAssertNotNil(count, "the widgets' pages are counted: \(value)")
    return count ?? 0
  }

  /// Turns the open gallery to its `page`, counted from 1, and says which
  /// widget it shows and in which size.
  func show(page: Int) -> (name: String, size: String) {
    for turned in 1..<page {
      springboard.swipeLeft()
      let next = XCTNSPredicateExpectation(
        predicate: NSPredicate(format: "value ENDSWITH %@", "の\(turned + 1)ページ目"), object: pages)
      XCTAssertEqual(
        XCTWaiter().wait(for: [next], timeout: 5), .completed, "the gallery turns to \(turned + 1)")
    }
    let shown = springboard.buttons
      .matching(NSPredicate(format: "label BEGINSWITH 'ポチカル, ' AND value BEGINSWITH 'ウィジェット, '"))
      .allElementsBoundByIndex.first(where: \.isHittable)
    guard let shown, let size = (shown.value as? String)?.split(separator: ", ").last else {
      XCTFail("page \(page) shows a widget")
      return ("", "")
    }
    return (String(shown.label.dropFirst("ポチカル, ".count)), String(size))
  }

  /// Puts the widget the gallery shows on the Home Screen, and waits for
  /// it to have drawn what it shows.
  func addShown() {
    springboard.buttons.matching(NSPredicate(format: "label CONTAINS 'ウィジェットを追加'"))
      .firstMatch.tap()
    let done = springboard.buttons["完了"]
    XCTAssertTrue(done.waitForExistence(timeout: 5), "the Home Screen is still being edited")
    done.tap()
    XCTAssertTrue(widget.waitForExistence(timeout: 10), "the widget is on the Home Screen")
    XCTAssertTrue(
      widget.staticTexts.firstMatch.waitForExistence(timeout: 20), "the widget has drawn its days")
  }

  /// Takes the app's widget off the Home Screen.
  func removeWidget() {
    widget.press(forDuration: 1.2)
    let remove = springboard.buttons[
      "com.apple.springboardhome.application-shortcut-item.remove-widget"]
    XCTAssertTrue(remove.waitForExistence(timeout: 5), "held, the widget can be removed")
    remove.tap()
    let confirm = springboard.alerts.buttons["削除"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "removing asks first")
    confirm.tap()
    XCTAssertTrue(widget.waitForNonExistence(timeout: 5), "the widget is gone")
  }
}
