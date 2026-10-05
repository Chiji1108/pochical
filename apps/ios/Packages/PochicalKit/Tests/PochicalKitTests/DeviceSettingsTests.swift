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
  let store = try #require(UserDefaults(suiteName: "test-\(UUID())"))
  let settings = Settings(store: store)
  #expect(settings.device == DeviceSettings())
  settings.device.week.start = 1
  settings.device.week.saturday = false
  #expect(Settings(store: store).device == settings.device)
}
