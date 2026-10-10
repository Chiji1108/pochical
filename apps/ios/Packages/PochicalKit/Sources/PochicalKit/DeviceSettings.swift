import Foundation
import Observation
import PochicalDesign
import SQLiteData

/// What the person set for their own screen, as /design's device settings
/// are (apps/web/src/lib/design-settings-store.ts). Kept in the App Group,
/// so the widgets draw the same week; the parts that are the person's own
/// liking are kept with the account too (Preferences.swift), and 外観,
/// the reminders and a picture's light or dark stay with the device.
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

  /// The calendar's month heading: 月と曜日 in Japanese or English, and
  /// what a tap on the month's name does, with おたのしみ's sky
  /// (/design's monthName, monthTap and sky).
  public struct Heading: Codable, Equatable, Sendable {
    /// 月と曜日 set to English: months as Sep, weekdays as Thu.
    public var english = false
    /// A tap on the month's name lights おたのしみ's sky rather than
    /// picking a month.
    public var surprise = false
    /// Which sky is up, kept until the next tap; none until the name is
    /// first tapped.
    public var sky: String?

    public init() {}

    public init(from decoder: any Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      english = try container.decodeIfPresent(Bool.self, forKey: .english) ?? false
      surprise = try container.decodeIfPresent(Bool.self, forKey: .surprise) ?? false
      sky = try container.decodeIfPresent(String.self, forKey: .sky)
    }
  }

  public var week = Week()
  public var heading = Heading()
  public var look = Look()
  /// The テーマ's id, as /design's preset; one no longer known is the app's
  /// own.
  public var themeID = Theme.pochical.rawValue
  /// 外観: light or dark as the phone is, or one of them always.
  public var appearance = Appearance.system
  /// How a month saved as a picture looks, apart from the app's own look.
  public var picture = PictureLook()
  /// Reminders of the person's shifts, sent by this device on its own.
  public var reminders = Reminder.defaults
  /// What 端末カレンダーに追加 puts in besides the shifts, as last left.
  public var calendarAdd = CalendarAdd()

  public var theme: Theme {
    get { Theme(rawValue: themeID) ?? .pochical }
    set { themeID = newValue.rawValue }
  }

  public init() {}

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    week = try container.decodeIfPresent(Week.self, forKey: .week) ?? Week()
    heading = try container.decodeIfPresent(Heading.self, forKey: .heading) ?? Heading()
    look = try container.decodeIfPresent(Look.self, forKey: .look) ?? Look()
    themeID = try container.decodeIfPresent(String.self, forKey: .themeID) ?? Theme.pochical.rawValue
    appearance = try container.decodeIfPresent(Appearance.self, forKey: .appearance) ?? .system
    picture = try container.decodeIfPresent(PictureLook.self, forKey: .picture) ?? PictureLook()
    reminders = try container.decodeIfPresent([Reminder].self, forKey: .reminders) ?? Reminder.defaults
    calendarAdd = try container.decodeIfPresent(CalendarAdd.self, forKey: .calendarAdd) ?? CalendarAdd()
  }
}

/// How a month saved as a picture looks (/design's ImageOptions): it goes
/// to people who do not know the marks, so names and the days off's tint
/// start on, and days off are shown, since they could not tell an empty day
/// from one not entered. Light or dark is the screen's until picked.
public struct PictureLook: Codable, Equatable, Sendable {
  public var options = MarkOptions(names: true, highlight: true)
  /// Dark, light, or none to follow the screen.
  public var dark: Bool?

  public init() {}

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    options = try container.decodeIfPresent(MarkOptions.self, forKey: .options) ?? PictureLook().options
    dark = try container.decodeIfPresent(Bool.self, forKey: .dark)
  }
}

/// What 端末カレンダーに追加 puts in besides the shifts (spec/calendar.md):
/// the day's memo and those on it, each off until turned on, as a calendar
/// may be shared with family.
public struct CalendarAdd: Codable, Equatable, Sendable {
  public var notes = false
  public var people = false

  public init() {}

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    notes = try container.decodeIfPresent(Bool.self, forKey: .notes) ?? false
    people = try container.decodeIfPresent(Bool.self, forKey: .people) ?? false
  }
}

/// 外観 (/design's Appearance): following the phone, or always light or
/// dark. A テーマ drawn dark whatever it says wins over it.
public enum Appearance: String, Codable, CaseIterable, Sendable {
  case system
  case light
  case dark

  public var name: String {
    switch self {
    case .system: "端末に合わせる"
    case .light: "ライト"
    case .dark: "ダーク"
    }
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
    didSet {
      keep()
      send(changedFrom: oldValue)
    }
  }

  /// Where the preferences go as edits, once the app syncs them.
  @ObservationIgnored var database: (any DatabaseWriter)?
  /// Taking the account's preferences, which go nowhere again.
  @ObservationIgnored var adopting = false
  @ObservationIgnored var watching: Task<Void, Never>?

  private let store: UserDefaults
  nonisolated static let storeKey = "deviceSettings"

  public init(store: UserDefaults = UserDefaults(suiteName: appGroup) ?? .standard) {
    self.store = store
    device =
      store.data(forKey: Self.storeKey).flatMap {
        try? JSONDecoder().decode(DeviceSettings.self, from: $0)
      } ?? DeviceSettings()
  }

  private func keep() {
    if let data = try? JSONEncoder().encode(device) {
      store.set(data, forKey: Self.storeKey)
    }
  }
}
