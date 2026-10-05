import Foundation
import Testing

@testable import PochicalKit

@Test func aSettingMissingFromWhatWasKeptTakesItsDefault() throws {
  let kept = Data(#"{"week":{"start":1}}"#.utf8)
  let settings = try JSONDecoder().decode(DeviceSettings.self, from: kept)
  #expect(settings.week.start == 1)
  #expect(settings.week.saturday)
  #expect(settings.week.holiday)
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
  #expect(look.options == MarkOptions(highlight: true))
  look.options.names = true
  look.style = .emoji
  #expect(look.options == MarkOptions())
  look.style = .icon
  #expect(look.options.names)
  let kept = Data(#"{"look":{"style":"badge"}}"#.utf8)
  let settings = try JSONDecoder().decode(DeviceSettings.self, from: kept)
  #expect(settings.look.style == .badge)
  #expect(settings.look.fill)
  #expect(settings.look.icon.highlight)
}
