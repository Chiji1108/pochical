import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

extension EnvironmentValues {
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
            GroupHub(group: open) { path.append(.invite(open)) }
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
        }
      }
    }
  }
}

enum GroupRoute: Hashable {
  case newGroup
  case invite(GroupRow)
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

/// The open group: its mark and name, and 招待 (/design's GroupHub). This
/// week of everyone's shifts and the chats come as they are built.
private struct GroupHub: View {
  @Environment(\.themeColors) private var colors
  let group: GroupRow
  let onInvite: () -> Void

  var body: some View {
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
    .frame(maxHeight: .infinity, alignment: .top)
  }
}
