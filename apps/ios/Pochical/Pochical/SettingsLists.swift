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

  /// A row standing on the page itself, as /design's segments and cards
  /// do, between the same margins as the cards of rows.
  func settingsOnPage() -> some View {
    listRowBackground(Color.clear)
      .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
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
