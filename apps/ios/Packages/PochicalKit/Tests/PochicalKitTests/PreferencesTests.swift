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

/// A value as the vectors write it, JSON of any shape.
enum JSONValue: Codable, Equatable, Sendable {
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])

  init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    if let bool = try? container.decode(Bool.self) {
      self = .bool(bool)
    } else if let number = try? container.decode(Double.self) {
      self = .number(number)
    } else if let string = try? container.decode(String.self) {
      self = .string(string)
    } else if let array = try? container.decode([JSONValue].self) {
      self = .array(array)
    } else {
      self = .object(try container.decode([String: JSONValue].self))
    }
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .bool(let bool): try container.encode(bool)
    case .number(let number): try container.encode(number)
    case .string(let string): try container.encode(string)
    case .array(let array): try container.encode(array)
    case .object(let object): try container.encode(object)
    }
  }
}

struct PreferenceVectors: Decodable {
  struct Case: VectorCase {
    let name: String
    let key: String
    let value: JSONValue
  }

  let defaults: [String: JSONValue]
  let roundTrips: [Case]
  let unreadable: [Case]
}

/// What the device holds for each key, as the vectors write it.
private func held(by device: DeviceSettings) throws -> [String: JSONValue] {
  try device.preferences.mapValues { try JSONDecoder().decode(JSONValue.self, from: Data($0.utf8)) }
}

/// The account's values, as the vectors write them, as a device takes them.
private func account(_ values: [String: JSONValue]) throws -> [String: String] {
  try values.mapValues { String(decoding: try JSONEncoder().encode($0), as: UTF8.self) }
}

@Test func aDeviceWhereNothingWasSetHoldsEachKeysDefault() throws {
  #expect(try held(by: DeviceSettings()) == vectors("preferences", as: PreferenceVectors.self).defaults)
}

@Test(arguments: try vectors("preferences", as: PreferenceVectors.self).roundTrips)
func aPreferenceTakenIsHeldAgain(_ vector: PreferenceVectors.Case) throws {
  var device = DeviceSettings()
  device.adopt(try account([vector.key: vector.value]))
  var expected = try vectors("preferences", as: PreferenceVectors.self).defaults
  expected[vector.key] = vector.value
  #expect(try held(by: device) == expected)
}

@Test(arguments: try vectors("preferences", as: PreferenceVectors.self).unreadable)
func aPreferenceTheDeviceCannotTakeLeavesItsOwn(_ vector: PreferenceVectors.Case) throws {
  let held = try vectors("preferences", as: PreferenceVectors.self).roundTrips
  var device = DeviceSettings()
  device.adopt(try account(Dictionary(uniqueKeysWithValues: held.map { ($0.key, $0.value) })))
  let before = device
  device.adopt(try account([vector.key: vector.value]))
  #expect(device == before)
}
