import AppIntents
import Foundation
import PochicalKit

// Where the widgets, the controls and the shortcuts open the app
// (spec/widgets.md, Opening the app): the app's own links, and the intent
// that opens a day as they do. Built into the app as well as the widgets,
// as the intent runs in the app.

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

  /// Where 次の休み opens: the day off it counts, else today; set to
  /// someone or a group, in the group's table, and the group's top when
  /// they are to be picked again.
  var offLink: URL {
    pickAgain.map { groupLink($0) } ?? link(soonestOff?.day.date ?? date)
  }
}

/// Opens the calendar on a day, today unless one is given, as a widget's
/// tap does: the controls', and an action of the Shortcuts app. It runs
/// in the app, brought to the front, which gives it `DayOpener`. It is no
/// App Shortcut: built into the widgets too, the system would look for
/// the shortcut there.
struct OpenDayIntent: AppIntent {
  static let title: LocalizedStringResource = "カレンダーを開く"
  static let description = IntentDescription("カレンダーをその日で開きます。日付がなければ今日で開きます。")
  static let supportedModes: IntentModes = .foreground

  @Parameter(title: "日付", kind: .date)
  var date: Date?

  @AppDependency private var opener: DayOpener

  init() {}

  init(_ day: Day) {
    date = day.date(in: .current)
  }

  func perform() async throws -> some IntentResult {
    await opener.open(Day(date ?? .now, in: .current))
    return .result()
  }
}

/// How the app opens a day, as it opens `dayLink`'s: given to the intents
/// as the app starts (AppDependencyManager).
struct DayOpener: Sendable {
  let open: @MainActor @Sendable (Day) -> Void
}
