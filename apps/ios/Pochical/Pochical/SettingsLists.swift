import PochicalDesign
import SwiftUI

extension View {
  /// A list of 設定 on the テーマ's own page, as /design's are, rather than
  /// the system's grouped gray.
  func settingsList() -> some View {
    modifier(SettingsList())
  }

  /// A section's rows on the quiet ground of /design's lists.
  func settingsRows() -> some View {
    modifier(SettingsRows())
  }

  /// The page's main button, as the system draws a prominent one (/design's
  /// primary): the accent's fill, a capsule, its height the system's own.
  /// Its label takes the width it is given.
  func mainButton(_ size: ControlSize = .large) -> some View {
    modifier(MainButton(size: size))
  }

  /// A row standing on the page itself, as /design's segments and cards
  /// do, between the same margins as the cards of rows.
  func settingsOnPage() -> some View {
    listRowBackground(Color.clear)
      .listRowInsets(EdgeInsets())
  }
}

private struct SettingsList: ViewModifier {
  @Environment(\.themeColors) private var colors

  func body(content: Content) -> some View {
    content
      .scrollContentBackground(.hidden)
      .background(colors.backgroundBase)
  }
}

private struct SettingsRows: ViewModifier {
  @Environment(\.themeColors) private var colors

  func body(content: Content) -> some View {
    content.listRowBackground(colors.fillQuaternary)
  }
}

private struct MainButton: ViewModifier {
  @Environment(\.themeColors) private var colors
  let size: ControlSize

  func body(content: Content) -> some View {
    content
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.capsule)
      .controlSize(size)
      .tint(colors.accentFill)
      .foregroundStyle(colors.accentOnFill)
  }
}
