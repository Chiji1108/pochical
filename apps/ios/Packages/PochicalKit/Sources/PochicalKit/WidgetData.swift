import Foundation
import SQLiteData

// What a widget reads (spec/widgets.md): the database the app keeps in the
// App Group, opened read-only, as only the app writes, and the device's
// settings the app keeps there too.

/// The app's database, read-only, as the widgets open it; nil until the
/// app has made it.
public func widgetDatabase() throws -> (any DatabaseReader)? {
  let url = try sharedDatabaseURL()
  guard FileManager.default.fileExists(atPath: url.path()) else { return nil }
  var configuration = Configuration()
  configuration.readonly = true
  return try DatabasePool(path: url.path(), configuration: configuration)
}

extension OwnCalendar {
  /// The person's own calendar as the database holds it.
  public init(_ db: Database) throws {
    self.init(
      days: try DayRow.fetchAll(db), patterns: try PatternRow.fetchAll(db),
      patternOrder: try PatternOrderRow.fetchAll(db), orders: try RepeatOrderRow.fetchAll(db))
  }
}

extension DeviceSettings {
  /// The settings as the app last kept them, its defaults before then.
  public static func kept(
    store: UserDefaults = UserDefaults(suiteName: appGroup) ?? .standard
  ) -> DeviceSettings {
    store.data(forKey: Settings.storeKey).flatMap {
      try? JSONDecoder().decode(DeviceSettings.self, from: $0)
    } ?? DeviceSettings()
  }
}
