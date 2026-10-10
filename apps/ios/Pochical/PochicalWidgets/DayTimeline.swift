import GRDB
import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

/// One moment of a widget: the person's entry, and the settings it is
/// drawn in (spec/widgets.md, When an entry is made).
struct DayEntryMoment: TimelineEntry {
  let date: Date
  let entry: WidgetEntry
  let settings: DeviceSettings
}

/// The person's own days, as every kind of widget here shows them: an
/// entry now, and the next at its turn (midnight, or いまのシフト's).
struct DayTimeline: TimelineProvider {
  func placeholder(in context: Context) -> DayEntryMoment {
    sample(at: .now, settings: DeviceSettings.kept())
  }

  /// The person's own entry once they have entered days, else the sample
  /// week, as the gallery shows before a widget is placed.
  func getSnapshot(in context: Context, completion: @escaping (DayEntryMoment) -> Void) {
    let settings = DeviceSettings.kept()
    guard let calendar = ownCalendar(),
      case let entry = calendar.widgetEntry(at: .now, week: settings.week), !entry.nothingEntered
    else { return completion(sample(at: .now, settings: settings)) }
    completion(DayEntryMoment(date: .now, entry: entry, settings: settings))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntryMoment>) -> Void) {
    let now = Date.now
    let settings = DeviceSettings.kept()
    guard let calendar = ownCalendar() else {
      // No database yet: as before anything is entered, until the app
      // makes one and asks again.
      var empty = WidgetEntry.sample(at: now, week: settings.week)
      empty.nothingEntered = true
      completion(Timeline(entries: [DayEntryMoment(date: now, entry: empty, settings: settings)], policy: .never))
      return
    }
    // This entry, and the next at its turn, read from one read of the days.
    let first = calendar.widgetEntry(at: now, week: settings.week)
    let refresh = first.now.refresh
    let next = calendar.widgetEntry(at: refresh, week: settings.week)
    completion(
      Timeline(
        entries: [
          DayEntryMoment(date: now, entry: first, settings: settings),
          DayEntryMoment(date: refresh, entry: next, settings: settings),
        ],
        // Asked again as the last entry's own turn comes.
        policy: .after(next.now.refresh)))
  }

  /// The person's own calendar, nil until the app has made its database.
  private func ownCalendar() -> OwnCalendar? {
    guard let database = try? widgetDatabase() else { return nil }
    return try? database.read { try OwnCalendar($0) }
  }

  private func sample(at date: Date, settings: DeviceSettings) -> DayEntryMoment {
    DayEntryMoment(date: date, entry: .sample(at: date, week: settings.week), settings: settings)
  }
}

/// A widget's view in the person's テーマ, in the light or dark the system
/// draws it, their marks' shape and 月と曜日, which the system's relative
/// times (3時間12分, 3 hr, 12 min) follow too. On the lock screen the
/// system draws the ground.
struct WidgetLook<Content: View>: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.widgetFamily) private var family
  let settings: DeviceSettings
  @ViewBuilder let content: Content

  var body: some View {
    let theme = settings.theme
    let colors = theme.colors(theme.isAlwaysDark ? .dark : colorScheme)
    let english = settings.heading.english
    content
      .environment(\.themeColors, colors)
      .environment(\.look, settings.look)
      .environment(\.english, english)
      .environment(\.locale, Locale(identifier: english ? "en_US" : "ja_JP"))
      .containerBackground(for: .widget) {
        if !family.onLockScreen {
          colors.backgroundCard
        }
      }
  }
}

extension WidgetFamily {
  /// The lock screen's sizes, drawn by the system in one color.
  var onLockScreen: Bool {
    self == .accessoryCircular || self == .accessoryRectangular || self == .accessoryInline
  }
}

/// The link that opens the app on a day (spec/widgets.md, Opening the
/// app).
func dayLink(_ day: Day) -> URL {
  URL(string: "pochical://day/\(day.key)")!
}
