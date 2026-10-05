import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// 設定: what the person sets, sorted as /design's settings are. 表示
/// holds スタイル and the calendar's frame for now; the rest comes as it is
/// built.
struct SettingsScreen: View {
  @Environment(Settings.self) private var settings
  @FetchAll private var patterns: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]
  /// The icon in use, read again as the page comes back from changing it.
  @State private var appIcon = AppIconChoice.current

  var body: some View {
    NavigationStack {
      List {
        Section("表示") {
          NavigationLink {
            StyleSettings()
          } label: {
            // A look is shown rather than named, as /design's: one of the
            // person's own marks, then the テーマ's name.
            LabeledContent("スタイル") {
              HStack(spacing: 6) {
                if let work = ownPatterns.first(where: { !$0.countsAsOff }) ?? ownPatterns.first {
                  ShiftMark(pattern: work, size: 18)
                }
                Text(settings.device.theme.name)
              }
            }
            .accessibilityValue("\(styleName)、\(settings.device.theme.name)")
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
        .settingsRows()
      }
      .settingsList()
      .navigationTitle("設定")
      .onAppear { appIcon = .current }
    }
  }

  /// The choice, or the dark of a テーマ drawn so whatever it says.
  private var appearanceName: String {
    let theme = settings.device.theme
    return theme.isAlwaysDark ? "ダーク（\(theme.name)）" : settings.device.appearance.name
  }

  private var ownPatterns: [Pattern] {
    OwnCalendar(days: [], patterns: patterns, patternOrder: patternOrder, orders: []).patterns
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
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("外観")
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
        // On the page, as /design's segments sit, not in a card.
        .settingsOnPage()
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
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("カレンダー")
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
