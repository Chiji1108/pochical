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
  @State private var openGroupID: String?
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
  /// How far down the screen its own top is, the bar's under the status bar.
  @State private var barTop: CGFloat = 0

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
    RootNavigation(navigator: navigator, tint: colors.accentDefault, tabs: hosted(tabs)) { page in
      hosted(self.page(page).environment(\.photoShelf, navigator.photoShelf(of: page)))
    }
    .ignoresSafeArea()
    .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.top } action: { barTop = $0 }
    // The reminders' notifications, put in anew as what they read changes.
    .modifier(ReminderUpdates())
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

  private var tabs: some View {
    TabView(selection: Binding(get: { navigator.tab }, set: navigator.select)) {
      Tab("カレンダー", systemImage: "calendar", value: .calendar) {
        CalendarScreen()
      }
      Tab("グループ", systemImage: "person.2", value: .groups) {
        GroupsScreen(openID: $openGroupID, unread: unread) {
          scanning = true
        }
      }
      .badge(groupsUnread)
      Tab("設定", systemImage: "gearshape", value: .settings) {
        SettingsScreen()
          .tabRoot()
      }
      // Pochical's people's answers not read yet, on 設定's chat with them
      // (spec/chat.md, Unread lines and typing).
      .badge(unread[ChatPlace.supportID] ?? 0)
    }
    // The tab's title and buttons, in the one bar: a tab's own content does
    // not reach it through the TabView. The calendar has none, its month
    // heading it, and グループ heads itself in the bar's band (GroupsScreen).
    .navigationTitle(navigator.tab == .settings ? "設定" : "")
    .toolbar {
      if navigator.tab == .groups, let group = openGroup(openGroupID, among: groups) {
        GroupHubButtons(group: group, navigator: navigator)
      }
    }
  }

  /// A page over the tabs.
  @ViewBuilder private func page(_ page: RootPage) -> some View {
    switch page {
    case .group(let route):
      GroupPage(route: route) { left in
        // Its pages go, wherever the person is now; the rail opens on the
        // first group if it was the one open.
        if openGroupID == left { openGroupID = nil }
        navigator.close(left)
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

  /// The tabs, or a page over them, given what the app's screens are given:
  /// UIKit hosts each with an environment of its own (RootNavigation).
  private func hosted(_ content: some View) -> AnyView {
    AnyView(
      content
        .modifier(
          AppEnvironment(
            settings: settings, groupCalls: groupCalls, session: session, openPlace: openPlace)
        )
        .tint(colors.accentDefault)
        .toggleStyle(ThemedSwitch())
        .environment(\.look, settings.device.look)
        .environment(\.english, settings.device.heading.english)
        .environment(\.meID, meID)
        .environment(\.rootNavigator, navigator)
        .environment(\.barTop, barTop)
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

/// A day a widget asks to open, pochical://day/{yyyy-mm-dd}, for the
/// calendar to open as a tap does.
@MainActor @Observable final class OpenedDay {
  static let shared = OpenedDay()
  var day: Day?
}

/// The day a link names, pochical://day/2026-09-24.
func openedDay(of url: URL) -> Day? {
  guard url.scheme == "pochical", url.host() == "day" else { return nil }
  return Day(url.path(percentEncoded: false).trimmingCharacters(in: CharacterSet(charactersIn: "/")))
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

enum RootTab: Hashable {
  case calendar, groups, settings
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
