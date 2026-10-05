import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

extension EnvironmentValues {
  /// The signed-in user, whom the calls and sockets go as.
  @Entry var account = Account()
  /// The server's GroupService, as the signed-in user.
  @Entry var groupCalls = GroupCalls(account: Account())
}

/// The グループ tab (/design's DesignGroup): with no group yet, what groups
/// are for and a way to start one; else the groups down the side, as
/// /design's rail, and the one open beside them.
struct GroupsScreen: View {
  @FetchAll(GroupRow.order(by: \.joinedAtMs)) private var groups
  /// The group open beside the rail, the first until one is picked.
  @Binding var openID: String?
  @State private var path: [GroupRoute] = []

  var body: some View {
    NavigationStack(path: $path) {
      Group {
        if let open = groups.first(where: { $0.id == openID }) ?? groups.first {
          HStack(alignment: .top, spacing: 0) {
            GroupRail(groups: groups, openID: open.id) { openID = $0 } onNew: {
              path.append(.newGroup)
            }
            GroupHub(group: open) {
              path.append(.invite(open))
            } onShifts: { day in
              path.append(.shifts(open, day: day))
            }
            .padding(.horizontal, 16)
          }
        } else {
          NoGroups { path.append(.newGroup) }
            .padding(.horizontal, 20)
        }
      }
      .toolbarVisibility(.hidden, for: .navigationBar)
      .navigationDestination(for: GroupRoute.self) { route in
        switch route {
        case .newGroup:
          NewGroupPage { made in
            openID = made
            path.removeAll()
          }
        case .invite(let group):
          InvitePage(group: group)
        case .shifts(let group, let day):
          GroupShiftsPage(group: group, day: day)
        }
      }
    }
  }
}

enum GroupRoute: Hashable {
  case newGroup
  case invite(GroupRow)
  /// Everyone's shifts by the month, on a day when one is given.
  case shifts(GroupRow, day: Day?)
}

/// No group yet: what sharing shifts is for, then 作成 (/design's
/// NoGroups). The sample of a shared week comes with the group's table of
/// shifts, and 参加 with joining.
private struct NoGroups: View {
  @Environment(\.themeColors) private var colors
  let onNew: () -> Void

  var body: some View {
    VStack(spacing: 20) {
      Text("グループでシフトを共有できます")
        .font(.title2.bold())
        .multilineTextAlignment(.center)
      Text("家族や友達とシフトを見せ合って、休みが重なる日がすぐ分かります。")
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
    }
    .frame(maxHeight: .infinity)
  }
}

/// The groups down the left edge, as the messaging apps' server rails: a
/// mark each, the open one ringed and flagged at the edge, then the way to
/// start one (/design's GroupRail).
private struct GroupRail: View {
  @Environment(\.themeColors) private var colors
  let groups: [GroupRow]
  let openID: String
  let onOpen: (String) -> Void
  let onNew: () -> Void

  var body: some View {
    ScrollView {
      VStack(spacing: 12) {
        ForEach(groups) { group in
          let isOpen = group.id == openID
          Button {
            onOpen(group.id)
          } label: {
            GroupMark(emoji: group.emoji, isOpen: isOpen)
              .frame(width: 58, height: 46)
              .overlay(alignment: .leading) {
                // The flag at the edge, by the open group.
                UnevenRoundedRectangle(bottomTrailingRadius: Radius.xs, topTrailingRadius: Radius.xs)
                  .fill(colors.accentDefault)
                  .frame(width: 4, height: isOpen ? 30 : 0)
              }
              .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(group.name)
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
          .frame(width: 42, height: 42)
          .background(colors.backgroundCard, in: Circle())
          .buttonStyle(.plain)
      }
      .padding(.vertical, 12)
      .animation(.easeOut(duration: 0.15), value: openID)
    }
    .scrollIndicators(.hidden)
    .frame(width: 58)
    .background(
      colors.fillQuaternary,
      in: UnevenRoundedRectangle(topTrailingRadius: Radius.xl)
    )
    .ignoresSafeArea(edges: .bottom)
  }
}

/// A group's mark on its rounded square: on the card's ground, and when
/// open on the accent's with a ring round it, the corners drawn in.
private struct GroupMark: View {
  @Environment(\.themeColors) private var colors
  let emoji: String
  let isOpen: Bool

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: isOpen ? Radius.md : Radius.lg)
    Text(emoji)
      .font(.system(size: 22))
      .frame(width: 42, height: 42)
      .background(isOpen ? colors.accentContainer : colors.backgroundCard, in: shape)
      .overlay {
        if isOpen {
          shape.strokeBorder(colors.accentDefault, lineWidth: 2)
            .overlay(shape.inset(by: 2).strokeBorder(colors.backgroundCard, lineWidth: 2))
        }
      }
  }
}

/// The open group: its mark and name, 招待, and this week of everyone's
/// shifts (/design's GroupHub); the chats come as they are built. The
/// group's socket is open while it is on screen and the app in the
/// foreground (spec/sync-protocol.md, Sockets).
private struct GroupHub: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.account) private var account
  @Environment(\.scenePhase) private var scenePhase
  @Dependency(\.defaultDatabase) private var database
  @Environment(Settings.self) private var settings
  @Fetch private var members: [GroupMember] = []
  let group: GroupRow
  let onInvite: () -> Void
  /// Opens everyone's shifts by the month, on a day when one is given.
  let onShifts: (Day?) -> Void

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
              .font(.subheadline)
              .foregroundStyle(colors.accentDefault)
            }
            .buttonStyle(.plain)
          }
          MemberWeek(members: members, onOpen: onShifts)
        }
      }
      .padding(.bottom, 24)
    }
    .scrollIndicators(.hidden)
    .task(id: request) {
      try? await $members.load(request)
    }
    .task(id: SocketKey(groupID: group.id, active: scenePhase == .active)) {
      guard scenePhase == .active else { return }
      let socket = SyncClient(account: account, database: database, peer: .group(group.id))
      await socket.start()
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(3600))
      }
      await socket.stop()
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
      Text(group.emoji)
        .font(.system(size: 16))
        .frame(width: 26, height: 26)
        .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.sm))
        .accessibilityHidden(true)
      Text(group.name)
        .font(.title2.bold())
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
      Button("メンバーを招待", systemImage: "person.badge.plus", action: onInvite)
        .labelStyle(.iconOnly)
        .buttonStyle(BarButton())
        .foregroundStyle(colors.textPrimary)
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
