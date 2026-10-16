import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// The account the environment holds until the app puts its own: one,
/// made once, so reading the default makes no new one each time.
private let placeholderAccount = Account()

/// Opens one of Pochical's invitations on its join screen, as an action
/// the environment carries, as SwiftUI's OpenURLAction is.
struct OpenInviteAction {
  let open: @MainActor (String) -> Void

  @MainActor func callAsFunction(_ code: String) {
    open(code)
  }
}

/// Opens one of the グループ tab's pages over the one showing, as a link
/// within the group does, for what cannot be a link: a menu's button or a
/// sheet's.
struct OpenGroupRouteAction {
  let open: @MainActor (GroupRoute) -> Void

  @MainActor func callAsFunction(_ route: GroupRoute) {
    open(route)
  }
}

extension EnvironmentValues {
  /// The signed-in user, whom the calls and sockets go as.
  @Entry var account = placeholderAccount
  /// The server's GroupService, as the signed-in user.
  @Entry var groupCalls = GroupCalls(account: placeholderAccount)
  /// The open group's socket, for its screens to ask it for chat pages.
  @Entry var groupSocket: SyncClient?
  /// The user's own socket, connected again as someone else once the
  /// account is deleted.
  @Entry var userSocket: SyncClient?
  /// The groups' sockets, closed once their chat outbox is sent.
  @Entry var groupSockets = GroupSockets()
  /// Opens one of Pochical's invitations on its join screen, as reading
  /// its link does.
  @Entry var openInvite = OpenInviteAction { _ in }
  /// Opens a page of the グループ tab over the one showing.
  @Entry var openGroupRoute = OpenGroupRouteAction { _ in }
  /// The group whose photos its screens' faces are, for those that know a
  /// member's photo but not the group (MemberAvatar).
  @Entry var photoGroupID = ""
  /// Each member's photo by their id, for faces given only who it is.
  @Entry var memberFaces: [String: String] = [:]
  /// The signed-in user's id, once known, for faces to know their own.
  @Entry var meID: String?
}

/// The グループ tab (/design's DesignGroup): with no group yet, what groups
/// are for and a way to start one; else the groups down the side, as
/// /design's rail, and the one open beside them.
struct GroupsScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.account) private var account
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.groupSockets) private var groupSockets
  @Dependency(\.defaultDatabase) private var database
  @FetchAll(GroupRow.order(by: \.joinedAtMs)) private var groups
  /// The open group's socket, open while the group's screens are and the
  /// app is in the foreground (spec/sync-protocol.md, Sockets).
  @State private var socket: SyncClient?
  /// The group open beside the rail, the first until one is picked.
  @Binding var openID: String?
  /// A chat a notification opened, shown once its group is.
  @Binding var openingChat: OpenedChat?
  /// Each group's unread lines that count.
  let unread: [String: Int]
  /// Opens the camera to read a group's QR code.
  let onScan: () -> Void
  @State private var path: [GroupRoute] = []
  /// A group just made, whose メンバーを招待 opens over its hub once the
  /// group has come, as /design goes on to it.
  @State private var inviting: String?
  /// How far down the screen's own top is, over the navigation bar's.
  @State private var screenTop: CGFloat = 0

  var body: some View {
    NavigationStack(path: $path) {
      Group {
        if let open = groups.first(where: { $0.id == openID }) ?? groups.first {
          HStack(alignment: .top, spacing: 0) {
            GroupRail(
              groups: groups, openID: open.id, unread: unread,
              onOpen: { id in
                openID = id
                inviting = nil
              },
              onNew: { path.append(.newGroup) }, onScan: onScan)
            // Up beside the bar's heading, as it stood beside the page's.
            .padding(.top, screenTop)
            .ignoresSafeArea(.container, edges: .top)
            GroupHub(group: open) {
              path.append(.invite(open))
            } onSettings: {
              path.append(.settings(open))
            } onShifts: { day in
              path.append(.shifts(open, day: day))
            } onChat: { thread, other in
              path.append(.chat(open, thread: thread, with: other))
            }
            .padding(.horizontal, 16)
          }
          // The group's heading in the bar's band, beside its buttons, not
          // an item of the bar: an item there would turn into the next
          // page's back button as it is pushed. The bar itself stays, and
          // with it the blur at the top of the pages pushed from here.
          .overlay(alignment: .topLeading) {
            GroupHeading(group: open)
              // Level with the bar's buttons, at its top.
              .frame(maxWidth: .infinity, minHeight: Metrics.touch, alignment: .leading)
              .padding(.leading, GroupRail.width + 16)
              .padding(.trailing, GroupHub.actionsWidth)
              .padding(.top, screenTop)
              .ignoresSafeArea(.container, edges: .top)
          }
        } else {
          NoGroups(onNew: { path.append(.newGroup) }, onScan: onScan)
            .padding(.horizontal, 20)
            .toolbarVisibility(.hidden, for: .navigationBar)
        }
      }
      // The app's ground, as the calendar's, which dark mode lifts off black.
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(colors.backgroundBase)
      .navigationDestination(for: GroupRoute.self) { route in
        // Pages show the group as it is now, renamed meanwhile or not.
        let live = { (group: GroupRow) in groups.first { $0.id == group.id } ?? group }
        switch route {
        case .newGroup:
          NewGroupPage { made in
            openID = made
            inviting = made
            path.removeAll()
            inviteMade()
          }
        case .invite(let group):
          InvitePage(group: live(group))
        case .shifts(let group, let day):
          GroupShiftsPage(group: live(group), day: day)
        case .chat(let group, let thread, let other, let sharing):
          ChatScreen(group: live(group), threadID: thread, otherID: other, sharing: sharing)
        case .settings(let group):
          GroupSettingsPage(group: live(group)) {
            path.append(.invite(group))
          } onLeft: {
            openID = nil
            path.removeAll()
          }
        }
      }
    }
    .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.top } action: { screenTop = $0 }
    .environment(\.openGroupRoute, OpenGroupRouteAction { open($0) })
    .onChange(of: groups.map(\.id)) { inviteMade() }
    // Gone somewhere else meanwhile, the person is left there.
    .onChange(of: path) { _, path in
      if !path.isEmpty { inviting = nil }
    }
    .environment(\.groupSocket, socket)
    .environment(\.photoGroupID, (groups.first { $0.id == openID } ?? groups.first)?.id ?? "")
    // Once its group has come, at launch.
    .task(id: OpeningKey(chat: openingChat, groupIDs: groups.map(\.id))) {
      await showOpeningChat()
    }
    // A widget's group: its table at the day, else its top. One the person
    // has left themselves leaves them on their first group.
    .onChange(of: OpenedGroupKey(link: OpenedGroup.shared.link, groupIDs: groups.map(\.id)), initial: true) {
      _, key in
      guard let link = key.link else { return }
      OpenedGroup.shared.link = nil
      guard let group = groups.first(where: { $0.id == link.groupID }) else {
        openID = nil
        path = []
        return
      }
      path = link.day.map { [.shifts(group, day: $0)] } ?? []
    }
    .task(id: SocketKey(groupID: openGroupID ?? "", active: scenePhase == .active)) {
      guard scenePhase == .active, let groupID = openGroupID else { return }
      let (client, hold) = await groupSockets.open(groupID, account: account, database: database)
      socket = client
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(3600))
      }
      // Lines just sent still go, the app gone to the background or
      // another group opened (spec/sync-protocol.md, Sockets).
      await groupSockets.close(hold, of: groupID)
    }
  }

  /// A group a widget opened, and the groups there are to show it in.
  private struct OpenedGroupKey: Equatable {
    let link: GroupLink?
    let groupIDs: [String]
  }

  /// A chat a notification opened, and the groups there are to show it in.
  private struct OpeningKey: Hashable {
    let chat: OpenedChat?
    let groupIDs: [String]
  }

  /// Shows the chat a notification opened, over its group.
  private func showOpeningChat() async {
    guard let chat = openingChat,
      let group = groups.first(where: { $0.id == chat.groupID })
    else { return }
    let me = await groupCalls.userID()
    let other = me.flatMap { otherIn(chat.threadID, me: $0) }
    path = [.chat(group, thread: chat.threadID, with: other)]
    openingChat = nil
  }

  /// Opens メンバーを招待 for the group just made, once it is here.
  private func inviteMade() {
    guard let id = inviting, let made = groups.first(where: { $0.id == id }) else { return }
    inviting = nil
    path = [.invite(made)]
  }

  /// The group open, whose socket is kept.
  private var openGroupID: String? {
    (groups.first { $0.id == openID } ?? groups.first)?.id
  }
}

extension GroupsScreen {
  /// Goes to `route`; a chat already open below, as when its day is
  /// shared from みんなのシフト opened from it, is gone back to rather
  /// than opened twice.
  fileprivate func open(_ route: GroupRoute) {
    if case .chat(let group, let thread, _, _) = route,
      let below = path.firstIndex(where: {
        if case .chat(let other, let otherThread, _, _) = $0 {
          return other.id == group.id && otherThread == thread
        }
        return false
      })
    {
      path.removeSubrange(below...)
    }
    path.append(route)
  }
}

enum GroupRoute: Hashable {
  case newGroup
  case invite(GroupRow)
  /// Everyone's shifts by the month, on a day when one is given.
  case shifts(GroupRow, day: Day?)
  case settings(GroupRow)
  /// One of the group's chats: 全体チャット, or a one-to-one chat with the
  /// member `with`; `sharing`, a day brought from みんなのシフト to share.
  case chat(GroupRow, thread: String, with: String?, sharing: Day? = nil)
}

/// No group yet: a sample of 一覧, the table a group is mostly read in,
/// filling the screen and fading out under what sharing shifts is for and
/// the buttons, 作成 and QR参加, at the foot (/design's NoGroups). Text
/// too large to leave the sample room scrolls the words alone.
private struct NoGroups: View {
  @Environment(\.english) private var english
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  /// The sample's rows pick nothing.
  @State private var pickNothing = Handler<Day>()
  let onNew: () -> Void
  let onScan: () -> Void

  var body: some View {
    ViewThatFits(in: .vertical) {
      VStack(spacing: 0) {
        sample
        foot
      }
      ScrollView {
        foot.padding(.vertical, 24)
      }
    }
  }

  /// What the days are drawn with, for the rows and weeks to compare.
  private var drawing: DayDrawing {
    DayDrawing(colors: colors, look: look, english: english, week: settings.device.week)
  }

  /// As much of the table as there is room for, at least a few rows, its
  /// lower part fading into the ground; a picture only.
  private var sample: some View {
    let days = (0..<sampleDays).map { Day.today.adding(days: $0) }
    let members = sampleMembers(days)
    return Color.clear
      .frame(minHeight: 180, maxHeight: .infinity)
      .overlay(alignment: .top) {
        VStack(spacing: 0) {
          GroupDayHeader(members: members, groupID: "sample")
          ForEach(days, id: \.self) { day in
            GroupDayRow(
              day: day, members: members, picked: false, onPick: pickNothing, drawing: drawing
            )
            .equatable()
          }
        }
        .fixedSize(horizontal: false, vertical: true)
      }
      .clipped()
      .mask {
        LinearGradient(
          stops: [.init(color: .black, location: 0.35), .init(color: .clear, location: 0.92)],
          startPoint: .top, endPoint: .bottom)
      }
      .allowsHitTesting(false)
      .accessibilityHidden(true)
  }

  private var foot: some View {
    VStack(spacing: 12) {
      Text("グループでシフトを共有できます")
        .font(.title2.bold())
        .multilineTextAlignment(.center)
      Text("家族や友達とシフトを見せ合って、\n休みが重なる日がすぐ分かります。")
        .font(.subheadline)
        .foregroundStyle(colors.textTertiary)
        .multilineTextAlignment(.center)
        .lineSpacing(4)
        .padding(.bottom, 12)
      Button(action: onNew) {
        Label("グループを作る", systemImage: "plus")
          .font(.headline)
          .frame(maxWidth: .infinity, minHeight: Metrics.control)
      }
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.capsule)
      .tint(colors.accentFill)
      .foregroundStyle(colors.accentOnFill)
      Button(action: onScan) {
        Label("QRコードで参加", systemImage: "qrcode.viewfinder")
          .frame(maxWidth: .infinity, minHeight: Metrics.control)
      }
      .buttonStyle(.bordered)
      .buttonBorderShape(.capsule)
      .tint(colors.accentDefault)
    }
    .padding(.bottom, 16)
  }
}

/// The sample's days, from today: a month, more than even a tall screen
/// shows, so the table always runs on into its fade.
private let sampleDays = 31

/// The sample's people, as /design's: a partner at the office, home on
/// Wednesdays; a mother part-time on Mondays, Wednesdays and Fridays, both
/// off on weekends and holidays; a nurse whose week, the same every week,
/// has Saturday off too, so everyone is off one day.
private func sampleMembers(_ days: [Day]) -> [GroupMember] {
  let off = sample("off", "休み", "🌿", "leaf", 0, off: true)
  let office = sample("office", "出勤", "💼", "briefcase", 9)
  let home = sample("home", "在宅", "🏠", "house", 10)
  let part = sample("part", "パート", "🛒", "shoppingBag", 2)
  let nurse = ["day", "night", "after", "off"].compactMap(ReadyPatterns.pattern).map { ready in
    Pattern(
      id: ready.id, name: ready.name, emoji: ready.emoji, symbol: ready.symbol, icon: ready.icon,
      color: ready.color, time: ready.time.map { ShiftTime(start: $0.start, end: $0.end) },
      countsAsOff: ready.countsAsOff)
  }
  // Sunday on: 明け, 休み, 日勤, 日勤, 夜勤, 明け, 休み.
  let nurseWeek = ["after", "off", "day", "day", "night", "after", "off"]
  let rests = { (day: Day) in day.weekday == 0 || day.weekday == 6 || day.holidayName != nil }
  let shifts = { (shift: (Day) -> PatternID) in
    Dictionary(uniqueKeysWithValues: days.map { ($0, shift($0)) })
  }
  return [
    sampleMember(
      "yuki", "ゆうき", face: 1005,
      MemberCalendar(
        patterns: [office, home, off],
        days: shifts { rests($0) ? off.id : $0.weekday == 3 ? home.id : office.id })),
    sampleMember(
      "mother", "お母さん", face: 429,
      MemberCalendar(
        patterns: [part, off],
        days: shifts { [1, 3, 5].contains($0.weekday) && $0.holidayName == nil ? part.id : off.id })),
    sampleMember(
      "misaki", "みさき", face: 823,
      MemberCalendar(patterns: nurse, days: shifts { nurseWeek[$0.weekday] })),
  ]
}

/// One of the sample's people, with /design's sample photo of the id, held
/// in the app as SampleFace〈id〉.
private func sampleMember(_ id: String, _ name: String, face: Int, _ calendar: MemberCalendar)
  -> GroupMember
{
  var member = GroupMember(userID: id, name: name, calendar: calendar)
  member.photoID = "\(samplePhoto)SampleFace\(face)"
  return member
}

private func sample(
  _ id: String, _ name: String, _ emoji: String, _ icon: String, _ color: Int, off: Bool = false
) -> Pattern {
  Pattern(
    id: id, name: name, emoji: emoji, symbol: String(name.prefix(1)), icon: icon, color: color,
    countsAsOff: off)
}

/// The groups down the left edge, as the messaging apps' server rails: a
/// mark each, the open one ringed and flagged at the edge, then the ways to
/// start or join one (/design's GroupRail).
private struct GroupRail: View {
  @Environment(\.themeColors) private var colors
  let groups: [GroupRow]
  let openID: String
  let unread: [String: Int]
  let onOpen: (String) -> Void
  let onNew: () -> Void
  let onScan: () -> Void
  /// How far over the screen's foot the tab bar's top is: the rail fades
  /// out above it.
  @State private var barTop: CGFloat = 0

  /// The height the rail fades out over, gone at the tab bar's top, as
  /// /design's rail does over its 56 points' tab bar 20 over the foot.
  private static var fade: CGFloat { 72 }
  /// The rail's width, which the page beside it starts after.
  static var width: CGFloat { 60 }

  var body: some View {
    ScrollView {
      VStack(spacing: 12) {
        ForEach(groups) { group in
          let isOpen = group.id == openID
          let count = unread[group.id] ?? 0
          Button {
            onOpen(group.id)
          } label: {
            GroupMark(mark: group.mark, shelf: group.id, isOpen: isOpen)
              .frame(width: 60, height: 48)
              .overlay(alignment: .leading) {
                // The flag at the edge, by the open group.
                UnevenRoundedRectangle(bottomTrailingRadius: Radius.xs, topTrailingRadius: Radius.xs)
                  .fill(colors.accentDefault)
                  .frame(width: 4, height: isOpen ? 32 : 0)
              }
              .overlay(alignment: .bottomTrailing) {
                // Its chats' unread, ringed in the rail's ground.
                if count > 0 {
                  UnreadCount(count: count)
                    .padding(2)
                    .background(colors.fillQuaternary, in: Capsule())
                    .offset(x: -1, y: 2)
                    .accessibilityHidden(true)
                }
              }
              .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(count > 0 ? "\(group.name)、未読\(count)件" : group.name)
          .accessibilityAddTraits(isOpen ? .isSelected : [])
        }
        Capsule()
          .fill(colors.borderDefault)
          .frame(width: 28, height: 2)
          .accessibilityHidden(true)
        Button("グループを作る", systemImage: "plus", action: onNew)
          .labelStyle(.iconOnly)
          .font(.title3)
          .foregroundStyle(colors.accentDefault)
          .frame(width: 44, height: 44)
          .background(colors.backgroundCard, in: Circle())
          .buttonStyle(.plain)
        Button("QRコードで参加", systemImage: "qrcode.viewfinder", action: onScan)
          .labelStyle(.iconOnly)
          .font(.title3)
          .foregroundStyle(colors.accentDefault)
          .frame(width: 44, height: 44)
          .background(colors.backgroundCard, in: Circle())
          .buttonStyle(.plain)
      }
      .padding(.vertical, 12)
      .animation(.easeOut(duration: 0.15), value: openID)
    }
    .scrollIndicators(.hidden)
    // Under the bar only where its heading is, which leaves the marks clear.
    .scrollEdgeEffectHidden(true, for: .top)
    // The last of many groups can rise clear of the fade.
    .contentMargins(.bottom, barTop + Self.fade, for: .scrollContent)
    .frame(width: Self.width)
    .background(
      colors.fillQuaternary,
      in: UnevenRoundedRectangle(topTrailingRadius: Radius.xl)
    )
    // Runs on to the screen's foot like the page beside it, fading out
    // just over the tab bar with what scrolls in it, as Discord's rail
    // does over its own panel.
    .mask {
      GeometryReader { proxy in
        let height = max(proxy.size.height, 1)
        LinearGradient(
          stops: [
            .init(color: .black, location: max(0, (height - barTop - Self.fade) / height)),
            .init(color: .clear, location: max(0, (height - barTop) / height)),
          ], startPoint: .top, endPoint: .bottom)
      }
    }
    .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.bottom } action: { barTop = $0 }
    .ignoresSafeArea(edges: .bottom)
  }
}

/// A group's mark on its rounded square: on the card's ground, and when
/// open on the accent's with a ring round it, the corners drawn in.
private struct GroupMark: View {
  @Environment(\.themeColors) private var colors
  let mark: GroupMarkValue
  /// The group's photos, for a photo mark.
  let shelf: String
  let isOpen: Bool

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: isOpen ? Radius.md : Radius.lg)
    GroupMarkView(mark: mark, size: 44, shelf: shelf)
      .background(isOpen ? colors.accentContainer : colors.backgroundCard, in: shape)
      .clipShape(shape)
      .overlay {
        if isOpen {
          shape.strokeBorder(colors.accentDefault, lineWidth: 2)
            .overlay(shape.inset(by: 2).strokeBorder(colors.backgroundCard, lineWidth: 2))
        }
      }
  }
}

/// The open group: its mark and name, 招待, this week of everyone's
/// shifts and its chat (/design's GroupHub).
private struct GroupHub: View {
  @Environment(\.themeColors) private var colors
  @Fetch private var members: [GroupMember] = []
  let group: GroupRow
  let onInvite: () -> Void
  let onSettings: () -> Void
  /// Opens everyone's shifts by the month, on a day when one is given.
  let onShifts: (Day?) -> Void
  /// Opens a chat: its thread, and the other member of a one-to-one chat.
  let onChat: (String, String?) -> Void

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        VStack(alignment: .leading, spacing: 8) {
          HStack {
            Text("シフト")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(colors.textTertiary)
              .accessibilityAddTraits(.isHeader)
            Spacer()
            Button {
              onShifts(nil)
            } label: {
              HStack(spacing: 2) {
                Text("月で見る")
                Image(systemName: "chevron.right").imageScale(.small)
              }
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(colors.accentDefault)
            }
            .buttonStyle(.plain)
          }
          MemberWeek(members: members, onOpen: onShifts)
        }
        VStack(alignment: .leading, spacing: 8) {
          Text("チャット")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(colors.textTertiary)
            .accessibilityAddTraits(.isHeader)
          ChatList(group: group, members: members) { thread, other in
            onChat(thread, other)
          }
        }
      }
      .padding(.bottom, 24)
    }
    .scrollIndicators(.hidden)
    .contentMargins(.top, 8, for: .scrollContent)
    .toolbar {
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button("メンバーを招待", systemImage: "person.badge.plus", action: onInvite)
        Button("グループの設定", systemImage: "slider.horizontal.3", action: onSettings)
      }
    }
    .task(id: request) {
      _ = try? await $members.load(request)
    }
  }

  /// The group's members with their days from today, as far ahead as
  /// 次のみんな休み looks.
  private var request: GroupMembersRequest {
    let ahead = Day.today.adding(days: nextTogetherDays - 1)
    return GroupMembersRequest(groupID: group.id, from: Day.today, through: ahead)
  }

  /// Room for the bar's two buttons on their glass, and a gap before them.
  static var actionsWidth: CGFloat { Metrics.touch * 2 + 48 }
}

/// The open group's mark and name, over its page.
private struct GroupHeading: View {
  @Environment(\.themeColors) private var colors
  let group: GroupRow

  var body: some View {
    HStack(spacing: 8) {
      GroupMarkView(mark: group.mark, size: 26, shelf: group.id)
        .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.sm))
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
        .accessibilityHidden(true)
      Text(group.name)
        .font(.title2.bold())
        .lineLimit(1)
        .accessibilityAddTraits(.isHeader)
    }
  }
}

/// The groups' sockets, one for each group at most: open while a screen
/// holds it, then closing once its chat outbox is sent and acknowledged
/// (spec/sync-protocol.md, Sockets). The app waits for them in the
/// background as for its own socket, those still held too, so a socket its
/// screen has not let go of yet is not missed. A group opened again takes
/// back the socket it has, closing or not yet let go of, rather than
/// opening a second, which would send the same outbox beside it, a
/// reaction's on then perhaps arriving after its off.
actor GroupSockets {
  private struct Socket {
    let client: SyncClient
    /// The screens' holds on it, each let go of once.
    var holds: Set<UUID> = []
    /// Which closing is under way, the socket perhaps taken back and
    /// closed again meanwhile.
    var closing: UUID?
    var closed: Task<Void, Never>?
  }

  private var sockets: [String: Socket] = [:]

  /// The group's socket and a hold on it, kept open until `close` lets go
  /// of the hold: the one there is, taken back if it was closing, else a
  /// new one.
  func open(_ groupID: String, account: Account, database: any DatabaseWriter) async
    -> (client: SyncClient, hold: UUID)
  {
    let hold = UUID()
    var socket =
      sockets[groupID]
      ?? Socket(client: SyncClient(account: account, database: database, peer: .group(groupID)))
    let starting = socket.holds.isEmpty
    socket.holds.insert(hold)
    socket.closing = nil
    sockets[groupID] = socket
    if starting {
      await socket.client.start()
    }
    return (socket.client, hold)
  }

  /// Lets go of a hold; the last one let go of closes the socket once what
  /// it has to send is sent. A hold the background let go of already is
  /// nothing.
  func close(_ hold: UUID, of groupID: String) {
    guard var socket = sockets[groupID], socket.holds.remove(hold) != nil else { return }
    sockets[groupID] = socket
    if socket.holds.isEmpty {
      beginClosing(groupID)
    }
  }

  private func beginClosing(_ groupID: String) {
    guard var socket = sockets[groupID] else { return }
    let id = UUID()
    let client = socket.client
    socket.holds = []
    socket.closing = id
    socket.closed = Task {
      let sent = await client.closeOnceSent()
      guard self.sockets[groupID]?.closing == id else {
        // Taken back before it began closing: open as it was.
        if self.sockets[groupID]?.holds.isEmpty == false {
          await client.start()
        }
        return
      }
      await sent.value
      if self.sockets[groupID]?.closing == id {
        self.sockets[groupID] = nil
      }
    }
    sockets[groupID] = socket
  }

  /// Closes every one once sent, those held too, and waits until they all
  /// have, those left meanwhile too.
  func finishSending() async {
    for (groupID, socket) in sockets where socket.closing == nil {
      beginClosing(groupID)
    }
    while let next = sockets.values.first(where: { $0.closing != nil })?.closed {
      await next.value
    }
  }

  /// Closes those closing at once: the time the OS gave runs out.
  func stop() async {
    for socket in sockets.values where socket.closing != nil {
      await socket.client.stop()
    }
  }
}

/// The group a socket is for, and whether the app is in the foreground.
private struct SocketKey: Hashable {
  let groupID: String
  let active: Bool
}

/// Everyone in a group with their shifts, read again as the group's
/// values change.
struct GroupMembersRequest: FetchKeyRequest, Hashable {
  let groupID: String
  let from: Day
  let through: Day

  func fetch(_ db: Database) throws -> [GroupMember] {
    try GroupSync.members(of: groupID, from: from, through: through, in: db)
  }
}
