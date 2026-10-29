import AppIntents
import Foundation
import PochicalKit

// Where the widgets, the controls and the shortcuts open the app
// (spec/widgets.md, Opening the app; spec/shortcuts.md): the app's own
// links, and the intent the controls open them by. Built into the app as
// well as the widgets, as the intent runs in the app.

/// The link that opens the app on a day: the calendar on its week with
/// that day picked.
nonisolated func dayLink(_ day: Day) -> URL {
  URL(string: "pochical://day/\(day.key)")!
}

/// The group's table at a day, where whose days make it count can be
/// seen.
nonisolated func groupLink(_ groupID: String, day: Day? = nil) -> URL {
  let path = day.map { "/day/\($0.key)" } ?? ""
  return URL(string: "pochical://group/\(groupID)\(path)")!
}

nonisolated extension WidgetEntry {
  /// Where a day opens: the group's table set to someone, else the
  /// calendar.
  func link(_ day: Day) -> URL {
    with.map { groupLink($0.groupID, day: day) } ?? dayLink(day)
  }

  /// Where 次の休み opens: its day (`nextOffDay`); set to someone or a
  /// group, in the group's table, and the group's top when they are to be
  /// picked again.
  var offLink: URL {
    pickAgain.map { groupLink($0) } ?? link(nextOffDay)
  }
}

/// A place the app opens on, named as the shortcuts are.
nonisolated enum OpenedPlace: String, AppEnum {
  case today, nextOff

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "開く日"
  static let caseDisplayRepresentations: [OpenedPlace: DisplayRepresentation] = [
    .today: "今日", .nextOff: "次の休み",
  ]

  /// Its link, worked out from the days as the device holds them now, so
  /// it never opens a day that has gone by.
  nonisolated var link: URL {
    let entry = currentWidgetEntry(choice: nil, DeviceSettings.kept())
    return dayLink(self == .today ? entry.date : entry.nextOffDay)
  }
}

/// Opens the calendar on today or the next day off, as a widget's tap
/// does: the controls', and an action of the Shortcuts app. It runs in
/// the app, brought to the front, which gives it `LinkOpener`.
struct OpenPlaceIntent: AppIntent {
  static let title: LocalizedStringResource = "ポチカルを開く"
  static let description = IntentDescription("カレンダーを今日か次の休みで開きます。")
  static let supportedModes: IntentModes = .foreground

  @Parameter(title: "開く日", default: .today)
  var place: OpenedPlace

  @AppDependency private var opener: LinkOpener

  init() {}

  init(_ place: OpenedPlace) {
    self.place = place
  }

  func perform() async throws -> some IntentResult {
    await opener.open(place.link)
    return .result()
  }
}

/// How the app opens one of its links, as it opens those a widget's tap
/// sends: given to the intents as the app starts (AppDependencyManager).
struct LinkOpener: Sendable {
  let open: @MainActor @Sendable (URL) -> Void
}
