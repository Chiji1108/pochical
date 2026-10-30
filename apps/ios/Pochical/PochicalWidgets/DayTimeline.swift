import AppIntents
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
    DayMoments.sample(at: .now, settings: DeviceSettings.kept())
  }

  func getSnapshot(in context: Context, completion: @escaping (DayEntryMoment) -> Void) {
    completion(DayMoments.snapshot(choice: nil))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntryMoment>) -> Void) {
    completion(DayMoments.timeline(choice: nil))
  }
}

/// A widget's editing that sets it to someone or a group.
protocol ChoosesCompanion: WidgetConfigurationIntent {
  /// WidgetChoice's id of who is picked, nil for nobody.
  var choiceID: String? { get }
}

extension NextOffIntent: ChoosesCompanion {
  var choiceID: String? { with?.id }
}

extension UpcomingIntent: ChoosesCompanion {
  var choiceID: String? { with?.id }
}

/// The person's days beside those of who the widget is set to.
struct ChosenTimeline<Intent: ChoosesCompanion>: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> DayEntryMoment {
    DayMoments.sample(at: .now, settings: DeviceSettings.kept())
  }

  func snapshot(for configuration: Intent, in context: Context) async -> DayEntryMoment {
    DayMoments.snapshot(choice: configuration.choiceID.flatMap(WidgetChoice.init(id:)))
  }

  func timeline(for configuration: Intent, in context: Context) async -> Timeline<DayEntryMoment> {
    DayMoments.timeline(choice: configuration.choiceID.flatMap(WidgetChoice.init(id:)))
  }
}

/// How each kind's moments are made from the database.
enum DayMoments {
  /// The person's own entry once they have entered days, else the sample
  /// week, as the gallery shows before a widget is placed.
  static func snapshot(choice: WidgetChoice?) -> DayEntryMoment {
    let settings = DeviceSettings.kept()
    guard let read = readWidget(choice: choice),
      case let entry = read.entry(at: .now, settings), !entry.nothingEntered
    else { return sample(at: .now, settings: settings) }
    return DayEntryMoment(date: .now, entry: entry, settings: settings)
  }

  static func timeline(choice: WidgetChoice?) -> Timeline<DayEntryMoment> {
    let now = Date.now
    let settings = DeviceSettings.kept()
    guard let read = readWidget(choice: choice) else {
      // No database yet: until the app makes one and asks again.
      let empty = WidgetEntry.nothingYet(at: now, week: settings.week)
      return Timeline(
        entries: [DayEntryMoment(date: now, entry: empty, settings: settings)], policy: .never)
    }
    // This entry, and the next at its turn, from one read of the days.
    let first = read.entry(at: now, settings)
    let refresh = first.now.refresh
    let next = read.entry(at: refresh, settings)
    return Timeline(
      entries: [
        DayEntryMoment(date: now, entry: first, settings: settings),
        DayEntryMoment(date: refresh, entry: next, settings: settings),
      ],
      // Asked again as the last entry's own turn comes.
      policy: .after(next.now.refresh))
  }

  static func sample(at date: Date, settings: DeviceSettings) -> DayEntryMoment {
    DayEntryMoment(date: date, entry: .sample(at: date, week: settings.week), settings: settings)
  }
}

/// A widget's view in the person's テーマ, in the light or dark 外観 picks
/// (the system's on 端末に合わせる, and where the system recolors it), their marks' shape and 月と曜日, which the
/// system's relative times (3時間12分, 3 hr, 12 min) follow too. On the
/// lock screen the system draws the ground.
struct WidgetLook<Content: View>: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var renderingMode
  let settings: DeviceSettings
  @ViewBuilder let content: Content

  var body: some View {
    let theme = settings.theme
    // 外観 holds only a widget drawn in full color: where the system
    // recolors it (the lock screen, 色合い and クリア) it reads the
    // system's light or dark, and dark words there would fade.
    let held = renderingMode == .fullColor
    let scheme =
      held ? (theme.isAlwaysDark ? .dark : settings.appearance.scheme ?? colorScheme) : colorScheme
    let colors = theme.colors(theme.isAlwaysDark ? .dark : scheme)
    let english = settings.heading.english
    content
      .environment(\.colorScheme, scheme)
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
