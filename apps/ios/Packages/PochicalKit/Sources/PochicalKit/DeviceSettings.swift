import Foundation
import Observation

/// What the person set for their own screen, kept on this device alone, as
/// /design's device settings are (apps/web/src/lib/design-settings-store.ts).
/// Kept in the App Group, so the widgets draw the same week.
public struct DeviceSettings: Codable, Equatable, Sendable {
  /// The calendar's week: the day it starts on, and which days take a
  /// color of their own (/design's カレンダー page).
  public struct Week: Codable, Equatable, Sendable {
    /// 0 for Sunday, to 6 for Saturday.
    public var start = 0
    /// Sundays and Saturdays color the weekdays' heading; holidays color
    /// their date, in Sunday's red.
    public var sunday = true
    public var saturday = true
    public var holiday = true

    public init() {}

    // A setting missing from what was kept takes its default.
    public init(from decoder: any Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      let defaults = Week()
      start = try container.decodeIfPresent(Int.self, forKey: .start) ?? defaults.start
      sunday = try container.decodeIfPresent(Bool.self, forKey: .sunday) ?? defaults.sunday
      saturday = try container.decodeIfPresent(Bool.self, forKey: .saturday) ?? defaults.saturday
      holiday = try container.decodeIfPresent(Bool.self, forKey: .holiday) ?? defaults.holiday
    }
  }

  public var week = Week()

  public init() {}

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    week = try container.decodeIfPresent(Week.self, forKey: .week) ?? Week()
  }
}

/// The device settings as the screens read and change them, kept as each
/// change is made.
@MainActor @Observable public final class Settings {
  public var device: DeviceSettings {
    didSet { keep() }
  }

  private let store: UserDefaults
  private static let key = "deviceSettings"

  public init(store: UserDefaults = UserDefaults(suiteName: appGroup) ?? .standard) {
    self.store = store
    device =
      store.data(forKey: Self.key).flatMap {
        try? JSONDecoder().decode(DeviceSettings.self, from: $0)
      } ?? DeviceSettings()
  }

  private func keep() {
    if let data = try? JSONEncoder().encode(device) {
      store.set(data, forKey: Self.key)
    }
  }
}
