import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// 設定: what the person sets, sorted as /design's settings are. 表示
/// holds スタイル and the calendar's frame for now; the rest comes as it is
/// built.
struct SettingsScreen: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  @Environment(\.openURL) private var openURL
  @Environment(\.say) private var say
  @FetchAll private var patterns: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]
  @FetchAll(GroupRow.order(by: \.joinedAtMs)) private var groups
  @FetchAll private var coworkerRows: [CoworkerRow]
  @Fetch(RepeatOrdersRequest()) private var orders: [RepeatOrder] = []
  @Fetch(ChatNotificationsRequest()) private var notifications = ChatNotificationState()
  /// The icon in use, read again as the page comes back from changing it.
  @State private var appIcon = AppIconChoice.current
  /// A page of the site opened from ポチカルについて.
  @State private var page: OpenedLink?

  var body: some View {
    NavigationStack {
      List {
        // The patterns first: every way of working has them, and the
        // repeating order is made of them.
        Section("シフト") {
          NavigationLink {
            PatternsPage()
          } label: {
            LabeledContent("シフトパターン") {
              HStack(spacing: 8) {
                HStack(spacing: 4) {
                  ForEach(ownPatterns, id: \.id) { pattern in
                    ShiftMark(pattern: pattern, size: 14)
                  }
                }
                Text("\(ownPatterns.count)つ")
              }
            }
            .accessibilityValue("\(ownPatterns.count)つ")
          }
          NavigationLink {
            RepeatPage()
          } label: {
            LabeledContent("繰り返し", value: repeatSummary(orders))
          }
          NavigationLink {
            CoworkersPage()
          } label: {
            LabeledContent("一緒に働く人", value: "\(coworkerRows.count)人")
          }
        }
        .settingsRows()

        Section("通知") {
          NavigationLink {
            RemindersPage()
          } label: {
            LabeledContent("リマインド", value: remindersSummary)
          }
          NavigationLink {
            ChatNotificationsPage()
          } label: {
            LabeledContent(
              "チャット",
              value: chatNotificationsSummary(
                groups: groups, notifications: notifications,
                allowed: Notifications.shared.permission == .allowed))
          }
        }
        .settingsRows()

        Section("表示") {
          NavigationLink {
            StyleSettings()
          } label: {
            // A look is shown rather than named, as /design's: one of the
            // person's own marks, then the テーマ's name.
            LabeledContent("スタイル") {
              HStack(spacing: 8) {
                if let work = ownPatterns.first(where: { !$0.countsAsOff }) ?? ownPatterns.first {
                  ShiftMark(pattern: work, size: 20)
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
              "カレンダー", value: "\(Day.weekdayNames[settings.device.week.start])曜はじまり")
          }
        }
        .settingsRows()

        Section("アカウント") {
          ProfileRow()
          AccountRow()
        }
        .settingsRows()

        // The chat with the people who make Pochical, over ポチカルについて.
        Section {
          SupportRow()
        }
        .settingsRows()

        about
      }
      .settingsList()
      .navigationTitle("設定")
      .onAppear { appIcon = .current }
      // A tapped answer from Pochical's people opens their chat.
      .navigationDestination(
        isPresented: Binding(
          get: { Notifications.shared.openingSupport },
          set: { Notifications.shared.openingSupport = $0 })
      ) {
        SupportChatScreen()
      }
      .sheet(item: $page) { page in
        SafariView(url: page.url).ignoresSafeArea()
      }
    }
  }

  /// Pochical itself, at the foot (/design's AboutSection): rows that leave
  /// the app end in ↗ instead of the arrow of rows that go on inside it.
  /// The store's own review prompt comes by itself only now and then
  /// (spec/review.md); the review row is there whenever someone wants to
  /// write one.
  private var about: some View {
    Section {
      outside("ヘルプ") { page = OpenedLink(url: Site.page("support")) }
      outside("App Storeでレビューを書く") {
        if let url = Site.writeReview {
          openURL(url)
        } else {
          say("公開後はレビューを書く画面が開きます")
        }
      }
      outside("利用規約") { page = OpenedLink(url: Site.page("terms")) }
      outside("プライバシーポリシー") { page = OpenedLink(url: Site.page("privacy")) }
    } header: {
      Text("ポチカルについて")
    } footer: {
      Text("ポチカル \(ReviewPrompt.version)")
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }
    .settingsRows()
  }

  private func outside(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack {
        Text(title).foregroundStyle(colors.textPrimary)
        Spacer()
        Image(systemName: "arrow.up.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(colors.textQuaternary)
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityHint("ブラウザで開きます")
  }

  /// What arrives of the reminders: オフ until the system allows it or
  /// none is on, else the one, else how many.
  private var remindersSummary: String {
    let on = settings.device.reminders.filter(\.on)
    guard Notifications.shared.permission == .allowed, let first = on.first else { return "オフ" }
    return on.count == 1 ? first.name : "\(on.count)件"
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
  @State private var picked: ColorScheme?

  var body: some View {
    @Bindable var settings = settings
    Form {
      // スタイル's preview cut to this week under the month's heading.
      Section {
        StylePreview(heading: true, picked: $picked)
      }
      .settingsOnPage()
      Section("週の始まり") {
        Picker("週の始まり", selection: $settings.device.week.start) {
          ForEach(0..<7, id: \.self) { day in
            Text(Day.weekdayNames[day])
              .accessibilityLabel("\(Day.weekdayNames[day])曜")
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

/// Pochical's site, whose pages ポチカルについて opens.
private enum Site {
  static let root = URL(string: "https://pochical.app")!

  static func page(_ path: String) -> URL {
    root.appending(path: path)
  }

  /// The App Store's page for writing a review (?action=write-review),
  /// which there is none of before release.
  static let writeReview: URL? = nil
}
