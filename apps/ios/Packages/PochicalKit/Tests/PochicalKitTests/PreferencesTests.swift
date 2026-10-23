import Foundation
import PochicalProto
import SQLiteData
import SwiftProtobuf
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
  let week = try Pochical_V1_WeekPreference(serializedBytes: try #require(sent.first).value)
  #expect(week.start == 1)
}

@MainActor @Test func aPreferenceFromTheAccountIsTakenAndSentNowhere() async throws {
  let (settings, database, done) = try syncedSettings()
  defer { done() }
  try await database.write { db in
    var value = Pochical_V1_PreferenceValue()
    value.key = "theme"
    value.value = try Pochical_V1_ThemePreference.with { $0.id = "zen" }.serializedData()
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

@Test func anUnreadablePreferenceLeavesTheDevicesOwn() throws {
  var device = DeviceSettings()
  device.week.start = 1
  var look = Look()
  look.style = .emoji
  device.adopt(["week": Data([0xFF]), "look": try look.message.serializedData()])
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

  init(from decoder: any Swift.Decoder) throws {
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

  func encode(to encoder: any Swift.Encoder) throws {
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

  let messages: [String: String]
  let defaults: [String: JSONValue]
  let roundTrips: [Case]
  let unreadable: [Case]
}

/// The message `key` names.
private func message(of key: String) -> (any SwiftProtobuf.Message.Type)? {
  DeviceSettings.preferenceParts.first { $0.key == key }?.message
}

/// A message as JSON, so the vectors' values and the device's compare alike.
private func json(_ message: any SwiftProtobuf.Message) throws -> JSONValue {
  try JSONDecoder().decode(JSONValue.self, from: message.jsonUTF8Data())
}

/// What the device holds for each key, as JSON of the key's message.
private func held(by device: DeviceSettings) throws -> [String: JSONValue] {
  try Dictionary(
    uniqueKeysWithValues: device.preferences.map { key, value in
      (key, try json(try #require(message(of: key)).init(serializedBytes: value)))
    })
}

/// The vectors' values, read as each key's message and written as JSON again.
private func read(_ values: [String: JSONValue]) throws -> [String: JSONValue] {
  try Dictionary(
    uniqueKeysWithValues: values.map { key, value in
      (key, try json(try #require(message(of: key)).init(jsonUTF8Data: JSONEncoder().encode(value))))
    })
}

/// The account's values, as the vectors write them, as a device takes them:
/// each its key's message encoded, and for a key the app has none of, any
/// bytes.
private func account(_ values: [String: JSONValue]) throws -> [String: Data] {
  try Dictionary(
    uniqueKeysWithValues: values.map { key, value in
      let json = try JSONEncoder().encode(value)
      return (key, try message(of: key).map { try $0.init(jsonUTF8Data: json).serializedData() } ?? json)
    })
}

@Test func eachKeyIsTheMessageItNames() throws {
  #expect(
    Dictionary(uniqueKeysWithValues: DeviceSettings.preferenceParts.map { ($0.key, $0.message.protoMessageName) })
      == (try vectors("preferences", as: PreferenceVectors.self).messages))
}

@Test func aDeviceWhereNothingWasSetHoldsEachKeysDefault() throws {
  #expect(try held(by: DeviceSettings()) == read(vectors("preferences", as: PreferenceVectors.self).defaults))
}

@Test(arguments: try vectors("preferences", as: PreferenceVectors.self).roundTrips)
func aPreferenceTakenIsHeldAgain(_ vector: PreferenceVectors.Case) throws {
  var device = DeviceSettings()
  device.adopt(try account([vector.key: vector.value]))
  var expected = try vectors("preferences", as: PreferenceVectors.self).defaults
  expected[vector.key] = vector.value
  #expect(try held(by: device) == read(expected))
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
