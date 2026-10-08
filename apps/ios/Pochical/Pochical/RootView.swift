import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import UserNotifications

/// The app's tabs, as /design's tab bar has them: カレンダー, グループ and
/// 設定. An invitation link opened in the app shows its join screen over
/// them, and once in, the group.
struct RootView: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  @Environment(\.groupCalls) private var groupCalls
  /// Each group's unread lines that count (spec/chat.md, Unread lines).
  @Fetch private var unread: [String: Int] = [:]
  @State private var meID: String?
  @State private var tab = RootTab.calendar
  @State private var openGroupID: String?
  /// A chat a notification opened, for the groups to show.
  @State private var openingChat: OpenedChat?
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
        GroupsScreen(openID: $openGroupID, openingChat: $openingChat, unread: unread) {
          scanning = true
        }
      }
      .badge(unread.values.reduce(0, +))
      Tab("設定", systemImage: "gearshape", value: .settings) {
        SettingsScreen()
      }
    }
    .tint(colors.accentDefault)
    .environment(\.look, settings.device.look)
    // The reminders' notifications, put in anew as what they read changes.
    .modifier(ReminderUpdates())
    .task { meID = await groupCalls.userID() }
    .task(id: meID) {
      guard let meID else { return }
      try? await $unread.load(UnreadRequest(me: meID))
    }
    .environment(\.openInvite) { code in invite = OpenedInvite(code: code) }
    // The app icon's badge follows what is read here too, as the
    // notifications set it from the server.
    .onChange(of: unread.values.reduce(0, +), initial: true) { _, total in
      UNUserNotificationCenter.current().setBadgeCount(total)
    }
    // A tapped notification opens its chat, the one that launched the
    // app too.
    .onChange(of: Notifications.shared.opening, initial: true) { _, chat in
      guard let chat else { return }
      tab = .groups
      openGroupID = chat.groupID
      openingChat = chat
      Notifications.shared.opening = nil
    }
    // An answer from Pochical's people opens their chat, under 設定.
    .onChange(of: Notifications.shared.openingSupport, initial: true) { _, opening in
      if opening { tab = .settings }
    }
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

/// Each group's unread lines that count for `me`, read again as they
/// change.
struct UnreadRequest: FetchKeyRequest, Hashable {
  let me: String

  func fetch(_ db: Database) throws -> [String: Int] {
    try Chats.unreadByGroup(me: me, db: db)
  }
}

enum RootTab: Hashable {
  case calendar, groups, settings
}
