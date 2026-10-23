import Foundation
import Observation
import PochicalDesign
import SQLiteData

/// What the person set for their own screen, as /design's device settings
/// are (packages/prototype/src/lib/design-settings-store.ts). Kept in the App Group,
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
}

/// How a month saved as a picture looks (/design's ImageOptions): it goes
/// to people who do not know the marks, so names and the days off's tint
/// start on, and days off are shown, since they could not tell an empty day
/// from one not entered; each day off can be set apart, as on the style
/// page, so 有休 may show while 休み is left blank. Light or dark is the
/// screen's until picked.
public struct PictureLook: Codable, Equatable, Sendable {
  public var options = MarkOptions(names: true, off: .highlight)
  /// Dark, light, or none to follow the screen.
  public var dark: Bool?

  public init() {}
}

/// What 端末カレンダーに追加 puts in (spec/calendar.md): the patterns
/// picked under 入れるシフト, the day's memo and those on it, the last
/// two off until turned on, as a calendar may be shared with family.
public struct CalendarAdd: Codable, Equatable, Sendable {
  /// The patterns picked otherwise than `ShiftEvents.shownAtFirst` has
  /// them: put in, or left out.
  public var chosen: [PatternID: Bool] = [:]
  public var notes = false
  public var people = false

  public init() {}

  /// The patterns put in, of `patterns`.
  public func shown(of patterns: [Pattern]) -> Set<PatternID> {
    let atFirst = ShiftEvents.shownAtFirst(patterns)
    return Set(patterns.map(\.id).filter { chosen[$0] ?? atFirst.contains($0) })
  }

  /// Picks a pattern in or out, keeping only what differs from the first
  /// pick, of patterns still there, so a deleted one's leaves too.
  public mutating func pick(_ id: PatternID, _ on: Bool, of patterns: [Pattern]) {
    let atFirst = ShiftEvents.shownAtFirst(patterns)
    let ids = Set(patterns.map(\.id))
    chosen = chosen.filter { ids.contains($0.key) && $0.key != id }
    if on != atFirst.contains(id) {
      chosen[id] = on
    }
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

/// How a day off shows: on a tint of its color (強調), as a mark alone
/// (印だけ), or left blank (空白), faint again while entering and in a
/// day's week.
public enum OffLook: String, Codable, CaseIterable, Sendable {
  case highlight
  case mark
  case blank

  public var name: String {
    switch self {
    case .highlight: "強調"
    case .mark: "印だけ"
    case .blank: "空白"
    }
  }
}

/// How the person's own month draws days in one shape (/design's
/// CalendarOptions): the shift's name under its mark, and how each pattern
/// that counts as off shows, so 休み can be left blank while 有休 is
/// tinted; a pattern not set yet shows as `off`.
public struct MarkOptions: Codable, Equatable, Sendable {
  public var names = false
  public var off = OffLook.mark
  public var offs: [PatternID: OffLook] = [:]

  public init(names: Bool = false, off: OffLook = .mark, offs: [PatternID: OffLook] = [:]) {
    self.names = names
    self.off = off
    self.offs = offs
  }

  /// How the days of the pattern `id` show, when it counts as off.
  public func offLook(of id: PatternID) -> OffLook {
    offs[id] ?? off
  }

  /// Sets how the days of the pattern `id` show, and drops the patterns
  /// no longer among `offPatterns`, so what is kept with the account does
  /// not grow with each pattern ever deleted past what one value may hold;
  /// a look the same as `off` is not kept either, as it says nothing.
  public mutating func setOffLook(
    _ offLook: OffLook, of id: PatternID, offPatterns: some Collection<PatternID>
  ) {
    let kept = Set(offPatterns)
    offs = offs.filter { kept.contains($0.key) }
    offs[id] = offLook == off ? nil : offLook
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
  public var icon = MarkOptions(off: .highlight)
  public var emoji = MarkOptions()
  public var badge = MarkOptions()

  public init() {}

  /// Sets how the days of the pattern `id` show in the shape in use, and
  /// drops from every shape the patterns no longer among `offPatterns`.
  public mutating func setOffLook(
    _ offLook: OffLook, of id: PatternID, offPatterns: some Collection<PatternID>
  ) {
    let kept = Set(offPatterns)
    icon.offs = icon.offs.filter { kept.contains($0.key) }
    emoji.offs = emoji.offs.filter { kept.contains($0.key) }
    badge.offs = badge.offs.filter { kept.contains($0.key) }
    options.setOffLook(offLook, of: id, offPatterns: kept)
  }

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
