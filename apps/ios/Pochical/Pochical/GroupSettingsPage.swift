import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// グループの設定 (/design's GroupSettingsPage): the group's name and mark,
/// how the person appears in it, who is in it with a way to invite more,
/// and leaving. The chats' 通知 comes with the chats.
struct GroupSettingsPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Fetch private var members: [GroupMember] = []
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
              Text(group.emoji)
                .font(.system(size: 16))
                .frame(width: 28, height: 28)
                .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.sm))
            }
          }
        }
      } header: {
        Text("グループ")
      } footer: {
        Text("グループ名とアイコンは、メンバー全員に表示されます。")
      }
      .settingsRows()

      Section("このグループでのあなた") {
        NavigationLink {
          DisplayNamePage(group: group, name: me?.name ?? "")
        } label: {
          LabeledContent("名前", value: me?.name ?? "")
        }
        .disabled(me == nil)
      }
      .settingsRows()

      Section("メンバー") {
        ForEach(members) { member in
          Label {
            Text(member.userID == meID ? "\(member.name)（自分）" : member.name).lineLimit(1)
          } icon: {
            LetterAvatar(name: member.name, size: 28)
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
      try? await $members.load(GroupMembersRequest(groupID: group.id, from: today, through: today))
    }
    .task { meID = try? await groupCalls.userID() }
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
  @State private var emoji = ""
  @State private var saving = false
  @State private var failed = false

  var body: some View {
    let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let canSave =
      !trimmedName.isEmpty && name.count <= TextLimits.groupName
      && (trimmedName != group.name || emoji != group.emoji)
    List {
      Section {
        LabeledContent("グループ名") {
          LimitedTextField(placeholder: "例：家族", text: $name, limit: TextLimits.groupName)
        }
        NavigationLink {
          EmojiPage(emoji: emoji) { emoji = $0 }
        } label: {
          LabeledContent("アイコン") {
            Text(emoji)
              .font(.system(size: 16))
              .frame(width: 28, height: 28)
              .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.sm))
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
        emoji = group.emoji
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
        try await groupCalls.rename(group.id, name: name, emoji: emoji)
        dismiss()
      } catch {
        failed = true
      }
    }
  }
}

/// How the person is called in the group, which its members see.
private struct DisplayNamePage: View {
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.dismiss) private var dismiss
  let group: GroupRow
  @State var name: String
  @State private var saving = false
  @State private var failed = false

  var body: some View {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    List {
      Section {
        LabeledContent("名前") {
          LimitedTextField(placeholder: "例：さくら", text: $name, limit: TextLimits.personName)
        }
      } footer: {
        Text("「\(group.name)」のメンバーに、この名前で表示されます。")
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("このグループでのあなた")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        if saving {
          ProgressView()
        } else {
          Button("保存", role: .confirm) { save(trimmed) }
            .disabled(trimmed.isEmpty || name.count > TextLimits.personName)
        }
      }
    }
    .alert("保存できませんでした", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("通信できる場所で、もう一度お試しください。")
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
        failed = true
      }
    }
  }
}
