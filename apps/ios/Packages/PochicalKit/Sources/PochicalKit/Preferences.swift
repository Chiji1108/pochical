import Foundation
import GRDB
import PochicalProto
import SQLiteData

/// The user's preferences, how they like their screens, kept with the
/// account so each of their devices shows the same (spec/sync-protocol.md,
/// Preferences): a key each, its value the part of DeviceSettings it names
/// as JSON. What belongs to the device itself (外観, the reminders, a
/// picture's light or dark) is not among them.
@Table("preferences")
public struct PreferenceRow: Hashable, Sendable {
  @Column(primaryKey: true)
  public var key: String
  public var value: String
}

extension DatabaseMigrator {
  mutating func registerPreferences() {
    registerMigration("Keep the user's preferences") { db in
      try #sql(
        """
        CREATE TABLE "preferences" (
          "key" TEXT PRIMARY KEY NOT NULL,
          "value" TEXT NOT NULL
        ) STRICT
        """
      )
      .execute(db)
    }
  }
}

extension OwnValues {
  /// Sets one of the user's preferences to `value`, its JSON.
  static func setPreference(_ key: String, to value: String, now: Int64, in db: Database) throws {
    var preference = Pochical_V1_PreferenceValue()
    preference.key = key
    preference.value = value
    preference.hlc = try nextClock(now: now, in: db)
    var change = Pochical_V1_Change()
    change.preference = preference
    try edit(change, opID: UUID().uuidString.lowercased(), in: db)
  }
}

extension DeviceSettings {
  /// The keys of the parts kept with the account.
  static let preferenceKeys = ["theme", "look", "week", "heading", "picture", "calendarAdd"]

  /// The parts kept with the account, each as its key's JSON.
  var preferences: [String: String] {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    func json(_ value: some Encodable) -> String? {
      (try? encoder.encode(value)).flatMap { String(data: $0, encoding: .utf8) }
    }
    let parts: [String: String?] = [
      "theme": json(themeID), "look": json(look), "week": json(week), "heading": json(heading),
      "picture": json(picture.options), "calendarAdd": json(calendarAdd),
    ]
    return parts.compactMapValues(\.self)
  }

  /// Takes the parts the account keeps; a key it has none of, or one this
  /// app cannot read, leaves the device's own.
  mutating func adopt(_ preferences: [String: String]) {
    func value<T: Decodable>(_ key: String, as type: T.Type) -> T? {
      preferences[key].flatMap { try? JSONDecoder().decode(type, from: Data($0.utf8)) }
    }
    if let theme = value("theme", as: String.self) { themeID = theme }
    if let look = value("look", as: Look.self) { self.look = look }
    if let week = value("week", as: Week.self) { self.week = week }
    if let heading = value("heading", as: Heading.self) { self.heading = heading }
    if let options = value("picture", as: MarkOptions.self) { picture.options = options }
    if let calendarAdd = value("calendarAdd", as: CalendarAdd.self) {
      self.calendarAdd = calendarAdd
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

  private func adopt(_ preferences: [String: String]) {
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
