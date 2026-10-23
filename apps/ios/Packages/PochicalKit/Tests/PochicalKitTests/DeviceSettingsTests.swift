import Foundation
import PochicalDesign
import Testing

@testable import PochicalKit

@Test func settingsStartWithEachDefault() {
  let settings = DeviceSettings()
  #expect(settings.week.start == 0)
  #expect(settings.week.saturday)
  #expect(settings.week.holiday)
  // A picture names its shifts and tints days off until set otherwise.
  #expect(settings.picture.options == MarkOptions(names: true, off: .highlight))
  #expect(settings.picture.dark == nil)
}

@MainActor @Test func settingsKeptInAnotherShapeStartAgain() throws {
  let suite = "test-\(UUID())"
  let store = try #require(UserDefaults(suiteName: suite))
  defer { store.removePersistentDomain(forName: suite) }
  store.set(Data(#"{"week":{"start":1}}"#.utf8), forKey: Settings.storeKey)
  #expect(Settings(store: store).device == DeviceSettings())
}

@MainActor @Test func settingsAreKeptAsTheyChange() throws {
  let suite = "test-\(UUID())"
  let store = try #require(UserDefaults(suiteName: suite))
  defer { store.removePersistentDomain(forName: suite) }
  let settings = Settings(store: store)
  #expect(settings.device == DeviceSettings())
  settings.device.week.start = 1
  settings.device.week.saturday = false
  #expect(Settings(store: store).device == settings.device)
}

@Test func eachShapeKeepsItsOwnOptions() {
  var look = Look()
  #expect(look.options == MarkOptions(off: .highlight))
  look.options.names = true
  look.style = .emoji
  #expect(look.options == MarkOptions())
  look.style = .icon
  #expect(look.options.names)
}

@Test func eachDayOffKeepsItsOwnLook() {
  var options = MarkOptions(off: .highlight)
  options.offs["off"] = .blank
  #expect(options.offLook(of: "off") == .blank)
  // One not set yet shows as the shape's own.
  #expect(options.offLook(of: "paid") == .highlight)
  let marks = MarkOptions(off: .mark, offs: ["off": .blank, "paid": .highlight])
  #expect(marks.offLook(of: "off") == .blank)
  #expect(marks.offLook(of: "paid") == .highlight)
  #expect(marks.offLook(of: "wish") == .mark)
}

@Test func settingADayOffsLookDropsPatternsNoLongerThere() {
  var look = Look()
  look.setOffLook(.blank, of: "gone", offPatterns: ["gone", "off"])
  look.style = .badge
  look.setOffLook(.highlight, of: "off", offPatterns: ["off"])
  #expect(look.badge.offs == ["off": .highlight])
  #expect(look.icon.offs.isEmpty)
}

@Test func aPictureSetsEachDayOffApart() {
  var picture = PictureLook()
  picture.options.setOffLook(.blank, of: "gone", offPatterns: ["gone", "off"])
  picture.options.setOffLook(.blank, of: "off", offPatterns: ["off", "paid"])
  #expect(picture.options.offs == ["off": .blank])
  // Those not set yet are tinted, as the picture starts.
  #expect(picture.options.offLook(of: "paid") == .highlight)
  // Set back as it starts, a pattern is not kept.
  picture.options.setOffLook(.highlight, of: "off", offPatterns: ["off", "paid"])
  #expect(picture.options.offs.isEmpty)
}

@Test func aThemeNoLongerKnownIsTheAppsOwn() {
  var settings = DeviceSettings()
  settings.themeID = "gone"
  #expect(settings.theme == .pochical)
  #expect(settings.look.colored)
}

@Test func appearanceFollowsThePhoneUntilSet() {
  #expect(DeviceSettings().appearance == .system)
}
