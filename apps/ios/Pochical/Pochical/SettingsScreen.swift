import PochicalDesign
import PochicalKit
import SwiftUI

/// 設定: what the person sets, sorted as /design's settings are. 表示
/// holds スタイル and the calendar's frame for now; the rest comes as it is
/// built.
struct SettingsScreen: View {
  @Environment(Settings.self) private var settings
  /// The icon in use, read again as the page comes back from changing it.
  @State private var appIcon = AppIconChoice.current

  var body: some View {
    NavigationStack {
      List {
        Section("表示") {
          NavigationLink {
            StyleSettings()
          } label: {
            LabeledContent("スタイル", value: styleName)
          }
          NavigationLink {
            AppearanceSettings()
          } label: {
            LabeledContent("外観", value: appearanceName)
          }
          NavigationLink {
            AppIconSettings()
          } label: {
            LabeledContent("アプリアイコン") {
              HStack(spacing: 8) {
                appIcon.image(size: 22)
                Text(appIcon.name)
              }
            }
          }
          NavigationLink {
            CalendarSettings()
          } label: {
            LabeledContent(
              "カレンダー", value: "\(WeekdayRow.names[settings.device.week.start])曜はじまり")
          }
        }
      }
      .navigationTitle("設定")
      .onAppear { appIcon = .current }
    }
  }

  /// The choice, or the dark of a テーマ drawn so whatever it says.
  private var appearanceName: String {
    let theme = settings.device.theme
    return theme.isAlwaysDark ? "ダーク（\(theme.name)）" : settings.device.appearance.name
  }

  private var styleName: String {
    switch settings.device.look.style {
    case .icon: settings.device.look.fill ? "塗り" : "線"
    case .emoji: "絵文字"
    case .badge: "文字"
    }
  }
}

/// 外観 (/design's AppearancePage): following the phone, or keeping light
/// or dark. It stays open under a テーマ drawn dark whatever it says, which
/// says so, as it takes effect again once the テーマ changes.
private struct AppearanceSettings: View {
  @Environment(Settings.self) private var settings

  var body: some View {
    @Bindable var settings = settings
    let theme = settings.device.theme
    Form {
      Section {
        Picker("外観", selection: $settings.device.appearance) {
          ForEach(Appearance.allCases, id: \.self) { appearance in
            Text(appearance.name).tag(appearance)
          }
        }
        .pickerStyle(.inline)
        .labelsHidden()
      } footer: {
        Text(
          theme.isAlwaysDark
            ? "テーマの「\(theme.name)」はいつもダークで表示されます。ほかのテーマにすると、ここでの設定に戻ります。"
            : "端末に合わせると、スマホの設定に合わせてライトとダークが切り替わります。")
      }
    }
    .navigationTitle("外観")
    .navigationBarTitleDisplayMode(.inline)
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
