import Foundation
import PochicalDesign
import Testing

@testable import PochicalKit

@Test func aSettingMissingFromWhatWasKeptTakesItsDefault() throws {
  let kept = Data(#"{"week":{"start":1}}"#.utf8)
  let settings = try JSONDecoder().decode(DeviceSettings.self, from: kept)
  #expect(settings.week.start == 1)
  #expect(settings.week.saturday)
  #expect(settings.week.holiday)
  // A picture names its shifts and tints days off until set otherwise.
  #expect(settings.picture.options == MarkOptions(names: true, off: .highlight))
  #expect(settings.picture.dark == nil)
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

@Test func eachShapeKeepsItsOwnOptions() throws {
  var look = Look()
  #expect(look.options == MarkOptions(off: .highlight))
  look.options.names = true
  look.style = .emoji
  #expect(look.options == MarkOptions())
  look.style = .icon
  #expect(look.options.names)
  let kept = Data(#"{"look":{"style":"badge"}}"#.utf8)
  let settings = try JSONDecoder().decode(DeviceSettings.self, from: kept)
  #expect(settings.look.style == .badge)
  #expect(settings.look.fill)
  #expect(settings.look.icon.off == .highlight)
}

@Test func eachDayOffKeepsItsOwnLook() throws {
  var options = MarkOptions(off: .highlight)
  options.offs["off"] = .blank
  #expect(options.offLook(of: "off") == .blank)
  // One not set yet shows as the shape's own.
  #expect(options.offLook(of: "paid") == .highlight)
  let kept = Data(#"{"look":{"icon":{"off":"mark","offs":{"off":"blank","paid":"highlight"}}}}"#.utf8)
  let settings = try JSONDecoder().decode(DeviceSettings.self, from: kept)
  #expect(settings.look.icon.offLook(of: "off") == .blank)
  #expect(settings.look.icon.offLook(of: "paid") == .highlight)
  #expect(settings.look.icon.offLook(of: "wish") == .mark)
}

@Test func settingADayOffsLookDropsPatternsNoLongerThere() {
  var look = Look()
  look.setOffLook(.blank, of: "gone", offPatterns: ["gone", "off"])
  look.style = .badge
  look.setOffLook(.highlight, of: "off", offPatterns: ["off"])
  #expect(look.badge.offs == ["off": .highlight])
  #expect(look.icon.offs.isEmpty)
}

@Test func aThemeNoLongerKnownIsTheAppsOwn() throws {
  let kept = Data(#"{"themeID":"gone"}"#.utf8)
  let settings = try JSONDecoder().decode(DeviceSettings.self, from: kept)
  #expect(settings.theme == .pochical)
  #expect(settings.look.colored)
}

@Test func appearanceFollowsThePhoneUntilSet() throws {
  #expect(DeviceSettings().appearance == .system)
  let kept = Data(#"{"appearance":"dark"}"#.utf8)
  #expect(try JSONDecoder().decode(DeviceSettings.self, from: kept).appearance == .dark)
}
