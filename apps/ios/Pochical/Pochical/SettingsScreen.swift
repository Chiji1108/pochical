import PochicalDesign
import PochicalKit
import SwiftUI

/// 設定: what the person sets, sorted as /design's settings are. 表示
/// holds the calendar's frame for now; the rest comes as it is built.
struct SettingsScreen: View {
  @Environment(Settings.self) private var settings

  var body: some View {
    NavigationStack {
      List {
        Section("表示") {
          NavigationLink {
            CalendarSettings()
          } label: {
            LabeledContent(
              "カレンダー", value: "\(WeekdayRow.names[settings.device.week.start])曜はじまり")
          }
        }
      }
      .navigationTitle("設定")
    }
  }
}

/// The calendar's frame (/design's カレンダー page): 週の始まり and 色を
/// つける日. Only this device's screen changes.
private struct CalendarSettings: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors

  var body: some View {
    @Bindable var settings = settings
    Form {
      Section("週の始まり") {
        Picker("週の始まり", selection: $settings.device.week.start) {
          ForEach(0..<7, id: \.self) { day in
            Text(WeekdayRow.names[day])
              .accessibilityLabel("\(WeekdayRow.names[day])曜")
              .tag(day)
          }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
      }
      Section {
        Toggle(isOn: $settings.device.week.saturday) {
          swatch("土曜", colors.calendarSaturday)
        }
        Toggle(isOn: $settings.device.week.sunday) {
          swatch("日曜", colors.calendarHoliday)
        }
        Toggle(isOn: $settings.device.week.holiday) {
          swatch("祝日", colors.calendarHoliday)
        }
      } header: {
        Text("色をつける日")
      } footer: {
        Text("土曜と日曜は曜日の見出しに、祝日は日付に色がつきます。祝日は日曜と同じ赤です。")
      }
    }
    .navigationTitle("カレンダー")
    .navigationBarTitleDisplayMode(.inline)
  }

  /// A day's name after a dot of the color it takes.
  private func swatch(_ name: String, _ color: Color) -> some View {
    Label {
      Text(name)
    } icon: {
      Circle().fill(color).frame(width: 10, height: 10)
    }
  }
}
