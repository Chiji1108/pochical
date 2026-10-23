import Foundation
import GRDB
import PochicalProto
import SQLiteData
import SwiftProtobuf

/// The user's preferences, how they like their screens, kept with the
/// account so each of their devices shows the same (spec/sync-protocol.md,
/// Preferences): a key each, its value the part of DeviceSettings it names
/// as that key's message, encoded. What belongs to the device itself
/// (外観, the reminders, a picture's light or dark) is not among them.
@Table("preferences")
public struct PreferenceRow: Hashable, Sendable {
  @Column(primaryKey: true)
  public var key: String
  public var value: Data
}

extension DatabaseMigrator {
  mutating func registerPreferences() {
    registerMigration("Keep the user's preferences") { db in
      try #sql(
        """
        CREATE TABLE "preferences" (
          "key" TEXT PRIMARY KEY NOT NULL,
          "value" BLOB NOT NULL
        ) STRICT
        """
      )
      .execute(db)
    }
  }
}

extension OwnValues {
  /// Sets one of the user's preferences to `value`, its message encoded.
  static func setPreference(_ key: String, to value: Data, now: Int64, in db: Database) throws {
    var preference = Pochical_V1_PreferenceValue()
    preference.key = key
    preference.value = value
    preference.hlc = try nextClock(now: now, in: db)
    var change = Pochical_V1_Change()
    change.preference = preference
    try edit(change, opID: UUID().uuidString.lowercased(), in: db)
  }
}

/// One part of DeviceSettings kept with the account: its key, and the
/// message its value is, read and written in one place so a key never
/// goes as one message and is read as another.
struct PreferencePart: Sendable {
  let key: String
  let message: any SwiftProtobuf.Message.Type
  let encode: @Sendable (DeviceSettings) throws -> Data
  let adopt: @Sendable (inout DeviceSettings, Data) throws -> Void

  init<M: SwiftProtobuf.Message>(
    _ key: String,
    _ get: @escaping @Sendable (DeviceSettings) -> M,
    _ set: @escaping @Sendable (inout DeviceSettings, M) throws -> Void
  ) {
    self.key = key
    message = M.self
    // Maps in the same order each time, so a part unchanged encodes the same.
    var options = BinaryEncodingOptions()
    options.useDeterministicOrdering = true
    encode = { [options] in try get($0).serializedData(options: options) }
    adopt = { try set(&$0, M(serializedBytes: $1)) }
  }
}

extension DeviceSettings {
  /// The parts kept with the account, by key.
  static let preferenceParts = [
    PreferencePart("theme", { settings in .with { $0.id = settings.themeID } }) {
      (settings, theme: Pochical_V1_ThemePreference) in settings.themeID = theme.id
    },
    PreferencePart("look", \.look.message) { $0.look = try Look($1) },
    PreferencePart("week", \.week.message) { $0.week = Week($1) },
    PreferencePart("heading", \.heading.message) { $0.heading = Heading($1) },
    PreferencePart("picture", \.picture.options.message) { $0.picture.options = try MarkOptions($1) },
    PreferencePart("calendarAdd", \.calendarAdd.message) { $0.calendarAdd = CalendarAdd($1) },
  ]

  /// The parts kept with the account, each its key's message encoded.
  var preferences: [String: Data] {
    Dictionary(
      uniqueKeysWithValues: Self.preferenceParts.compactMap { part in
        (try? part.encode(self)).map { (part.key, $0) }
      })
  }

  /// Takes the parts the account keeps; a key it has none of, or one this
  /// app cannot read, leaves the device's own.
  mutating func adopt(_ preferences: [String: Data]) {
    for part in Self.preferenceParts {
      if let value = preferences[part.key] {
        try? part.adopt(&self, value)
      }
    }
  }
}

/// A preference holding what this app has no name for, as an app newer
/// than it may write.
struct UnknownPreferenceValue: Error {
  let value: String
}

extension RawRepresentable<String> {
  fileprivate init(preference value: String) throws {
    guard let known = Self(rawValue: value) else { throw UnknownPreferenceValue(value: value) }
    self = known
  }
}

extension MarkOptions {
  init(_ message: Pochical_V1_MarkOptions) throws {
    self.init(
      names: message.names, off: try OffLook(preference: message.off),
      offs: try message.offs.mapValues { try OffLook(preference: $0) })
  }

  var message: Pochical_V1_MarkOptions {
    .with {
      $0.names = names
      $0.off = off.rawValue
      $0.offs = offs.mapValues(\.rawValue)
    }
  }
}

extension Look {
  init(_ message: Pochical_V1_LookPreference) throws {
    self.init()
    style = try MarkStyle(preference: message.style)
    fill = message.fill
    colored = message.colored
    icon = try MarkOptions(message.icon)
    emoji = try MarkOptions(message.emoji)
    badge = try MarkOptions(message.badge)
  }

  var message: Pochical_V1_LookPreference {
    .with {
      $0.style = style.rawValue
      $0.fill = fill
      $0.colored = colored
      $0.icon = icon.message
      $0.emoji = emoji.message
      $0.badge = badge.message
    }
  }
}

extension DeviceSettings.Week {
  init(_ message: Pochical_V1_WeekPreference) {
    self.init()
    start = Int(message.start)
    sunday = message.sunday
    saturday = message.saturday
    holiday = message.holiday
  }

  var message: Pochical_V1_WeekPreference {
    .with {
      $0.start = Int32(start)
      $0.sunday = sunday
      $0.saturday = saturday
      $0.holiday = holiday
    }
  }
}

extension DeviceSettings.Heading {
  init(_ message: Pochical_V1_HeadingPreference) {
    self.init()
    english = message.english
    surprise = message.surprise
    sky = message.hasSky ? message.sky : nil
  }

  var message: Pochical_V1_HeadingPreference {
    .with {
      $0.english = english
      $0.surprise = surprise
      if let sky { $0.sky = sky }
    }
  }
}

extension CalendarAdd {
  init(_ message: Pochical_V1_CalendarAddPreference) {
    self.init()
    chosen = message.chosen
    notes = message.notes
    people = message.people
  }

  var message: Pochical_V1_CalendarAddPreference {
    .with {
      $0.chosen = chosen
      $0.notes = notes
      $0.people = people
    }
  }
}

extension Settings {
  /// Keeps the preferences with the account from now on: each as the user
  /// changes it goes as an edit, and each the account holds, from this
  /// device or another, is taken as it comes.
  public func sync(with database: any DatabaseWriter) {
    self.database = database
    watching?.cancel()
    watching = Task { [weak self] in
      let rows = ValueObservation.tracking { try PreferenceRow.fetchAll($0) }
      do {
        for try await rows in rows.values(in: database) {
          self?.adopt(Dictionary(rows.map { ($0.key, $0.value) }, uniquingKeysWith: { _, new in new }))
        }
      } catch {
        // The database goes only as the app does.
      }
    }
  }

  private func adopt(_ preferences: [String: Data]) {
    var adopted = device
    adopted.adopt(preferences)
    guard adopted != device else { return }
    adopting = true
    device = adopted
    adopting = false
  }

  /// Sends the preferences that differ from `old` as edits, unless they
  /// came from the account.
  func send(changedFrom old: DeviceSettings) {
    guard !adopting, let database else { return }
    let before = old.preferences
    let changed = device.preferences.filter { before[$0.key] != $0.value }
    guard !changed.isEmpty else { return }
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    try? database.write { db in
      for (key, value) in changed.sorted(by: { $0.key < $1.key }) {
        try OwnValues.setPreference(key, to: value, now: now, in: db)
      }
    }
  }
}
