import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// グループの設定 (/design's GroupSettingsPage): the group's name and mark,
/// how the person appears in it, its chat's 通知, who is in it with a way
/// to invite more, and leaving.
struct GroupSettingsPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Fetch private var members: [GroupMember] = []
  @Fetch(ChatNotificationsRequest()) private var notifications = ChatNotificationState()
  let group: GroupRow
  let onInvite: () -> Void
  /// Called once the person has left the group.
  let onLeft: () -> Void
  @State private var meID: String?
  @State private var confirmingLeave = false
  @State private var leaving = false
  @State private var failed: String?

  var body: some View {
    let me = members.first { $0.userID == meID }
    List {
      Section {
        NavigationLink {
          GroupEditPage(group: group)
        } label: {
          LabeledContent {
            Text("編集")
          } label: {
            Label {
              Text(group.name).lineLimit(1)
            } icon: {
              GroupMarkBadge(mark: group.mark, shelf: group.id)
            }
          }
        }
      } header: {
        Text("グループ")
      } footer: {
        Text("グループ名とアイコンは、メンバー全員に表示されます。")
      }
      .settingsRows()

      // /design's GroupProfileRow: the name, and whether it is the usual one.
      Section("このグループでのあなた") {
        NavigationLink {
          if let me {
            DisplayNamePage(group: group, meID: me.userID, name: me.ownName ? me.name : "")
          }
        } label: {
          LabeledContent {
            Text(me?.ownName == true || me?.ownPhoto == true ? "このグループだけ" : "いつもと同じ")
          } label: {
            Label {
              Text(me?.name ?? "").lineLimit(1)
            } icon: {
              MemberAvatar(
                name: me?.name ?? "", photoID: me?.photoID ?? "", groupID: group.id, size: 28,
                me: true)
            }
          }
        }
        .disabled(me == nil)
      }
      .settingsRows()

      // The same switch as this group's on 設定 › 通知 › チャット.
      Section {
        ChatNotificationToggle(
          groupID: group.id, threadID: groupThread,
          muted: notifications.isMuted(groupThread, in: group.id)
        ) {
          Text("全体チャットの通知")
        }
      } header: {
        Text("通知")
      } footer: {
        if notifications.mentionsWhenMuted {
          Text("オフにしても、自分へのメンションは通知されます。")
        }
      }
      .settingsRows()

      Section("メンバー") {
        ForEach(members) { member in
          Label {
            Text(member.userID == meID ? "\(member.name)（自分）" : member.name).lineLimit(1)
          } icon: {
            MemberAvatar(
              name: member.name, photoID: member.photoID, groupID: group.id, size: 28,
              userID: member.userID)
          }
        }
        Button(action: onInvite) {
          Label("メンバーを招待", systemImage: "person.badge.plus")
            .foregroundStyle(colors.accentDefault)
        }
      }
      .settingsRows()

      Section {
        Button(role: .destructive) {
          confirmingLeave = true
        } label: {
          HStack {
            Spacer()
            if leaving {
              ProgressView()
            } else {
              Text("このグループから抜ける")
            }
            Spacer()
          }
        }
        .disabled(leaving)
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("グループの設定")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.visible, for: .navigationBar)
    .task {
      let today = Day.today
      _ = try? await $members.load(GroupMembersRequest(groupID: group.id, from: today, through: today))
    }
    .task { meID = await groupCalls.userID() }
    .alert("グループから抜けますか？", isPresented: $confirmingLeave) {
      Button("抜ける", role: .destructive) { leave() }
      Button("キャンセル", role: .cancel) {}
    } message: {
      Text("「\(group.name)」のシフトとチャットが見られなくなります。もう一度入るには、招待してもらう必要があります。")
    }
    .alert(
      failed ?? "", isPresented: Binding { failed != nil } set: { if !$0 { failed = nil } }
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("通信できる場所で、もう一度お試しください。")
    }
  }

  private func leave() {
    leaving = true
    Task {
      defer { leaving = false }
      do {
        try await groupCalls.leave(group.id)
        onLeft()
      } catch {
        failed = "グループから抜けられませんでした"
      }
    }
  }
}

/// グループを編集 (/design's GroupEditPage): its name and mark, which
/// everyone in it sees, kept as a draft until 保存.
private struct GroupEditPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.dismiss) private var dismiss
  let group: GroupRow
  @State private var name = ""
  @State private var mark = GroupMarkValue()
  @State private var saving = false
  @State private var failed = false

  var body: some View {
    let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let canSave =
      !trimmedName.isEmpty && name.count <= TextLimits.groupName
      && (trimmedName != group.name || mark != group.mark)
    List {
      Section {
        LabeledContent("グループ名") {
          LimitedTextField(placeholder: "例：家族", text: $name, limit: TextLimits.groupName)
        }
        NavigationLink {
          GroupMarkPage(name: name, mark: mark, shelf: group.id) { mark = $0 }
        } label: {
          LabeledContent("アイコン") {
            GroupMarkBadge(mark: mark, shelf: group.id)
          }
        }
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("グループを編集")
    .navigationBarTitleDisplayMode(.inline)
    .onAppear {
      if name.isEmpty {
        name = group.name
        mark = group.mark
      }
    }
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        if saving {
          ProgressView()
        } else {
          Button("保存", role: .confirm) { save(name: trimmedName) }
            .disabled(!canSave)
        }
      }
    }
    .alert("保存できませんでした", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("通信できる場所で、もう一度お試しください。")
    }
  }

  private func save(name: String) {
    saving = true
    Task {
      defer { saving = false }
      do {
        // A newly picked photo goes up first, for the group to take.
        if !mark.photoID.isEmpty, mark.photoID != group.photoID {
          try await groupCalls.sendMarkPhoto(mark.photoID)
        }
        try await groupCalls.rename(group.id, name: name, mark: mark)
        dismiss()
      } catch {
        ReviewPrompt.troubled = true
        failed = true
      }
    }
  }
}

/// How the person is called in the group, which its members see
/// (/design's GroupProfilePage): a name of its own, or, left empty, their
/// usual one, which it then follows (spec/sync-protocol.md, Profile).
private struct DisplayNamePage: View {
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.dismiss) private var dismiss
  @Fetch(ProfileNameRequest()) private var usualName = ""
  @Fetch private var members: [GroupMember] = []
  let group: GroupRow
  let meID: String
  @State var name: String
  @State private var saving = false
  @State private var failed = false

  var body: some View {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    // As the group shows them, read again as it changes.
    let me = members.first { $0.userID == meID }
    List {
      // The photo changes at once, as /design's does; the name on 保存.
      Section {
        PhotoEditor(
          name: me?.name ?? "", photoID: me?.photoID ?? "", groupID: group.id,
          onPhoto: { jpeg in
            await change {
              let photoID = try await groupCalls.sendPhoto(jpeg, to: group.id)
              try await groupCalls.setGroupPhoto(usual: false, photoID: photoID, in: group.id)
            }
          },
          // Back to the usual photo, once the group has one of its own.
          onUsual: me?.ownPhoto == true
            ? { await change { try await groupCalls.setGroupPhoto(usual: true, in: group.id) } }
            : nil,
          onRemove: {
            await change { try await groupCalls.setGroupPhoto(usual: false, in: group.id) }
          })
        .settingsOnPage()
      }
      Section {
        LabeledContent("名前") {
          LimitedTextField(
            placeholder: usualName.isEmpty ? "例：さくら" : usualName, text: $name,
            limit: TextLimits.personName)
        }
      } footer: {
        Text(
          usualName.isEmpty
            ? "「\(group.name)」の人にだけ、この名前と写真で表示されます。"
            : "「\(group.name)」の人にだけ、この名前と写真で表示されます。名前が空欄なら「\(usualName)」、写真を入れなければいつもの写真のままです。")
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("このグループでのあなた")
    .task {
      let today = Day.today
      _ = try? await $members.load(GroupMembersRequest(groupID: group.id, from: today, through: today))
    }
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        if saving {
          ProgressView()
        } else {
          // Empty goes back to the usual name, when there is one.
          Button("保存", role: .confirm) { save(trimmed) }
            .disabled(
              (trimmed.isEmpty && usualName.isEmpty) || name.count > TextLimits.personName)
        }
      }
    }
    .alert("保存できませんでした", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("通信できる場所で、もう一度お試しください。")
    }
  }

  /// A change of the photo, which says so if it could not be made.
  private func change(_ making: () async throws -> Void) async {
    do {
      try await making()
    } catch {
      ReviewPrompt.troubled = true
      failed = true
    }
  }

  private func save(_ name: String) {
    saving = true
    Task {
      defer { saving = false }
      do {
        try await groupCalls.setDisplayName(name, in: group.id)
        dismiss()
      } catch {
        ReviewPrompt.troubled = true
        failed = true
      }
    }
  }
}
