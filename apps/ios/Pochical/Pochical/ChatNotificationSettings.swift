import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import SwiftUINavigation

// The chats' notifications (spec/chat.md, Notifications; /design's
// ChatNotificationsPage): each group chat's switch, the one-to-one chats
// turned off, メンションはいつも通知, and whom the user has blocked.

/// 設定 › 通知 › チャット's value: オン while every group's chat notifies,
/// オフ while none does or notifications are not allowed, else how many do.
func chatNotificationsSummary(
  groups: [GroupRow], notifications: ChatNotificationState, allowed: Bool
) -> String {
  let heard = groups.count { !notifications.isMuted(groupThread, in: $0.id) }
  if !allowed || heard == 0 { return "オフ" }
  return heard == groups.count ? "オン" : "\(heard)グループ"
}

/// 設定 › 通知 › チャット.
struct ChatNotificationsPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @FetchAll(GroupRow.order(by: \.joinedAtMs)) private var groups
  @FetchAll private var members: [GroupMemberRow]
  @Fetch(ChatNotificationsRequest()) private var notifications = ChatNotificationState()
  @Fetch(BlocksRequest()) private var blocked: Set<String> = []
  @Environment(\.meID) private var meID
  /// The one-to-one chats turned off as the page opened: one turned on
  /// again stays, so it can be turned off again here.
  @State private var directOff: [ChatKey]?
  @State private var unblocking: Person?
  @State private var failed = false

  var body: some View {
    List {
      PermissionCard()

      Section {
        ForEach(groups) { group in
          ChatNotificationToggle(
            groupID: group.id, threadID: groupThread,
            muted: notifications.isMuted(groupThread, in: group.id), asks: true
          ) {
            Label {
              Text(group.name).lineLimit(1)
            } icon: {
              GroupMarkBadge(mark: group.mark, shelf: .group(group.id))
            }
          }
        }
      } header: {
        Text("全体チャット")
      } footer: {
        if notifications.mentionsWhenMuted {
          Text("オフにしても、自分へのメンションは通知されます。")
        }
      }
      .settingsRows()

      Section {
        ForEach(directOff ?? [], id: \.self) { chat in
          let group = groups.first { $0.id == chat.groupID }
          let other = meID.flatMap { otherIn(chat.threadID, me: $0) }
          ChatNotificationToggle(
            groupID: chat.groupID, threadID: chat.threadID,
            muted: notifications.isMuted(chat.threadID, in: chat.groupID), asks: true
          ) {
            let member = memberOf(other, in: chat.groupID)
            PersonLabel(
              name: member?.shownName ?? "メンバー", group: group?.name ?? "",
              photoID: member?.photoID ?? "", shelf: PhotoShelf(place: chat.groupID))
          }
        }
      } header: {
        Text("個人チャット")
      } footer: {
        Text("個人チャットの通知は、それぞれのチャットの右上のメニューでオフにできます。")
      }
      .settingsRows()

      Section("メンション") {
        MentionsToggle(on: notifications.mentionsWhenMuted)
      }
      .settingsRows()

      if !blocked.isEmpty {
        Section("ブロック中のメンバー") {
          ForEach(blockedPeople) { person in
            Button {
              unblocking = person
            } label: {
              LabeledContent {
                Text("解除").foregroundStyle(colors.accentDefault)
              } label: {
                PersonLabel(
                  name: person.name, group: person.group, photoID: person.photoID,
                  shelf: person.shelf)
              }
            }
            .buttonStyle(.plain)
          }
        }
        .settingsRows()
      }
    }
    .settingsList()
    .navigationTitle("チャット")
    .navigationBarTitleDisplayMode(.inline)
    .task { await Notifications.shared.readPermission() }
    .onAppear {
      if directOff == nil {
        directOff = notifications.muted.filter { $0.threadID != groupThread }
          .sorted { $0.threadID < $1.threadID }
      }
    }
    .alert(
      unblocking.map { "\($0.name)のブロックを解除しますか？" } ?? "",
      isPresented: Binding($unblocking),
      presenting: unblocking
    ) { person in
      Button("キャンセル", role: .cancel) {}
      Button("解除") { unblock(person) }
    } message: { _ in
      Text("メッセージがまた表示され、個人チャットも届くようになります。")
    }
    .alert("変更できませんでした", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("通信できる場所で、もう一度お試しください。")
    }
  }

  /// Someone blocked, as one of the user's groups knows them.
  struct Person: Identifiable, Hashable {
    let id: String
    let name: String
    let group: String
    /// Their photo in that group, for their face.
    let photoID: String
    let shelf: PhotoShelf?
  }

  private var blockedPeople: [Person] {
    blocked.sorted().map { id in
      let member = members.first { $0.userID == id }
      return Person(
        id: id, name: member?.shownName ?? "メンバー",
        group: member.flatMap { member in groups.first { $0.id == member.groupID }?.name } ?? "",
        photoID: member?.photoID ?? "", shelf: member.map { .group($0.groupID) })
    }
  }

  private func memberOf(_ userID: String?, in groupID: String) -> GroupMemberRow? {
    members.first { $0.groupID == groupID && $0.userID == userID }
  }

  private func unblock(_ person: Person) {
    Task {
      do {
        try await groupCalls.setBlocked(person.id, false)
      } catch {
        ReviewPrompt.troubled = true
        failed = true
      }
    }
  }
}

/// A chat's notifications, on or off.
struct ChatNotificationToggle<Content: View>: View {
  @Environment(\.groupCalls) private var groupCalls
  let groupID: String
  let threadID: String
  /// As the user's devices last heard.
  let muted: Bool
  /// Turning it on asks for the system's permission first, if not yet
  /// asked, as /design's チャット page does.
  var asks = false
  @ViewBuilder let label: () -> Content

  var body: some View {
    ServerToggle(on: !muted, label: label) { on in
      if on, asks {
        Notifications.shared.askOnce()
      }
    } send: { on in
      try await groupCalls.setChatMuted(threadID, in: groupID, muted: !on)
    }
  }
}

/// メンションはいつも通知, for the whole account.
private struct MentionsToggle: View {
  @Environment(\.groupCalls) private var groupCalls
  let on: Bool

  var body: some View {
    ServerToggle(on: on) {
      Text("メンションはいつも通知")
      Text("通知をオフにしたチャットでも")
    } send: { on in
      try await groupCalls.setMentionsWhenMuted(on)
    }
  }
}

/// A switch the server keeps: what the user turned shows at once, and
/// goes back if the server could not keep it.
private struct ServerToggle<Content: View>: View {
  /// As the user's devices last heard.
  let on: Bool
  @ViewBuilder let label: () -> Content
  /// Done as it is turned, before the server is told.
  var turning: (Bool) -> Void = { _ in }
  let send: (Bool) async throws -> Void
  /// On or off as turned, until the server has said so.
  @State private var turned: Bool?
  @State private var failed = false

  var body: some View {
    Toggle(isOn: Binding(get: { turned ?? on }, set: turn)) {
      label()
    }
    .onChange(of: on) { turned = nil }
    .alert("変更できませんでした", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("通信できる場所で、もう一度お試しください。")
    }
  }

  private func turn(_ value: Bool) {
    turned = value
    turning(value)
    Task {
      do {
        try await send(value)
      } catch {
        turned = nil
        ReviewPrompt.troubled = true
        failed = true
      }
    }
  }
}

/// A member's face and name, and the group they are in.
private struct PersonLabel: View {
  let name: String
  let group: String
  let photoID: String
  let shelf: PhotoShelf?

  var body: some View {
    Label {
      Text(name).lineLimit(1)
      if !group.isEmpty {
        Text(group).lineLimit(1)
      }
    } icon: {
      MemberAvatar(name: name, photoID: photoID, shelf: shelf, size: 28)
    }
  }
}

/// Over the notification settings while Pochical may not notify
/// (/design's PermissionCard): a way to be asked, or to the system's
/// settings once refused.
struct PermissionCard: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.openURL) private var openURL

  var body: some View {
    let permission = Notifications.shared.permission
    if permission != .allowed {
      let denied = permission == .denied
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: denied ? "bell.slash" : "bell")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(colors.accentDefault)
          .frame(width: 40, height: 40)
          .background(colors.accentContainer, in: Circle())
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 4) {
          Text(denied ? "通知がオフになっています" : "通知はまだオフです")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(colors.textPrimary)
          Text(
            denied
              ? "スマホの設定で、ポチカルの通知をオンにしてください。"
              : "オンにすると、リマインドとチャットのメッセージが届きます。"
          )
          .font(.footnote)
          .foregroundStyle(colors.textTertiary)
          Button {
            if denied {
              if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                openURL(url)
              }
            } else {
              Notifications.shared.askOnce()
            }
          } label: {
            Text(denied ? "設定を開く" : "通知をオンにする").frame(maxWidth: .infinity)
          }
          .mainButton(.regular)
          .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(16)
      .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.xxl))
      .settingsOnPage()
    }
  }
}
