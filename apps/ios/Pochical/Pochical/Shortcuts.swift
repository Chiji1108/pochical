import AppIntents
import PochicalKit
import SwiftUI

// The app's shortcuts for Siri, Spotlight, Shortcuts and the Action button
// (spec/shortcuts.md, iPhone): what the widgets show, said in the words
// they are read aloud in, from the same entry, opening the app where the
// widgets open it. They are the app's alone: an App Shortcut's intent built
// into the widgets too is looked for there.

struct PochicalShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: TodayShiftIntent(),
      phrases: [
        "\(.applicationName)で今日のシフト",
        "\(.applicationName)で今日のシフトを教えて",
        "\(.applicationName)の今日のシフト",
      ],
      shortTitle: "今日のシフト", systemImageName: "calendar")
    AppShortcut(
      intent: NextOffShortcutIntent(),
      phrases: [
        "\(.applicationName)で次の休み",
        "\(.applicationName)で次の休みはいつ",
        "\(.applicationName)の次の休み",
      ],
      shortTitle: "次の休み", systemImageName: "moon.zzz")
  }
}

/// 今日のシフト: today's shift and its hours, as シンプル shows it.
struct TodayShiftIntent: AppIntent {
  static let title: LocalizedStringResource = "今日のシフト"
  static let description = IntentDescription("今日のシフトと時間を答えて、カレンダーを今日で開きます。")
  static let supportedModes: IntentModes = .foreground

  @AppDependency private var opener: LinkOpener

  @MainActor func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
    let settings = DeviceSettings.kept()
    let english = settings.heading.english
    let entry = currentWidgetEntry(choice: nil, settings)
    opener.open(dayLink(entry.date))
    return .result(
      dialog: IntentDialog(stringLiteral: entry.spokenToday(english: english)),
      view: DaySnippet(
        heading: WidgetWords(english: english).inDays(0),
        day: entry.nothingEntered ? nil : entry.today,
        otherwise: WidgetWords(english: english).firstRunLine, settings: settings))
  }
}

/// 次の休み: the next day off, as the widget 次の休み counts it, with
/// someone or a group when 一緒に休む人 is picked (みんな休み).
struct NextOffShortcutIntent: AppIntent {
  static let title: LocalizedStringResource = "次の休み"
  static let description = IntentDescription(
    "次の休みがいつかを答えて、その日を開きます。一緒に休む人を選ぶと、その人と一緒に休める日を答えます。")
  static let supportedModes: IntentModes = .foreground

  @Parameter(title: "一緒に休む人")
  var with: CompanionEntity?

  static var parameterSummary: some ParameterSummary {
    Summary("次の休み、一緒に休む人は\(\.$with)")
  }

  @AppDependency private var opener: LinkOpener

  @MainActor func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
    let settings = DeviceSettings.kept()
    let english = settings.heading.english
    let words = WidgetWords(english: english)
    let entry = currentWidgetEntry(choice: with.flatMap { WidgetChoice(id: $0.id) }, settings)
    let soonest = entry.soonestOff
    let pickAgain = english ? "Pick who again" : "一緒に休む人を選び直してください"
    opener.open(entry.offLink)
    return .result(
      dialog: IntentDialog(
        stringLiteral: entry.pickAgain == nil ? entry.spokenOff(english: english) : pickAgain),
      view: DaySnippet(
        heading: words.joined([
          offTitle(entry.with, english: english), soonest.map { words.inDays($0.inDays) },
        ]),
        day: entry.pickAgain == nil ? soonest?.day : nil,
        otherwise: entry.pickAgain == nil ? noOffWords(entry.offs.none, words: words) : pickAgain,
        settings: settings))
  }
}

/// A shortcut's answer drawn small under what Siri says: a day's mark,
/// its date, and its shift and hours, in the person's テーマ and marks.
private struct DaySnippet: View {
  let heading: String
  /// The day answered, nil for none.
  let day: WidgetDay?
  /// What is said with no day.
  let otherwise: String
  let settings: DeviceSettings

  var body: some View {
    let words = WidgetWords(english: settings.heading.english)
    HStack(spacing: 14) {
      if let pattern = day?.pattern {
        ShiftMark(pattern: pattern, size: 44, change: day?.timeChange)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(heading)
          .font(.subheadline)
          .foregroundStyle(.secondary)
        if let day {
          Text(words.date(day.date))
            .font(.headline)
          Text(words.joined([day.pattern?.name ?? "予定なし", day.time]))
            .font(.subheadline)
        } else {
          Text(otherwise)
            .font(.headline)
        }
      }
      Spacer(minLength: 0)
    }
    .padding()
    .modifier(Themed(theme: settings.theme))
    .environment(\.look, settings.look)
  }
}
