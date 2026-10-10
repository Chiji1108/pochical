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
    sample(at: .now)
  }

  /// The person's own entry once they have entered days, else the sample
  /// week, as the gallery shows before a widget is placed.
  func getSnapshot(in context: Context, completion: @escaping (DayEntryMoment) -> Void) {
    let moment = own(at: .now)
    completion(moment.map { $0.entry.nothingEntered ? sample(at: .now) : $0 } ?? sample(at: .now))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntryMoment>) -> Void) {
    let now = Date.now
    guard let moment = own(at: now) else {
      // No database yet: as before anything is entered, until the app
      // makes one and asks again.
      let settings = DeviceSettings.kept()
      var empty = WidgetEntry.sample(at: now, week: settings.week)
      empty.nothingEntered = true
      completion(Timeline(entries: [DayEntryMoment(date: now, entry: empty, settings: settings)], policy: .never))
      return
    }
    let refresh = moment.entry.now.refresh
    var entries = [moment]
    if let next = own(at: refresh) {
      entries.append(next)
    }
    completion(Timeline(entries: entries, policy: .after(next(after: refresh, entries: entries))))
  }

  /// When to ask again: as the last entry's own turn comes.
  private func next(after refresh: Date, entries: [DayEntryMoment]) -> Date {
    entries.last?.entry.now.refresh ?? refresh
  }

  private func own(at date: Date) -> DayEntryMoment? {
    let settings = DeviceSettings.kept()
    guard let database = try? widgetDatabase(),
      let calendar = try? database.read({ try OwnCalendar($0) })
    else { return nil }
    return DayEntryMoment(
      date: date, entry: calendar.widgetEntry(at: date, week: settings.week), settings: settings)
  }

  private func sample(at date: Date) -> DayEntryMoment {
    let settings = DeviceSettings.kept()
    return DayEntryMoment(
      date: date, entry: .sample(at: date, week: settings.week), settings: settings)
  }
}

/// A widget's view in the person's テーマ, in the light or dark the system
/// draws it, their marks' shape and 月と曜日.
struct WidgetLook<Content: View>: View {
  @Environment(\.colorScheme) private var colorScheme
  let settings: DeviceSettings
  @ViewBuilder let content: Content

  var body: some View {
    let theme = settings.theme
    let colors = theme.colors(theme.isAlwaysDark ? .dark : colorScheme)
    content
      .environment(\.themeColors, colors)
      .environment(\.look, settings.look)
      .environment(\.english, settings.heading.english)
      .containerBackground(colors.backgroundCard, for: .widget)
  }
}

/// The link that opens the app on a day (spec/widgets.md, Opening the
/// app).
func dayLink(_ day: Day) -> URL {
  URL(string: "pochical://day/\(day.key)")!
}
