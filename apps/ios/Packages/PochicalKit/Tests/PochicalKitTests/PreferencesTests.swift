import Foundation
import PochicalProto
import SQLiteData
import Testing

@testable import PochicalKit

/// A Settings on a store of its own, synced with a fresh database.
@MainActor private func syncedSettings() throws -> (Settings, any DatabaseWriter, () -> Void) {
  let suite = "test-\(UUID())"
  let store = try #require(UserDefaults(suiteName: suite))
  let database = try appDatabase()
  let settings = Settings(store: store)
  settings.sync(with: database)
  return (settings, database, { store.removePersistentDomain(forName: suite) })
}

@MainActor @Test func aPreferenceChangedGoesAsAnEditAndTheDevicesOwnStayBehind() throws {
  let (settings, database, done) = try syncedSettings()
  defer { done() }
  settings.device.week.start = 1
  settings.device.appearance = .dark
  settings.device.picture.dark = true
  let sent = try database.read { db in
    try OutboxEdit.order(by: \.id).fetchAll(db).map {
      try Pochical_V1_Change(serializedBytes: $0.change).preference
    }
  }
  #expect(sent.map(\.key) == ["week"])
  let week = try JSONDecoder().decode(
    DeviceSettings.Week.self, from: Data(try #require(sent.first).value.utf8))
  #expect(week.start == 1)
}

@MainActor @Test func aPreferenceFromTheAccountIsTakenAndSentNowhere() async throws {
  let (settings, database, done) = try syncedSettings()
  defer { done() }
  try await database.write { db in
    var value = Pochical_V1_PreferenceValue()
    value.key = "theme"
    value.value = #""zen""#
    var change = Pochical_V1_Change()
    change.cursor = 1
    change.preference = value
    try OwnValues.take(change, in: db)
  }
  for _ in 0..<100 where settings.device.themeID != "zen" {
    try await Task.sleep(for: .milliseconds(10))
  }
  #expect(settings.device.themeID == "zen")
  #expect(try await database.read { try OutboxEdit.fetchCount($0) } == 0)
}

@Test func anUnreadablePreferenceLeavesTheDevicesOwn() {
  var device = DeviceSettings()
  device.week.start = 1
  device.adopt(["week": "not json", "look": #"{"style":"emoji"}"#])
  #expect(device.week.start == 1)
  #expect(device.look.style == .emoji)
}
