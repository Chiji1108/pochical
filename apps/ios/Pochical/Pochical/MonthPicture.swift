import Photos
import PochicalDesign
import PochicalKit
import SwiftUI

/// 画像で保存 (/design's ImagePreviewPage): the month as a picture, in the
/// calendar's own ground, with the look it goes out in (light or dark, how
/// days off show, shift names), shared or saved to Photos. The look is the
/// picture's alone, kept on the device; the app's スタイル stays.
struct MonthPicturePage: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.dismiss) private var dismiss
  let month: Day
  let calendar: OwnCalendar
  @State private var notice: String?
  /// The picture made as it now looks, made again only when its look
  /// changes.
  @State private var image: UIImage?

  var body: some View {
    @Bindable var settings = settings
    let picture = settings.device.picture
    let theme = settings.device.theme
    let dark = theme.isAlwaysDark || (picture.dark ?? (colorScheme == .dark))
    NavigationStack {
      List {
        Section {
          framed(dark: dark)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xxl))
            .overlay(RoundedRectangle(cornerRadius: Radius.xxl).strokeBorder(colors.separator))
            .shadow(Shadow.md)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(month.yearMonthText)のシフトの画像")
            // ☀︎ / ☾ on the picture's top edge, as every calendar preview
            // has them; an always-dark テーマ saves its dark.
            .overlay(alignment: .topLeading) {
              SchemeSwitch(
                shown: Binding { dark ? .dark : .light } set: {
                  settings.device.picture.dark = $0 == .dark
                },
                disabled: theme.isAlwaysDark
              )
              .offset(x: 12, y: -10)
            }
            // Room for the switch over the edge.
            .padding(.top, 10)
            .settingsOnPage()
        }
        // The style page's choices, with the picture's own values: it
        // goes to people who do not know the marks, so names start on.
        Section("休みの見せ方") {
          Choices(
            options: OffLook.allCases, picked: OffLook(picture.options), label: \.name
          ) { _ in
            EmptyView()
          } onPick: { offLook in
            offLook.apply(to: &settings.device.picture.options)
          }
          .settingsOnPage()
        }
        Section {
          Choices(
            options: [false, true], picked: picture.options.names, label: { $0 ? "あり" : "なし" }
          ) { _ in
            EmptyView()
          } onPick: { names in
            settings.device.picture.options.names = names
          }
          .settingsOnPage()
        } header: {
          Text("シフト名")
        } footer: {
          Text("画像にだけ使う見た目です。アプリのスタイルは変わりません。")
        }
      }
      .settingsList()
      .navigationTitle("画像で保存")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
      .safeAreaInset(edge: .bottom) {
        actions
      }
      .task(id: PictureKey(dark: dark, look: picture)) {
        image = rendered(dark: dark)
      }
      .overlay(alignment: .top) {
        if let notice {
          NoticeCapsule(words: notice)
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
      }
    }
  }

  /// 共有 and 保存 under the page.
  private var actions: some View {
    HStack(spacing: 12) {
      // In its place while the picture is being made, so nothing moves.
      if let image {
        ShareLink(
          item: Image(uiImage: image),
          preview: SharePreview("\(month.yearMonthText)のシフト", image: Image(uiImage: image))
        ) {
          shareLabel
        }
        .buttonStyle(.bordered)
      } else {
        Button {} label: { shareLabel }
          .buttonStyle(.bordered)
          .disabled(true)
      }
      Button {
        Task { await save(image) }
      } label: {
        Label("保存", systemImage: "square.and.arrow.down")
          .frame(maxWidth: .infinity, minHeight: Metrics.control)
      }
      .buttonStyle(.borderedProminent)
      .tint(colors.accentFill)
      .foregroundStyle(colors.accentOnFill)
      .disabled(image == nil)
    }
    .buttonBorderShape(.capsule)
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    .background(colors.backgroundBase)
  }

  private var shareLabel: some View {
    Label("共有", systemImage: "square.and.arrow.up")
      .frame(maxWidth: .infinity, minHeight: Metrics.control)
  }

  /// The picture in the テーマ's light or dark, whatever the screen is in.
  private func framed(dark: Bool) -> some View {
    let scheme: ColorScheme = dark ? .dark : .light
    var look = settings.device.look
    look.options = settings.device.picture.options
    return MonthPicture(month: month, calendar: calendar, week: settings.device.week)
      .environment(\.themeColors, settings.device.theme.colors(scheme))
      .environment(\.colorScheme, scheme)
      .environment(\.look, look)
  }

  /// The picture at three times its size, as a phone's screen draws it.
  private func rendered(dark: Bool) -> UIImage? {
    let renderer = ImageRenderer(content: framed(dark: dark).frame(width: 390))
    renderer.scale = 3
    return renderer.uiImage
  }

  private func save(_ image: UIImage?) async {
    guard let data = image?.pngData() else { return }
    do {
      // Photos runs the change on its own queue, not the main actor's.
      try await PHPhotoLibrary.shared().performChanges { @Sendable in
        PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
      }
      say("写真に保存しました")
    } catch {
      ReviewPrompt.troubled = true
      say("保存できませんでした")
    }
  }

  private func say(_ words: String) {
    withAnimation { notice = words }
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(2.5))
      if notice == words {
        withAnimation { notice = nil }
      }
    }
  }
}

/// What the picture is made again for.
private struct PictureKey: Equatable {
  let dark: Bool
  let look: PictureLook
}

/// A month as it goes out in a picture: its name, the weekdays and its
/// days as the calendar draws them, and Pochical's name with the store's
/// icon, so someone who gets it can find the app by the same dog. Days of
/// the months around it are left blank, and there is no today or memo:
/// the picture is for any day.
struct MonthPicture: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  let month: Day
  let calendar: OwnCalendar
  let week: DeviceSettings.Week

  var body: some View {
    let weeks = monthWeeks(month, weekStart: week.start)
    let first = weeks.first?.first ?? month
    let last = weeks.last?.last ?? month
    let shown = calendar.shown(from: first, through: last)
    VStack(alignment: .leading, spacing: 0) {
      Text(month.yearMonthText)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(colors.textPrimary)
        .padding(.horizontal, 4)
        .padding(.bottom, 12)
      WeekdayRow(week: week, compact: true)
      VStack(spacing: 4) {
        ForEach(weeks, id: \.self) { days in
          HStack(spacing: 4) {
            ForEach(days, id: \.self) { day in
              let inMonth = day.month == month.month
              let entry = inMonth ? shown[day] : nil
              DayCell(
                day: day, entry: entry, note: nil,
                pattern: entry.flatMap { calendar.patternsByID[$0.shift] },
                outside: !inMonth, isToday: false, isHoliday: day.holidayName != nil,
                colorsHoliday: week.holiday,
                offShown: look.options.blankOff ? .hidden : .shown)
            }
          }
        }
      }
      HStack(spacing: 4) {
        Spacer()
        AppIconChoice.moss.image(size: 16)
        Text("ポチカル").font(.system(size: 11))
      }
      .foregroundStyle(colors.textQuaternary)
      .padding(.top, 12)
    }
    .padding(EdgeInsets(top: 16, leading: 12, bottom: 12, trailing: 12))
    .background(colors.backgroundBase)
  }
}
