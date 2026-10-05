import PochicalDesign
import PochicalKit
import SwiftUI

/// The app's tabs, as /design's tab bar has them: カレンダー, グループ and
/// 設定. An invitation link opened in the app shows its join screen over
/// them, and once in, the group.
struct RootView: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  @State private var tab = RootTab.calendar
  @State private var openGroupID: String?
  @State private var invite: OpenedInvite?
  @State private var scanning = false
  /// An invitation read by the camera, opened once the camera has gone:
  /// one cover cannot come up while another is going.
  @State private var scanned: OpenedInvite?

  var body: some View {
    TabView(selection: $tab) {
      Tab("カレンダー", systemImage: "calendar", value: .calendar) {
        CalendarScreen()
      }
      Tab("グループ", systemImage: "person.2", value: .groups) {
        GroupsScreen(openID: $openGroupID) { scanning = true }
      }
      Tab("設定", systemImage: "gearshape", value: .settings) {
        SettingsScreen()
      }
    }
    .tint(colors.accentDefault)
    .environment(\.look, settings.device.look)
    .onOpenURL { url in
      if let code = openedInviteCode(of: url) {
        invite = OpenedInvite(code: code)
      }
    }
    .fullScreenCover(isPresented: $scanning) {
      if let scanned {
        invite = scanned
        self.scanned = nil
      }
    } content: {
      ScanScreen { read in
        scanned = read
        scanning = false
      }
    }
    .fullScreenCover(item: $invite) { invite in
      JoinScreen(invite: invite) { groupID in
        openGroupID = groupID
        tab = .groups
        self.invite = nil
      }
    }
  }
}

enum RootTab: Hashable {
  case calendar, groups, settings
}
