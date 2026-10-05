import Foundation
import Observation
import PochicalDesign

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
  public var look = Look()
  /// The テーマ's id, as /design's preset; one no longer known is the app's
  /// own.
  public var themeID = Theme.pochical.rawValue

  public var theme: Theme {
    get { Theme(rawValue: themeID) ?? .pochical }
    set { themeID = newValue.rawValue }
  }

  public init() {}

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    week = try container.decodeIfPresent(Week.self, forKey: .week) ?? Week()
    look = try container.decodeIfPresent(Look.self, forKey: .look) ?? Look()
    themeID = try container.decodeIfPresent(String.self, forKey: .themeID) ?? Theme.pochical.rawValue
  }
}

/// How a pattern's mark is drawn: its icon, its emoji or its letter on a
/// tile.
public enum MarkStyle: String, Codable, CaseIterable, Sendable {
  case icon
  case emoji
  case badge
}

/// How the person's own month draws days in one shape (/design's
/// CalendarOptions): the shift's name under its mark, days off on a tint
/// of their color, and days off left blank.
public struct MarkOptions: Codable, Equatable, Sendable {
  public var names = false
  public var highlight = false
  public var blankOff = false

  public init(names: Bool = false, highlight: Bool = false, blankOff: Bool = false) {
    self.names = names
    self.highlight = highlight
    self.blankOff = blankOff
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    names = try container.decodeIfPresent(Bool.self, forKey: .names) ?? false
    highlight = try container.decodeIfPresent(Bool.self, forKey: .highlight) ?? false
    blankOff = try container.decodeIfPresent(Bool.self, forKey: .blankOff) ?? false
  }
}

/// The marks' look (/design's スタイル): the shape, an icon's fill, and the
/// options kept for each shape, so each finds its own as it was left.
/// Icons start with days off highlighted; letters sit on tiles already and
/// emoji bring their own colors, so they start without.
public struct Look: Codable, Equatable, Sendable {
  public var style = MarkStyle.icon
  /// Filled (塗り) or outlined (線); icons alone have the choice.
  public var fill = true
  /// シフトの色: each shift in its own color (色分け), or all of them in
  /// the テーマ's, the palette's first.
  public var colored = true
  public var icon = MarkOptions(highlight: true)
  public var emoji = MarkOptions()
  public var badge = MarkOptions()

  public init() {}

  /// The options of the shape in use.
  public var options: MarkOptions {
    get {
      switch style {
      case .icon: icon
      case .emoji: emoji
      case .badge: badge
      }
    }
    set {
      switch style {
      case .icon: icon = newValue
      case .emoji: emoji = newValue
      case .badge: badge = newValue
      }
    }
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let defaults = Look()
    style = try container.decodeIfPresent(MarkStyle.self, forKey: .style) ?? defaults.style
    fill = try container.decodeIfPresent(Bool.self, forKey: .fill) ?? defaults.fill
    colored = try container.decodeIfPresent(Bool.self, forKey: .colored) ?? defaults.colored
    icon = try container.decodeIfPresent(MarkOptions.self, forKey: .icon) ?? defaults.icon
    emoji = try container.decodeIfPresent(MarkOptions.self, forKey: .emoji) ?? defaults.emoji
    badge = try container.decodeIfPresent(MarkOptions.self, forKey: .badge) ?? defaults.badge
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
