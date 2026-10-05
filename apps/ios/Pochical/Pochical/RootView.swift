import PochicalDesign
import SwiftUI

/// The app's tabs, as /design's tab bar has them: カレンダー and 設定; グループ
/// joins them with groups.
struct RootView: View {
  @Environment(\.themeColors) private var colors

  var body: some View {
    TabView {
      Tab("カレンダー", systemImage: "calendar") {
        CalendarScreen()
      }
      Tab("設定", systemImage: "gearshape") {
        SettingsScreen()
      }
    }
    .tint(colors.accentDefault)
  }
}
