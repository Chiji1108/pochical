import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

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
  @Environment(\.groupCalls) private var groupCalls
  @FetchAll(GroupRow.order(by: \.joinedAtMs)) private var groups
  @FetchAll private var members: [GroupMemberRow]
  @Fetch(ChatNotificationsRequest()) private var notifications = ChatNotificationState()
  @Fetch(BlocksRequest()) private var blocked: Set<String> = []
  @State private var meID: String?
  /// The one-to-one chats turned off as the page opened: one turned on
  /// again stays, so it can be turned off again here.
  @State private var directOff: [[String]]?
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
              GroupEmoji(emoji: group.emoji)
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
          let group = groups.first { $0.id == chat[0] }
          let other = meID.flatMap { otherIn(chat[1], me: $0) }
          ChatNotificationToggle(
            groupID: chat[0], threadID: chat[1],
            muted: notifications.isMuted(chat[1], in: chat[0]), asks: true
          ) {
            let member = memberOf(other, in: chat[0])
            PersonLabel(
              name: member?.shownName ?? "メンバー", group: group?.name ?? "",
              photoID: member?.photoID ?? "", groupID: chat[0])
          }
        }
      } header: {
        if directOff?.isEmpty == false {
          Text("個人チャット")
        }
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
                Text("解除").foregroundStyle(.tint)
              } label: {
                PersonLabel(
                  name: person.name, group: person.group, photoID: person.photoID,
                  groupID: person.groupID)
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
    .task {
      meID = await groupCalls.userID()
      await Notifications.shared.readPermission()
    }
    .onAppear {
      if directOff == nil {
        directOff = notifications.muted.filter { $0[1] != groupThread }.sorted { $0[1] < $1[1] }
      }
    }
    .alert(
      unblocking.map { "\($0.name)のブロックを解除しますか？" } ?? "",
      isPresented: Binding(get: { unblocking != nil }, set: { if !$0 { unblocking = nil } }),
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
    let groupID: String
  }

  private var blockedPeople: [Person] {
    blocked.sorted().map { id in
      let member = members.first { $0.userID == id }
      return Person(
        id: id, name: member?.shownName ?? "メンバー",
        group: member.flatMap { member in groups.first { $0.id == member.groupID }?.name } ?? "",
        photoID: member?.photoID ?? "", groupID: member?.groupID ?? "")
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

/// A chat's notifications, on or off: what the user turned shows at once,
/// and goes back if the server could not keep it.
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
  /// On or off as turned, until the server has said so.
  @State private var turned: Bool?
  @State private var failed = false

  var body: some View {
    Toggle(isOn: Binding(get: { turned ?? !muted }, set: turn)) {
      label()
    }
    .onChange(of: muted) { turned = nil }
    .alert("変更できませんでした", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("通信できる場所で、もう一度お試しください。")
    }
  }

  private func turn(_ on: Bool) {
    turned = on
    if on, asks {
      Notifications.shared.askOnce()
    }
    Task {
      do {
        try await groupCalls.setChatMuted(threadID, in: groupID, muted: !on)
      } catch {
        turned = nil
        ReviewPrompt.troubled = true
        failed = true
      }
    }
  }
}

/// メンションはいつも通知, for the whole account.
private struct MentionsToggle: View {
  @Environment(\.groupCalls) private var groupCalls
  let on: Bool
  @State private var turned: Bool?
  @State private var failed = false

  var body: some View {
    Toggle(isOn: Binding(get: { turned ?? on }, set: turn)) {
      Text("メンションはいつも通知")
      Text("通知をオフにしたチャットでも")
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
    Task {
      do {
        try await groupCalls.setMentionsWhenMuted(value)
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
  let groupID: String

  var body: some View {
    Label {
      Text(name).lineLimit(1)
      if !group.isEmpty {
        Text(group).lineLimit(1)
      }
    } icon: {
      MemberAvatar(name: name, photoID: photoID, groupID: groupID, size: 28)
    }
  }
}

/// A group's mark on its small rounded square, as 設定's rows show it.
struct GroupEmoji: View {
  @Environment(\.themeColors) private var colors
  let emoji: String

  var body: some View {
    Text(emoji)
      .font(.system(size: 16))
      .frame(width: 28, height: 28)
      .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.sm))
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
          .foregroundStyle(colors.accentOnFill)
          .frame(width: 40, height: 40)
          .background(colors.accentFill, in: Circle())
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 4) {
          Text(denied ? "通知がオフになっています" : "通知はまだオフです")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(colors.textPrimary)
          Text(
            denied
              ? "スマホの設定で、ポチカルの通知をオンにしてください。"
              : "オンにすると、チャットのメッセージが届きます。"
          )
          .font(.footnote)
          .foregroundStyle(colors.textSecondary)
          Button(denied ? "設定を開く" : "通知をオンにする") {
            if denied {
              if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                openURL(url)
              }
            } else {
              Notifications.shared.askOnce()
            }
          }
          .buttonStyle(.bordered)
          .controlSize(.small)
          .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(16)
      .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.lg))
      .settingsOnPage()
    }
  }
}
