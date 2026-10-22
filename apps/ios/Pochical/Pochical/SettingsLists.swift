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

  /// Words standing on the page, as a question over its answers: kept
  /// clear of the row's rounded corners, which would cut a first or last
  /// line's letters at the edge.
  func settingsTextOnPage() -> some View {
    padding(.vertical, 12)
      .settingsOnPage()
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

/// 並び替え in a list's bar, and 完了 while sorting, which confirms and so
/// is prominent, as /design's and iOS 26's 完了 are.
struct SortButton: View {
  @Binding var editMode: EditMode

  var body: some View {
    let sorting = editMode.isEditing
    Button(sorting ? "完了" : "並び替え", role: sorting ? .confirm : nil) {
      withAnimation { editMode = sorting ? .inactive : .active }
    }
  }
}
