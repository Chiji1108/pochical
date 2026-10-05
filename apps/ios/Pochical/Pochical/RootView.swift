import PochicalDesign
import PochicalKit
import SwiftUI

/// The app's tabs, as /design's tab bar has them: カレンダー, グループ and
/// 設定.
struct RootView: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings

  var body: some View {
    TabView {
      Tab("カレンダー", systemImage: "calendar") {
        CalendarScreen()
      }
      Tab("グループ", systemImage: "person.2") {
        GroupsScreen()
      }
      Tab("設定", systemImage: "gearshape") {
        SettingsScreen()
      }
    }
    .tint(colors.accentDefault)
    .environment(\.look, settings.device.look)
  }
}
