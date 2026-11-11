import XCTest

/// The screens the stores' screenshots are drawn from (#806), photographed
/// in the order the app is walked rather than the stores': the sample
/// month and 端末カレンダーに追加; 学生時代の友だち's 一覧, joined as まい,
/// and 職場のみんな's 全体チャット, joined as 佐藤; a page of a シフトの期間
/// from the 15th; the widgets, each put on the Home Screen in turn, those
/// that can be set to someone also set to the group's first member and to
/// the group; the month and the widgets in 墨, in black and white
/// (`Style.sumi`), and the month with its shifts as letters
/// (`Style.letters`); then, as they change the month's days, ポチポチ入力
/// halfway through it, as the app starts again, and いまのシフト's widget
/// once more with a shift on; and last, as it changes the job,
/// 繰り返しを直す on a fixed cycle. Each is kept as the file
/// `packages/prototype/src/lib/store-shots.ts` names. Run by
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
  func test01Month() throws {
    launch()

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
    snap("06-device-calendar", of: XCUIScreen.main, into: raw)
  }

  /// The friends' group, joined as まい with ひよこ for a face, the name
  /// and the drawing picked there the usual ones from then on.
  @MainActor
  func test02Friends() throws {
    launch()
    try app.joins(invitation: raw.appending(path: "invite-friends"), named: "まい", face: "ひよこ")
    app.buttons["月で見る"].tap()
    let row = app.buttons.matching(NSPredicate(format: "label MATCHES '[0-9]{1,2}月[0-9]{1,2}日.*'"))
      .firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10), "一覧's rows show")
    snap("03-group-shifts", of: XCUIScreen.main, into: raw)
  }

  /// The coworkers' group, joined as 佐藤 there alone.
  @MainActor
  func test03Coworkers() throws {
    launch()
    try app.joins(invitation: raw.appending(path: "invite"), named: "佐藤", over: "まい")
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH '全体チャット'")).firstMatch.tap()
    XCTAssertTrue(
      app.navigationBars.firstMatch.buttons["チャットのメニュー"].waitForExistence(timeout: 15),
      "the chat opens")
    let found = app.staticTexts
      .matching(NSPredicate(format: "label CONTAINS 'モバイルバッテリー'")).firstMatch
    XCTAssertTrue(found.waitForExistence(timeout: 10), "the chat's lines show")
    snap("04-chat", of: XCUIScreen.main, into: raw)
  }

  /// A month that runs from the 15th: シフトの期間 set in 設定's カレンダー,
  /// the page holding today photographed, and the month put back.
  @MainActor
  func test04Period() throws {
    launch()
    pick(period: "15日〜翌月14日")
    // The page's heading and the week its first day is in.
    let now = Calendar.current.dateComponents([.year, .month, .day], from: .now)
    let first = DateComponents(year: now.year, month: now.month! - (now.day! < 15 ? 1 : 0), day: 15)
    let heading = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS '日〜'")).firstMatch
    XCTAssertTrue(heading.waitForExistence(timeout: 5), "the page is named by its days")
    try snap("07-details-period", from: heading.frame.minY, until: rowTop(first, after: 7))
    pick(period: "1日〜末日")
  }

  @MainActor
  func test05Widgets() throws {
    try photographWidgets(into: "02-widgets")
  }

  @MainActor
  func test06Sumi() throws {
    launch()
    pick(.sumi)
    snap("05-calendar-sumi", of: XCUIScreen.main, into: raw)
  }

  @MainActor
  func test07SumiWidgets() throws {
    try photographWidgets(into: "02-widgets-sumi")
  }

  @MainActor
  func test08Letters() throws {
    launch()
    pick(.letters)
    snap("05-calendar-letters", of: XCUIScreen.main, into: raw)
  }

  /// ポチポチ入力 halfway through the month, as the app starts: the sample
  /// month's days from the 16th taken out, as they are before they are
  /// entered, and the 16th the day to enter.
  @MainActor
  func test09Entry() throws {
    launch()
    pick(.started)
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

    // 夜勤 entered brings the next day's 明け.
    enter("夜勤", month, 16)
    XCTAssertTrue(day(month, 17, holding: "明け").waitForExistence(timeout: 5), "17日 is 明け")
    // The week of the two days, between the weeks before and after it.
    let entered = DateComponents(
      year: Calendar.current.component(.year, from: .now), month: month, day: 16)
    try snap(
      "07-details-next-day", from: rowTop(entered, after: -7), until: rowTop(entered, after: 14))
  }

  /// いまのシフト with its ring, which it draws while a shift is on: one of
  /// the sample's that is on now is entered for it, 夜勤 (16:30 to 9:30 the
  /// next day) on the day before until 9:00, 日勤 (9:00 to 18:00) today
  /// until 18:00 and 夜勤 today after, and the widget photographed again as
  /// the app starts. After the screens that show the month, as it changes a
  /// day of it.
  @MainActor
  func test10Ring() throws {
    launch()
    app.buttons["ポチポチ入力"].tap()
    let hour = Calendar.current.component(.hour, from: .now)
    let on = Calendar.current.date(byAdding: .day, value: hour < 9 ? -1 : 0, to: .now)!
    let shift = (9..<18).contains(hour) ? "日勤" : "夜勤"
    let month = Calendar.current.component(.month, from: on)
    let day = Calendar.current.component(.day, from: on)
    pickDay(month, day)
    enter(shift, month, day)
    try photographWidgets(into: "02-widgets", only: "いまのシフト")
  }

  /// 繰り返しを直す on a fixed cycle of three days, 当務・非番・週休, in the
  /// month after this one: the job changed in 設定 to the ready-made
  /// 当番・非番・休み, from next month's 1st as it offers, then 当番 and 休み
  /// named as those who work the cycle call them. Last of all, as the days
  /// from then on are the new job's.
  @MainActor
  func test11Repeat() throws {
    launch()
    app.tabBars.buttons["設定"].tap()
    open(page: "シフトパターン")
    for step in ["新しい仕事にする", "次へ", "繰り返しがある", "当番・非番・休み", "次へ"] { press(step) }
    XCTAssertTrue(
      app.navigationBars["「当番」の日を押す"].waitForExistence(timeout: 5), "the order is typed")
    app.navigationBars.buttons["完了"].tap()
    let change = app.alerts.buttons["切り替える"]
    XCTAssertTrue(change.waitForExistence(timeout: 5), "完了 asks first")
    change.tap()
    for (name, called) in [("当番", "当務"), ("休み", "週休")] {
      XCTAssertTrue(
        app.navigationBars["シフトパターン"].waitForExistence(timeout: 5), "the patterns show")
      press(name)
      XCTAssertTrue(app.navigationBars["パターンを編集"].waitForExistence(timeout: 5), "\(name) opens")
      let field = app.textFields.firstMatch
      // The name, one word at the field's trailing edge, picked by two taps and typed over.
      field.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).doubleTap()
      field.typeText(called)
      XCTAssertEqual(field.value as? String, called, "\(name) is named \(called)")
      app.navigationBars["パターンを編集"].buttons["保存"].tap()
    }
    XCTAssertTrue(
      app.navigationBars["シフトパターン"].waitForExistence(timeout: 5), "the patterns show")
    app.navigationBars["シフトパターン"].buttons.firstMatch.tap()
    open(page: "繰り返し")
    let coming = app.buttons.matching(NSPredicate(format: "label ENDSWITH 'からの繰り返し'"))
      .firstMatch
    XCTAssertTrue(coming.waitForExistence(timeout: 5), "the new job's period is listed")
    coming.tap()
    press("カレンダーで直す")
    XCTAssertTrue(app.navigationBars["繰り返しを直す"].waitForExistence(timeout: 5), "the order opens")
    // The month's name and its first two weeks, the cycle come round in them.
    let today = Calendar.current.dateComponents([.year, .month], from: .now)
    let title = app.buttons.matching(NSPredicate(format: "label MATCHES '[0-9]+年[0-9]+月.*'"))
      .firstMatch
    try snap(
      "07-details-repeat", from: title.frame.minY,
      until: rowTop(DateComponents(year: today.year, month: today.month! + 1, day: 1), after: 14))
  }

  /// Taps the button whose words hold `name`, a page down where the page
  /// does not show it yet.
  @MainActor private func press(_ name: String) {
    let button = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
    XCTAssertTrue(button.waitForExistence(timeout: 5), "\(name) is offered")
    for _ in 0..<4 where !button.isHittable { app.swipeUp() }
    button.tap()
  }

  /// Each widget the gallery offers for the Home Screen, put on it,
  /// photographed by itself once it has drawn the person's days, then set
  /// to each of whom it can be and photographed again
  /// (`<widget>-<person | group>-<size>`), and taken off, so only one is
  /// ever there to find: into `folder`, in the look the app is in. `only`
  /// names the one widget to photograph, when not all.
  @MainActor private func photographWidgets(into folder: String, only: String? = nil) throws {
    let home = HomeScreen()
    let widgets = raw.appending(path: folder)
    try FileManager.default.createDirectory(at: widgets, withIntermediateDirectories: true)
    XCUIDevice.shared.press(.home)
    var page = 1
    var pages = 1
    while page <= pages {
      pages = home.openGallery()
      var (name, size) = home.show(page: page)
      while let only, name != only, page < pages {
        page += 1
        (name, size) = home.show(page: page, from: page - 1)
      }
      if let only { XCTAssertEqual(name, only, "the gallery offers \(only)") }
      guard let file = Self.widgetFiles[name], let suffix = Self.widgetSizes[size] else {
        return XCTFail("the widget \(name) (\(size)) has no file name")
      }
      home.addShown()
      snap("\(file)-\(suffix)", of: home.widgetFace, into: widgets)
      for (whom, choice, says) in Self.widgetChoices[name] ?? [] {
        home.setWidget(to: choice, saying: says)
        snap("\(file)-\(whom)-\(suffix)", of: home.widgetFace, into: widgets)
      }
      home.removeWidget()
      if only != nil { break }
      page += 1
    }
  }

  /// The calendar's `day`, once it holds `shift` when one is named: the
  /// one on the screen, as the months beside the one shown hold its first
  /// and last days too.
  @MainActor private func day(_ month: Int, _ day: Int, holding shift: String = "") -> XCUIElement {
    let days = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label BEGINSWITH %@", "\(month)月\(day)日、\(shift)"))
    return days.allElementsBoundByIndex.first { app.frame.contains($0.frame) } ?? days.firstMatch
  }

  /// The calendar's day `days` after `date`, whatever it holds: a day of
  /// the month before or after shows in the month's weeks too.
  @MainActor private func day(_ date: DateComponents, after days: Int) -> XCUIElement {
    let on = Calendar.current.date(
      byAdding: .day, value: days, to: Calendar.current.date(from: date)!)!
    return day(
      Calendar.current.component(.month, from: on), Calendar.current.component(.day, from: on))
  }

  /// Where the row of the calendar's day `days` after `date` begins on the
  /// screen: midway between the foot of the days in the row over it and
  /// its own top, as a day's element holds its date and mark, not the room
  /// around them.
  @MainActor private func rowTop(_ date: DateComponents, after days: Int) -> CGFloat {
    let top = day(date, after: days).frame.minY
    let over = (1...7).map { day(date, after: days - $0).frame }
      .filter { app.frame.contains($0) && $0.maxY <= top }.map(\.maxY).max()
    return ((over ?? top) + top) / 2
  }

  /// Keeps as `name` the part of the screen from `top` down to `foot`, as
  /// wide as the screen: whole rows of it, for a tile of the details'
  /// shot.
  @MainActor private func snap(_ name: String, from top: CGFloat, until foot: CGFloat) throws {
    let screen = XCUIScreen.main.screenshot().image
    let rows = CGRect(
      x: 0, y: top * screen.scale, width: screen.size.width * screen.scale,
      height: (foot - top) * screen.scale)
    let part = try XCTUnwrap(screen.cgImage?.cropping(to: rows), "\(name) is cut from the screen")
    try XCTUnwrap(UIImage(cgImage: part).pngData()).write(to: raw.appending(path: "\(name).png"))
  }

  /// Presses the tray's key of `shift` on the `day` being entered.
  @MainActor private func enter(_ shift: String, _ month: Int, _ day: Int) {
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", shift)).firstMatch.tap()
    XCTAssertTrue(
      self.day(month, day, holding: shift).waitForExistence(timeout: 5), "\(day)日 is \(shift)")
  }

  /// Picks `period` as 設定's カレンダー's シフトの期間, and comes back to the
  /// calendar in it.
  @MainActor private func pick(period: String) {
    app.tabBars.buttons["設定"].tap()
    open(page: "カレンダー")
    // The list's last row, below the page as it opens.
    let row = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS '1ページの期間'")).firstMatch
    for _ in 0..<4 where !(row.exists && row.isHittable) { app.swipeUp() }
    row.tap()
    // The menu opens on the period in use: the month is its first, above.
    let choice = app.buttons[period]
    for _ in 0..<8 where !(choice.exists && choice.isHittable) { app.swipeDown() }
    choice.tap()
    app.navigationBars["カレンダー"].buttons.firstMatch.tap()
    app.tabBars.buttons["カレンダー"].tap()
    XCTAssertTrue(app.buttons["ポチポチ入力"].waitForExistence(timeout: 5), "the calendar shows")
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

  /// A look of the app, by the choices of 設定's スタイル that give it, in
  /// the page's order (シフトの見た目, テーマ, シフトの色, 休みの見せ方), and
  /// whether カレンダー's 色をつける日 are on.
  private struct Style {
    let shape: String
    let theme: String
    let colors: String
    let off: String
    let coloredDays: Bool

    /// As the app starts.
    static let started = Style(
      shape: "塗り", theme: "ポチカル", colors: "色分け", off: "強調", coloredDays: true)
    /// 墨 with nothing colored and nothing filled: black and white.
    static let sumi = Style(
      shape: "線", theme: "墨", colors: "ワントーン", off: "印だけ", coloredDays: false)
    /// The shifts as letters, each in its color, in ソーダ.
    static let letters = Style(
      shape: "文字", theme: "ソーダ", colors: "色分け", off: "印だけ", coloredDays: true)
  }

  /// Picks `style` in 設定, as the person would: スタイル's choices and
  /// カレンダー's 色をつける日, and comes back to the calendar in them.
  @MainActor private func pick(_ style: Style) {
    app.tabBars.buttons["設定"].tap()
    open(page: "スタイル")
    for choice in [style.shape, style.theme, style.colors, style.off] {
      let tile = app.buttons[choice]
      if choice == style.theme {
        // テーマ's pages, a few テーマ each: turned by their dots to the one holding it.
        let dots = app.otherElements["テーマのページ"]
        for _ in 0..<4 where !(dots.exists && dots.isHittable) { app.swipeUp() }
        for dot in dots.buttons.allElementsBoundByIndex where !(tile.exists && tile.isHittable) {
          dot.tap()
        }
      }
      for _ in 0..<4 where !(tile.exists && tile.isHittable) { app.swipeUp() }
      tile.tap()
      XCTAssertTrue(tile.isSelected, "\(choice) is picked")
    }
    app.navigationBars["スタイル"].buttons.firstMatch.tap()
    open(page: "カレンダー")
    let value = style.coloredDays ? "1" : "0"
    for day in ["土曜", "日曜", "祝日"] {
      let toggle = app.switches.matching(NSPredicate(format: "label == %@", day)).firstMatch
      for _ in 0..<4 where !(toggle.exists && toggle.isHittable) { app.swipeUp() }
      if toggle.value as? String != value { toggle.switches.firstMatch.tap() }
      XCTAssertEqual(toggle.value as? String, value, "\(day) is colored or not")
    }
    app.navigationBars["カレンダー"].buttons.firstMatch.tap()
    app.tabBars.buttons["カレンダー"].tap()
    XCTAssertTrue(app.buttons["ポチポチ入力"].waitForExistence(timeout: 5), "the calendar shows")
  }

  /// Opens the page 設定 lists as `name`.
  @MainActor private func open(page name: String) {
    let row = app.collectionViews.firstMatch.buttons
      .matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "設定 lists \(name)")
    row.tap()
    XCTAssertTrue(app.navigationBars[name].waitForExistence(timeout: 5), "\(name) opens")
  }

  /// The widgets by the names the gallery shows (PochicalWidgets), as their
  /// files are named, and their sizes as iOS words them.
  private static let widgetFiles = [
    "シンプル": "simple", "これから": "upcoming", "カレンダー": "calendar", "次の休み": "next-off",
    "いまのシフト": "now",
  ]
  private static let widgetSizes = ["小": "small", "中": "medium", "大": "large"]
  /// Whom a widget can be set to, of the seed's group: its first member,
  /// and for 次の休み the group itself. Each by the word its file takes,
  /// the choice as the widget's editing lists it, under its group, and
  /// what the widget says once it is theirs.
  private static let widgetChoices = [
    "次の休み": [
      ("person", "田中, 職場のみんな", "田中さんと一緒に休める日"),
      ("group", "みんな休み, 職場のみんな", "職場のみんなのみんな休み"),
    ],
    "これから": [("person", "田中, 職場のみんな", "田中さん、")],
  ]

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

  /// Turns the open gallery, on the page `from`, to its `page`, counted
  /// from 1, and says which widget it shows and in which size.
  func show(page: Int, from: Int = 1) -> (name: String, size: String) {
    for turned in from..<page {
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

  /// Sets the widget on the Home Screen to `choice`, as its editing lists
  /// them (ウィジェットを編集), and waits for it to say `says`.
  func setWidget(to choice: String, saying says: String) {
    widget.press(forDuration: 1.2)
    let edit = springboard.buttons[
      "com.apple.springboardhome.application-shortcut-item.configure-widget"]
    XCTAssertTrue(edit.waitForExistence(timeout: 5), "held, the widget can be edited")
    edit.tap()
    // The card's one question, its button saying whom it is set to so far.
    let whom = springboard.tables.cells.buttons.firstMatch
    XCTAssertTrue(whom.waitForExistence(timeout: 5), "the widget asks whom")
    whom.tap()
    let listed = springboard.buttons[choice]
    XCTAssertTrue(listed.waitForExistence(timeout: 5), "the widget's editing lists \(choice)")
    listed.tap()
    // Outside the card, which closes it.
    springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.06)).tap()
    let said = widget.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS %@", says)).firstMatch
    XCTAssertTrue(said.waitForExistence(timeout: 20), "the widget is \(choice)'s")
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
