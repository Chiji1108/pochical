import AppIntents
import PochicalKit
import SwiftUI
import WidgetKit

// The controls for Control Center, the lock screen and the Action button
// (spec/widgets.md, Shortcuts and controls).

/// 今日を開く: the calendar on today, as a widget's tap opens it.
struct TodayControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "today") {
      ControlWidgetButton(action: OpenPlaceIntent(.today)) {
        Label("今日を開く", systemImage: "calendar")
      }
    }
    .displayName("今日を開く")
    .description("カレンダーを今日で開きます。")
  }
}

/// 次の休み: the date of the next day off, opening it in the calendar.
struct NextOffControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "nextOff", provider: NextOffValue.Provider()) { value in
      // The day is worked out again as it is tapped, so a value shown
      // before it changed never opens a day gone by.
      ControlWidgetButton(action: OpenPlaceIntent(.nextOff)) {
        Label {
          Text("次の休み")
          Text(value.words)
        } icon: {
          Image(systemName: "moon.zzz")
        }
      }
    }
    .displayName("次の休み")
    .description("次の休みの日付。押すとその日を開きます。")
  }
}

/// What 次の休み shows: the date of the soonest day off, today's when it
/// is off, which stays true as days go by until that day has gone; or why
/// none is ahead.
struct NextOffValue {
  let words: String

  init(_ entry: WidgetEntry, english: Bool) {
    let words = WidgetWords(english: english)
    // The day it opens, the same function's.
    self.words =
      entry.soonestOff == nil
      ? noOffWords(entry.offs.none, words: words) : words.date(entry.nextOffDay)
  }

  struct Provider: ControlValueProvider {
    /// The gallery's, the sample week's as the widgets' gallery shows.
    var previewValue: NextOffValue {
      let settings = DeviceSettings.kept()
      return NextOffValue(
        .sample(at: .now, week: settings.week), english: settings.heading.english)
    }

    func currentValue() async throws -> NextOffValue {
      let settings = DeviceSettings.kept()
      return NextOffValue(
        currentWidgetEntry(choice: nil, settings), english: settings.heading.english)
    }
  }
}
