import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import UserNotifications

/// The app's tabs, as /design's tab bar has them: カレンダー, グループ and
/// 設定, and every page opened over them (RootNavigation). An invitation
/// link opened in the app (AppRoot) shows its join screen over them, and
/// once in, the group; one to a group the person is in already opens the
/// group, saying so.
struct RootView: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  @Environment(\.groupCalls) private var groupCalls
  @Environment(AccountSession.self) private var session
  @Environment(\.scenePhase) private var scenePhase
  @Environment(OpenPlaceSocket.self) private var openPlace
  @FetchAll(GroupRow.order(by: \.joinedAtMs)) private var groups
  /// Each group's unread lines that count (spec/chat.md, Unread lines).
  @Fetch private var unread: [String: Int] = [:]
  /// What is read in each chat, for the notifications of lines read to go.
  @Fetch private var read = ReadState()
  /// The group open in グループ, this window's own, starting on the one
  /// picked last, which is kept as it changes, so the app opens on it again
  /// however it was closed (spec/shift-patterns.md).
  @State private var openGroupID = UserDefaults.standard.string(forKey: Self.openGroupKey)
  private static let openGroupKey = "openGroup"
  /// The tab shown, and the pages over it.
  @State private var navigator = RootNavigator()
  /// A group just made, whose メンバーを招待 takes the place of グループを作る
  /// once the group has come, as /design goes on to it.
  @State private var inviting: String?
  /// An invitation opened, its join screen shown over the tabs.
  @Binding var invite: OpenedInvite?
  @State private var scanning = false
  /// An invitation read by the camera, opened once the camera has gone:
  /// one cover cannot come up while another is going.
  @State private var scanned: OpenedInvite?
  /// Said over the tabs for a moment, as a toast is.
  @State private var notice: String?
  @State private var notices = 0

  /// The place whose socket is held (spec/sync-protocol.md, Sockets): that
  /// of the top page of a place over the tabs, else the open group's while
  /// グループ shows and the chat with Pochical's people's while 設定 does;
  /// none in the background.
  private var openPlaceID: String? {
    guard scenePhase == .active else { return nil }
    if let placeID = navigator.placeID { return placeID }
    switch navigator.tab {
    case .calendar: return nil
    case .groups: return openGroup(openGroupID, among: groups)?.id
    case .settings: return ChatPlace.supportID
    }
  }

  /// The signed-in user, as the session says.
  private var meID: String? {
    session.userID
  }

  /// The groups' unread lines, without the chat with Pochical's people.
  private var groupsUnread: Int {
    unread.filter { $0.key != ChatPlace.supportID }.values.reduce(0, +)
  }

  var body: some View {
    RootNavigation(
      navigator: navigator, screen: { hosted(screen($0)) }, badges: badges
    ) { page in
      hosted(self.page(page).environment(\.photoShelf, navigator.photoShelf(of: page)))
    } nothingOpen: { tab in
      hosted(NothingOpen(tab: tab, hasGroups: !groups.isEmpty))
    }
    .ignoresSafeArea()
    // The reminders' notifications, put in anew as what they read changes.
    .modifier(ReminderUpdates())
    // The days kept in the device's calendar while 自動で反映 is on.
    .modifier(CalendarReflection())
    // The widgets' entries, made again as what they show changes.
    .modifier(WidgetReloads())
    // The shape the user's groups draw their marks in.
    .modifier(MarkLookSync())
    .task(id: meID) {
      guard let meID else { return }
      _ = try? await $unread.load(UnreadRequest(me: meID))
      _ = try? await $read.load(ReadStateRequest(me: meID))
    }
    // Here, under any cover over the tabs, rather than on a screen a cover
    // or a tab switch takes away.
    .onChange(of: openPlaceID, initial: true) { _, placeID in openPlace.want(placeID) }
    .onChange(of: openGroupID) { _, id in
      UserDefaults.standard.set(id, forKey: Self.openGroupKey)
    }
    .environment(\.openInvite, OpenInviteAction { code in invite = OpenedInvite(code: code) })
    .environment(\.say, SayAction(say: say))
    // The app icon's badge follows what is read here too, as the
    // notifications set it from the server.
    .onChange(of: unread.values.reduce(0, +), initial: true) { _, total in
      UNUserNotificationCenter.current().setBadgeCount(total)
    }
    // The notifications of lines read go, those read on another device
    // too, should its withdrawal not have reached this one: whatever the
    // badge, as a chat turned off counts nothing there. What the device
    // first loads may be from before the notifications since, so only a
    // chat cleared after it counts.
    .onChange(of: read, initial: true) { before, read in
      let known = before == ReadState() ? nil : before
      Task { await Notifications.shared.withdrawRead(read, before: known) }
    }
    // A tapped notification opens its chat, the one that launched the
    // app too: a group's once the group has come, at launch.
    .onChange(
      of: OpeningKey(
        chat: Notifications.shared.opening, groupIDs: groups.map(\.id), meID: meID),
      initial: true
    ) { openNotified() }
    // A widget's day opens on the calendar (spec/widgets.md).
    .onChange(of: OpenedDay.shared.day, initial: true) { _, day in
      guard day != nil else { return }
      navigator.show([], over: .calendar)
    }
    // A widget's group, set to someone or a group: its table at the day,
    // else its top. One the person has left themselves leaves them on
    // their first group.
    .onChange(
      of: OpenedGroupKey(link: OpenedGroup.shared.link, groupIDs: groups.map(\.id)), initial: true
    ) { _, key in
      guard let link = key.link else { return }
      OpenedGroup.shared.link = nil
      let group = groups.first { $0.id == link.groupID }
      openGroupID = group?.id
      navigator.show(
        group.flatMap { group in link.day.map { [.group(.shifts(group, day: $0))] } } ?? [],
        over: .groups)
    }
    .onChange(of: groups.map(\.id)) { inviteMade() }
    // A group the device has let go of, taken out of it by a member or by
    // the group's end (spec/sync-protocol.md, A group's end), takes its
    // pages with it, as one the person leaves does.
    .task {
      for await note in NotificationCenter.default.notifications(named: groupLeft) {
        if let groupID = note.userInfo?["groupID"] as? String { close(groupID) }
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
        open(groupID)
      } onAlreadyIn: { details in
        open(details.groupID)
        say("「\(details.name)」にはもう参加しています")
      }
    }
    .overlay(alignment: .top) {
      if let notice {
        NoticeCapsule(words: notice)
          .comesAsNotice()
      }
    }
  }

  /// The groups' unread lines on グループ, and on 設定 Pochical's people's
  /// answers not read yet, in its chat with them (spec/chat.md, Unread
  /// lines and typing).
  private var badges: [RootTab: Int] {
    [.groups: groupsUnread, .settings: unread[ChatPlace.supportID] ?? 0]
  }

  /// A tab's screen, at the root of its navigation.
  @ViewBuilder private func screen(_ tab: RootTab) -> some View {
    switch tab {
    case .calendar:
      CalendarScreen(place: navigator.calendar)
    case .groups:
      GroupsScreen(openID: $openGroupID, unread: unread) {
        scanning = true
      }
    case .settings:
      SettingsScreen()
    }
  }

  /// A page over the tabs.
  @ViewBuilder private func page(_ page: RootPage) -> some View {
    switch page {
    case .group(let route):
      GroupPage(route: route) { left in
        close(left)
      } onMade: { made in
        inviting = made
        inviteMade()
      }
    case .support:
      SupportChatScreen()
    case .photos(let photos):
      ChatPhotosScreen(photos: photos)
    case .linked(let linked):
      LinkedPageView(page: linked)
    }
  }

  /// A group the person is no longer in: its pages go, wherever the person
  /// is now, and the rail opens on the first group if it was the one open.
  private func close(_ groupID: String) {
    if openGroupID == groupID { openGroupID = nil }
    navigator.close(groupID)
  }

  /// The tabs, or a page over them, given what the app's screens are given:
  /// UIKit hosts each with an environment of its own (RootNavigation).
  private func hosted(_ content: some View) -> AnyView {
    AnyView(
      content
        .modifier(
          AppEnvironment(
            settings: settings, groupCalls: groupCalls, session: session, openPlace: openPlace)
        )
        .toggleStyle(ThemedSwitch())
        .environment(\.look, settings.device.look)
        .environment(\.english, settings.device.heading.english)
        .environment(\.meID, meID)
        .environment(\.rootNavigator, navigator)
        .environment(\.openInvite, OpenInviteAction { code in invite = OpenedInvite(code: code) })
        .environment(\.say, SayAction(say: say)))
  }

  /// A group a widget opened, and the groups there are to show it in.
  private struct OpenedGroupKey: Equatable {
    let link: GroupLink?
    let groupIDs: [String]
  }

  /// Turns グループを作る into メンバーを招待 for the group just made, once it
  /// is here, and opens the group beside the rail. A person who left
  /// グループを作る meanwhile is left where they are, as Telegram and LINE
  /// make a group without taking anyone to it: it is in the rail.
  private func inviteMade() {
    guard let id = inviting, let made = groups.first(where: { $0.id == id }) else { return }
    inviting = nil
    if navigator.replace(.group(.newGroup), with: .group(.invite(made))) {
      openGroupID = made.id
    }
  }

  /// A chat a notification opened, and what it is opened with.
  private struct OpeningKey: Equatable {
    let chat: OpenedChat?
    let groupIDs: [String]
    let meID: String?
  }

  /// Shows the chat a tapped notification opened over its tab and nothing
  /// else: the chat with Pochical's people over 設定, a group's over its
  /// group in グループ.
  private func openNotified() {
    guard let chat = Notifications.shared.opening else { return }
    if chat.groupID == ChatPlace.supportID {
      navigator.show([.support], over: .settings)
    } else {
      guard let group = groups.first(where: { $0.id == chat.groupID }), let meID else { return }
      openGroupID = group.id
      navigator.show(
        [.group(.chat(group, thread: chat.threadID, with: otherIn(chat.threadID, me: meID)))],
        over: .groups)
    }
    Notifications.shared.opening = nil
  }

  /// The group an invitation led to, its join screen gone.
  private func open(_ groupID: String) {
    openGroupID = groupID
    invite = nil
    navigator.show([], over: .groups)
  }

  private func say(_ words: String) {
    notices += 1
    let said = notices
    withAnimation { notice = words }
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(2.5))
      if notices == said {
        withAnimation { notice = nil }
      }
    }
  }
}

/// A day a link asks to open (`openedDay(of:)`): a widget's, or a device
/// calendar's event's, for the calendar to open as a tap does.
@MainActor @Observable final class OpenedDay {
  static let shared = OpenedDay()
  var day: Day?
}

/// A group a widget set to someone asks to open: its table at a day, or
/// its top.
struct GroupLink: Hashable {
  let groupID: String
  let day: Day?
}

/// pochical://group/{groupId}, or with /day/{yyyy-mm-dd} after it.
@MainActor @Observable final class OpenedGroup {
  static let shared = OpenedGroup()
  var link: GroupLink?
}

/// The group, and the day, a link names.
func openedGroup(of url: URL) -> GroupLink? {
  guard url.scheme == "pochical", url.host() == "group" else { return nil }
  let parts = url.path(percentEncoded: false).split(separator: "/").map(String.init)
  guard let groupID = parts.first else { return nil }
  let day = parts.count == 3 && parts[1] == "day" ? Day(parts[2]) : nil
  return GroupLink(groupID: groupID, day: day)
}

/// Says a few words over the tabs for a moment, as /design's toast: for a
/// page to tell what it did not do without an alert to close.
struct SayAction {
  let say: @MainActor (String) -> Void

  @MainActor func callAsFunction(_ words: String) {
    say(words)
  }
}

extension EnvironmentValues {
  @Entry var say = SayAction { _ in }
}

/// Each group's unread lines that count for `me`, read again as they
/// change.
struct UnreadRequest: FetchKeyRequest, Hashable {
  let me: String

  func fetch(_ db: Database) throws -> [String: Int] {
    try Chats.unreadByGroup(me: me, db: db)
  }
}

/// A tab, named to the system's tab bar controller by its raw value.
enum RootTab: String, CaseIterable, Hashable {
  case calendar, groups, settings

  var title: String {
    switch self {
    case .calendar: "カレンダー"
    case .groups: "グループ"
    case .settings: "設定"
    }
  }

  var systemImage: String {
    switch self {
    case .calendar: "calendar"
    case .groups: "person.2"
    case .settings: "gearshape"
    }
  }
}

/// The system's switch, its track on in the テーマ's switch color rather
/// than the accent, which a near-white ink would leave the white knob lost
/// on.
struct ThemedSwitch: ToggleStyle {
  func makeBody(configuration: ToggleStyleConfiguration) -> some View {
    ThemedSwitchBody(configuration: configuration)
  }
}

private struct ThemedSwitchBody: View {
  @Environment(\.themeColors) private var colors
  let configuration: ToggleStyleConfiguration

  var body: some View {
    Toggle(configuration)
      .toggleStyle(.switch)
      .tint(colors.accentSwitch)
  }
}

/// What stands beside a tab on a wide screen while none of its pages is
/// open, on the app's ground, as Messages says to pick a conversation:
/// nothing to pick before there is a group. The calendar never has a side.
private struct NothingOpen: View {
  @Environment(\.themeColors) private var colors
  let tab: RootTab
  let hasGroups: Bool

  var body: some View {
    Group {
      switch tab {
      case .groups where hasGroups:
        ContentUnavailableView("チャットを選んでください", systemImage: "bubble.left.and.bubble.right")
      case .settings:
        ContentUnavailableView("項目を選んでください", systemImage: "gearshape")
      case .groups, .calendar:
        EmptyView()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(colors.backgroundBase)
  }
}
