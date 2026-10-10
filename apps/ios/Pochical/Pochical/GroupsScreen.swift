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
  /// Opens one of Pochical's invitations on its join screen, as reading
  /// its link does.
  @Entry var openInvite = OpenInviteAction { _ in }
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
        } else {
          NoGroups(onNew: { path.append(.newGroup) }, onScan: onScan)
            .padding(.horizontal, 20)
        }
      }
      // The app's ground, as the calendar's, which dark mode lifts off black.
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(colors.backgroundBase)
      .toolbarVisibility(.hidden, for: .navigationBar)
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
        case .chat(let group, let thread, let other):
          ChatScreen(group: live(group), threadID: thread, otherID: other)
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
    .task(id: SocketKey(groupID: openGroupID ?? "", active: scenePhase == .active)) {
      guard scenePhase == .active, let groupID = openGroupID else { return }
      let client = SyncClient(account: account, database: database, peer: .group(groupID))
      socket = client
      await client.start()
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(3600))
      }
      await client.stop()
    }
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

enum GroupRoute: Hashable {
  case newGroup
  case invite(GroupRow)
  /// Everyone's shifts by the month, on a day when one is given.
  case shifts(GroupRow, day: Day?)
  case settings(GroupRow)
  /// One of the group's chats: 全体チャット, or a one-to-one chat with the
  /// member `with`.
  case chat(GroupRow, thread: String, with: String?)
}

/// No group yet: a sample of a shared week and what sharing shifts is for,
/// then 作成 and QR参加 (/design's NoGroups).
private struct NoGroups: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  let onNew: () -> Void
  let onScan: () -> Void

  var body: some View {
    VStack(spacing: 20) {
      Text("グループでシフトを共有できます")
        .font(.title2.bold())
        .multilineTextAlignment(.center)
      VStack(spacing: 4) {
        GroupWeekdays(compact: true)
        GroupWeek(days: week, members: sampleMembers(week), compact: true)
      }
      .padding(EdgeInsets(top: 8, leading: 4, bottom: 12, trailing: 8))
      .background(colors.backgroundBase, in: RoundedRectangle(cornerRadius: Radius.xxl))
      .overlay(RoundedRectangle(cornerRadius: Radius.xxl).strokeBorder(colors.separator))
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("サンプルの共有シフト表")
      Text("家族や友達とシフトを見せ合って、\n休みが重なる日がすぐ分かります。")
        .font(.subheadline)
        .foregroundStyle(colors.textTertiary)
        .multilineTextAlignment(.center)
        .lineSpacing(4)
      Button(action: onNew) {
        Label("グループを作成", systemImage: "plus")
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
    .frame(maxHeight: .infinity)
  }

  private var week: [Day] { thisWeek(start: settings.device.week.start) }
}

/// The sample's people, as /design's: a partner at the office, home on
/// Wednesdays; a mother part-time on Mondays, Wednesdays and Fridays, both
/// off on weekends and holidays; a nurse whose week, the same every week,
/// has Saturday off too, so everyone is off one day.
private func sampleMembers(_ week: [Day]) -> [GroupMember] {
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
  let days = { (shift: (Day) -> PatternID) in
    Dictionary(uniqueKeysWithValues: week.map { ($0, shift($0)) })
  }
  return [
    sampleMember(
      "yuki", "ゆうき", face: 1005,
      MemberCalendar(
        patterns: [office, home, off],
        days: days { rests($0) ? off.id : $0.weekday == 3 ? home.id : office.id })),
    sampleMember(
      "mother", "お母さん", face: 429,
      MemberCalendar(
        patterns: [part, off],
        days: days { [1, 3, 5].contains($0.weekday) && $0.holidayName == nil ? part.id : off.id })),
    sampleMember(
      "misaki", "みさき", face: 823,
      MemberCalendar(patterns: nurse, days: days { nurseWeek[$0.weekday] })),
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
    // The last of many groups can rise clear of the fade.
    .contentMargins(.bottom, barTop + Self.fade, for: .scrollContent)
    .frame(width: 60)
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
  @Environment(Settings.self) private var settings
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
        heading
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
    .task(id: request) {
      _ = try? await $members.load(request)
    }
  }

  /// The group's members with their days of this week and as far ahead
  /// as 次のみんな休み looks.
  private var request: GroupMembersRequest {
    let week = thisWeek(start: settings.device.week.start)
    let ahead = Day.today.adding(days: nextTogetherDays - 1)
    return GroupMembersRequest(groupID: group.id, from: week[0], through: max(week[6], ahead))
  }

  private var heading: some View {
    HStack(spacing: 8) {
      GroupMarkView(mark: group.mark, size: 26, shelf: group.id)
        .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.sm))
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
        .accessibilityHidden(true)
      Text(group.name)
        .font(.title2.bold())
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
      // Both on one piece of glass, as a bar's buttons together.
      HStack(spacing: 0) {
        Button(action: onInvite) {
          Image(systemName: "person.badge.plus").frame(width: 44, height: 44)
        }
        .accessibilityLabel("メンバーを招待")
        Button(action: onSettings) {
          Image(systemName: "slider.horizontal.3").frame(width: 44, height: 44)
        }
        .accessibilityLabel("グループの設定")
      }
      .buttonStyle(.plain)
      .foregroundStyle(colors.textPrimary)
      .padding(.horizontal, 4)
      .glassEffect(.regular.interactive(), in: .capsule)
    }
    .padding(.top, 4)
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
