import XCTest

/// The drawings a face can be in place of a photo (#1163): picked in
/// プロフィール's イラストを選ぶ, and one in place already for someone first
/// asked for their name and photo, making a group or joining one. Each
/// needs `mise run server`, as the photo is sent.
///
/// Joining reads the code to join by from the file `invite` in the folder
/// `TEST_RUNNER_FACE_DRAWING_DIR` names.
@MainActor
final class FaceDrawingTests: XCTestCase {
  private let app = XCUIApplication()
  private let names = [
    "ねこ", "いぬ", "うさぎ", "くま", "ペンギン", "ひよこ", "コーヒー", "おにぎり", "いちご", "花", "サボテン", "月",
  ]
  private var shared: URL? {
    ProcessInfo.processInfo.environment["FACE_DRAWING_DIR"].map { URL(filePath: $0) }
  }

  func testADrawingPickedBecomesTheFace() {
    continueAfterFailure = false
    app.launch()
    app.startsAsNewUser()
    let face = openProfile()
    face.tap()
    XCTAssertFalse(app.buttons["写真を削除"].exists, "a new user has no photo")
    app.buttons["イラストを選ぶ"].tap()
    XCTAssertTrue(app.navigationBars["イラストを選ぶ"].waitForExistence(timeout: 5))
    for name in names {
      XCTAssertTrue(app.buttons[name].exists, "the drawings offer \(name)")
    }
    snap("1-drawings")
    app.buttons["ねこ"].tap()

    // The drawing is the photo once it is sent: the face offers deleting it.
    let sent = expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: face)
    wait(for: [sent], timeout: 15)
    snap("2-face")
    face.tap()
    XCTAssertTrue(app.buttons["写真を削除"].waitForExistence(timeout: 5), "the drawing is the photo")
  }

  func testSomeoneNewMakingAGroupStartsWithADrawing() {
    continueAfterFailure = false
    app.launch()
    app.startsAsNewUser()
    app.tabBars.buttons["グループ"].tap()
    let new = app.buttons["グループを作る"].firstMatch
    XCTAssertTrue(new.waitForExistence(timeout: 5))
    new.tap()
    // The group above; below it, the person, in the row the join screen has.
    XCTAssertTrue(app.staticTexts["あなたの名前と写真"].waitForExistence(timeout: 5))
    let profile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '名前を入れてください'"))
      .firstMatch
    XCTAssertTrue(profile.waitForExistence(timeout: 5), "グループを作る asks how the person appears")
    saysTheseBecomeTheUsualOnes(profile, going: "作ると、")
    XCTAssertEqual(app.textFields.count, 1, "the name is asked in the row's page")
    snap("3a-new-group-opened")
    profile.tap()
    XCTAssertTrue(app.navigationBars["あなたの名前と写真"].waitForExistence(timeout: 5))
    let face = self.face
    face.tap()
    XCTAssertTrue(app.buttons["写真を削除"].waitForExistence(timeout: 5), "a drawing is in place")
    snap("3-new-group-drawing")
    // Another drawing in its place.
    app.buttons["イラストを選ぶ"].tap()
    XCTAssertTrue(app.buttons["月"].waitForExistence(timeout: 5))
    app.buttons["月"].tap()
    let name = app.textFields.firstMatch
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("さくら")
    snap("3b-new-group-profile")
    app.navigationBars.buttons.firstMatch.tap()
    let group = app.textFields.firstMatch
    XCTAssertTrue(group.waitForExistence(timeout: 5))
    group.tap()
    group.typeText("病棟")
    snap("4-new-group-changed")
    app.navigationBars.buttons["作る"].tap()

    // メンバーを招待 follows; its link, copied, is the other device's way
    // in (`xcrun simctl pbpaste`).
    let copy = app.buttons["リンクをコピー"]
    XCTAssertTrue(copy.waitForExistence(timeout: 20), "メンバーを招待 follows")
    copy.tap()
    XCTAssertTrue(app.buttons["コピーしました"].waitForExistence(timeout: 5))
    snap("5-invite")
  }

  func testTheFaceMadeWithAGroupIsTheUsualPhoto() {
    continueAfterFailure = false
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
    // The group made, with the faces of whoever has joined since.
    let groups = app.tabBars.buttons["グループ"]
    XCTAssertTrue(groups.waitForExistence(timeout: 20))
    groups.tap()
    XCTAssertTrue(app.buttons["月で見る"].waitForExistence(timeout: 15), "the group's hub shows")
    snap("6a-group-after-making")
    let face = openProfile()
    snap("6-profile-after-making")
    face.tap()
    XCTAssertTrue(app.buttons["写真を削除"].waitForExistence(timeout: 5), "the drawing is the usual photo")
  }

  func testSomeoneWithAUsualNameMakingAGroupIsAskedAsOnJoining() {
    continueAfterFailure = false
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
    let groups = app.tabBars.buttons["グループ"]
    XCTAssertTrue(groups.waitForExistence(timeout: 20))
    groups.tap()
    let new = app.buttons["グループを作る"].firstMatch
    XCTAssertTrue(new.waitForExistence(timeout: 15))
    new.tap()
    XCTAssertTrue(app.staticTexts["このグループでのあなた"].waitForExistence(timeout: 5))
    let profile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'さくら'")).firstMatch
    XCTAssertTrue(profile.waitForExistence(timeout: 5), "the row shows the usual name")
    XCTAssertTrue(profile.label.contains("いつもと同じ"), "and says it is the usual one: \(profile.label)")
    snap("12-new-group-usual-name")
  }

  func testSomeoneWithAUsualNameGivesANewGroupAFaceOfItsOwn() {
    continueAfterFailure = false
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
    let groups = app.tabBars.buttons["グループ"]
    XCTAssertTrue(groups.waitForExistence(timeout: 20))
    groups.tap()
    let new = app.buttons["グループを作る"].firstMatch
    XCTAssertTrue(new.waitForExistence(timeout: 15))
    new.tap()
    let profile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'さくら'")).firstMatch
    XCTAssertTrue(profile.waitForExistence(timeout: 5), "the row shows the usual name")
    profile.tap()
    XCTAssertTrue(app.navigationBars["このグループでのあなた"].waitForExistence(timeout: 5))
    face.tap()
    app.buttons["イラストを選ぶ"].tap()
    XCTAssertTrue(app.buttons["サボテン"].waitForExistence(timeout: 5))
    app.buttons["サボテン"].tap()
    app.navigationBars.buttons.firstMatch.tap()
    XCTAssertTrue(profile.waitForExistence(timeout: 5))
    XCTAssertTrue(profile.label.contains("このグループだけ"), "the face is this group's own: \(profile.label)")
    let group = app.textFields.firstMatch
    group.tap()
    group.typeText("夜勤")
    snap("13-new-group-own-face")
    app.navigationBars.buttons["作る"].tap()
    let copy = app.buttons["リンクをコピー"]
    XCTAssertTrue(copy.waitForExistence(timeout: 20), "メンバーを招待 follows")
    copy.tap()
    XCTAssertTrue(app.buttons["コピーしました"].waitForExistence(timeout: 5))
  }

  /// An account in use on a device that does not hold its profile yet (the
  /// app put back, still signed in, the server out of reach as it opens):
  /// nothing is put in place while the account's name and photo are not
  /// known, and once the server is back they show as theirs. Run with the
  /// server stopped, and start it while the test waits.
  func testAnAccountNotYetCaughtUpGetsNoDrawing() {
    continueAfterFailure = false
    app.launchArguments += ["-firstRunDone", "YES"]
    app.launch()
    let groups = app.tabBars.buttons["グループ"]
    XCTAssertTrue(groups.waitForExistence(timeout: 20))
    groups.tap()
    let new = app.buttons["グループを作る"].firstMatch
    XCTAssertTrue(new.waitForExistence(timeout: 15))
    new.tap()
    let unknown = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '名前を入れてください'"))
      .firstMatch
    XCTAssertTrue(unknown.waitForExistence(timeout: 10), "the device holds no usual name yet")
    snap("14-not-caught-up")
    // The catch-up brings the usual name and photo: the row is the usual
    // ones, which a drawing put in place meanwhile would not be.
    let known = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'さくら'")).firstMatch
    XCTAssertTrue(known.waitForExistence(timeout: 180), "the catch-up brings the usual name")
    XCTAssertTrue(app.staticTexts["このグループでのあなた"].exists)
    XCTAssertTrue(known.label.contains("いつもと同じ"), "no drawing took the usual photo's place: \(known.label)")
    snap("15-caught-up")
  }

  func testSomeoneNewJoiningStartsWithADrawing() throws {
    continueAfterFailure = false
    let dir = try XCTUnwrap(shared, "FACE_DRAWING_DIR names where the invitation is")
    let code = try String(contentsOf: dir.appending(path: "invite"), encoding: .utf8)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    app.launch()
    app.startsAsNewUser()
    app.open(URL(string: "pochical://invite/\(code)")!)
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let confirm = springboard.buttons.matching(NSPredicate(format: "label IN {'開く', 'Open'}"))
      .firstMatch
    if confirm.waitForExistence(timeout: 5) { confirm.tap() }
    let profile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '名前を入れてください'"))
      .firstMatch
    XCTAssertTrue(profile.waitForExistence(timeout: 15), "the join screen opens")
    saysTheseBecomeTheUsualOnes(profile, going: "参加すると、")
    snap("7-join-drawing")
    profile.tap()
    XCTAssertTrue(app.navigationBars["あなたの名前と写真"].waitForExistence(timeout: 5))
    let face = self.face
    face.tap()
    XCTAssertTrue(app.buttons["写真を削除"].waitForExistence(timeout: 5), "a drawing is in place")
    snap("8-join-profile-menu")
    // Taken off, it stays off: the letter, and nothing to delete.
    app.buttons["写真を削除"].tap()
    let field = app.textFields.firstMatch
    field.tap()
    field.typeText("みどり")
    snap("9-join-profile-removed")
    face.tap()
    XCTAssertTrue(app.buttons["イラストを選ぶ"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["写真を削除"].exists, "taking it off brings no drawing back")
    // Picked again, it is the face joined with.
    app.buttons["イラストを選ぶ"].tap()
    XCTAssertTrue(app.buttons["いちご"].waitForExistence(timeout: 5))
    app.buttons["いちご"].tap()
    app.navigationBars.buttons.firstMatch.tap()
    let join = app.buttons["参加する"]
    XCTAssertTrue(join.waitForExistence(timeout: 5))
    snap("10-join-picked")
    join.tap()
    XCTAssertTrue(app.buttons["月で見る"].waitForExistence(timeout: 15), "the group's hub shows")
    snap("11-joined")
  }

  /// With no usual name yet there is no usual one for the row to be the
  /// same as: what going on does with the name and face is said under it.
  private func saysTheseBecomeTheUsualOnes(_ row: XCUIElement, going: String) {
    XCTAssertFalse(row.label.contains("いつもと同じ"), "nothing is usual yet: \(row.label)")
    let note = app.staticTexts.matching(
      NSPredicate(format: "label BEGINSWITH %@", "\(going)この名前と写真がいつもの名前と写真になり")
    ).firstMatch
    XCTAssertTrue(note.exists, "the row's note says what \(going) does")
  }

  /// 設定 › プロフィール, and the face heading it.
  private func openProfile() -> XCUIElement {
    let settings = app.tabBars.buttons["設定"]
    XCTAssertTrue(settings.waitForExistence(timeout: 20))
    settings.tap()
    let profile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'プロフィール'"))
      .firstMatch
    XCTAssertTrue(profile.waitForExistence(timeout: 5))
    profile.tap()
    XCTAssertTrue(face.waitForExistence(timeout: 5), "プロフィール heads with the face")
    return face
  }

  /// The face heading a page, one button with 写真を編集 under it.
  private var face: XCUIElement {
    app.buttons.matching(NSPredicate(format: "label CONTAINS '写真を編集'")).firstMatch
  }

  private func snap(_ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}
