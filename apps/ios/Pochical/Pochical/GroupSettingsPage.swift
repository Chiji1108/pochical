import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import SwiftUINavigation

/// グループの設定 (/design's GroupSettingsPage): the group's name and mark,
/// how the person appears in it, its chat's 通知, who is in it with a way
/// to invite more, and leaving.
struct GroupSettingsPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.rootNavigator) private var navigator
  @Environment(\.say) private var say
  @Fetch private var members: [GroupMember] = []
  @Fetch(BlocksRequest()) private var blocked: Set<String> = []
  @Fetch(ChatNotificationsRequest()) private var notifications = ChatNotificationState()
  let group: GroupRow
  let onInvite: () -> Void
  /// Called once the person has left the group.
  let onLeft: () -> Void
  @Environment(\.meID) private var meID
  @State private var confirmingLeave = false
  @State private var leaving = false
  @State private var failed: String?
  /// A member's profile, opened from their row (/design's member sheet).
  @State private var profileOf: ProfileOf?
  @State private var reporting: ReportTarget?
  @State private var blockQuestion: BlockQuestion?

  var body: some View {
    let me = members.first { $0.userID == meID }
    List {
      Section {
        PageLink {
          GroupEditPage(group: group)
        } label: {
          LabeledContent {
            Text("編集")
          } label: {
            Label {
              Text(group.name).lineLimit(1)
            } icon: {
              GroupMarkBadge(mark: group.mark, shelf: .group(group.id))
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
        PageLink {
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
                name: me?.name ?? "", photoID: me?.photoID ?? "", shelf: .group(group.id), size: 28,
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
          let label = Label {
            Text(member.userID == meID ? "\(member.name)（自分）" : member.name).lineLimit(1)
          } icon: {
            MemberAvatar(
              name: member.name, photoID: member.photoID, shelf: .group(group.id), size: 28,
              userID: member.userID)
          }
          // Someone else opens their profile: メッセージを送る, their photo
          // large, and このグループから外す.
          if member.userID == meID {
            label
          } else {
            Button {
              profileOf = ProfileOf(id: member.userID, name: member.name, photoID: member.photoID)
            } label: {
              label.foregroundStyle(colors.textPrimary)
            }
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
    .task {
      let today = Day.today
      _ = try? await $members.load(GroupMembersRequest(groupID: group.id, from: today, through: today))
    }
    .environment(\.photoShelf, .group(group.id))
    .modifier(
      ReportAndBlock(
        groupID: group.id, groupName: group.name, groupMark: group.mark, blocked: blocked,
        reporting: $reporting, profileOf: $profileOf, blockQuestion: $blockQuestion,
        onMessage: { person in
          guard let meID else { return nil }
          return {
            navigator?.open(
              .group(.chat(group, thread: directThread(meID, person.id), with: person.id)))
          }
        },
        onReported: { target in
          if let question = blockAfterReport(target, blocked: blocked) {
            blockQuestion = question
          } else {
            say("通報しました")
          }
        },
        onSetBlocked: { answer($0, calls: groupCalls, say: say) },
        onRemove: remove))
    .alert("グループから抜けますか？", isPresented: $confirmingLeave) {
      Button("抜ける", role: .destructive) { leave() }
      Button("キャンセル", role: .cancel) {}
    } message: {
      Text("「\(group.name)」のシフトとチャットが見られなくなります。もう一度入るには、招待してもらう必要があります。")
    }
    .alert(failed ?? "", isPresented: Binding($failed), presenting: failed) { _ in
      Button("OK", role: .cancel) {}
    } message: { _ in
      Text("通信できる場所で、もう一度お試しください。")
    }
  }

  /// Takes someone out of the group, and says so.
  private func remove(_ person: ProfileOf) {
    Task {
      do {
        try await groupCalls.remove(person.id, from: group.id)
        say("\(person.name)を外しました")
      } catch {
        failed = "\(person.name)を外せませんでした"
      }
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
  @FetchAll private var groups: [GroupRow]
  @State private var name = ""
  @State private var mark = GroupMarkValue()
  @State private var saving = false
  @State private var failed = false
  @State private var photoGone = false

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
        PageLink {
          GroupMarkPage(
            name: name, mark: $mark,
            freeColor: nextGroupColor(groups.filter { $0.id != group.id }, slots: colors.marks.count),
            shelf: .group(group.id))
        } label: {
          LabeledContent("アイコン") {
            GroupMarkBadge(mark: mark, shelf: .group(group.id))
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
    .alert(markPhotoGoneTitle, isPresented: $photoGone) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(markPhotoGoneMessage)
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
      } catch is MarkPhotoGone {
        mark = group.mark
        photoGone = true
      } catch {
        ReviewPrompt.troubled = true
        failed = true
      }
    }
  }
}

/// How the person is called in the group, which its members see
/// (/design's GroupProfilePage): a name of its own, or, left empty, their
/// usual one, which it then follows (spec/sync-protocol.md, Profile). Both
/// are kept as プロフィール's are: the photo as it is picked, the name as
/// the field is left (or the page, or the app). Neither tells the group's
/// chat.
private struct DisplayNamePage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.scenePhase) private var scenePhase
  @Fetch(ProfileNameRequest()) private var usualName = ""
  @Fetch private var members: [GroupMember] = []
  let group: GroupRow
  let meID: String
  @State var name: String
  /// The name the group keeps of its own, empty for the usual one; what
  /// is typed is saved when it differs.
  @State private var saved: String
  @State private var nameFailed = false
  @State private var failed = false

  init(group: GroupRow, meID: String, name: String) {
    self.group = group
    self.meID = meID
    _name = State(initialValue: name)
    _saved = State(initialValue: name)
  }

  var body: some View {
    // As the group shows them, read again as it changes.
    let me = members.first { $0.userID == meID }
    List {
      Section {
        PhotoEditor(
          name: me?.name ?? "", photoID: me?.photoID ?? "", shelf: .group(group.id),
          onPhoto: { jpeg in
            await change {
              let photoID = try await groupCalls.sendPhoto(jpeg, to: .group(group.id))
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
            limit: TextLimits.personName, onEndEditing: saveName)
        }
      } footer: {
        if nameFailed {
          Text("保存できませんでした。通信できるときに、もう一度お試しください。")
            .foregroundStyle(colors.dangerDefault)
        } else {
          Text(
            usualName.isEmpty
              ? "「\(group.name)」の人にだけ、この名前と写真で表示されます。"
              : "「\(group.name)」の人にだけ、この名前と写真で表示されます。名前が空欄なら「\(usualName)」、写真を入れなければいつもの写真のままです。")
        }
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("このグループでのあなた")
    .navigationBarTitleDisplayMode(.inline)
    .task {
      let today = Day.today
      _ = try? await $members.load(GroupMembersRequest(groupID: group.id, from: today, through: today))
    }
    .onDisappear(perform: saveName)
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { saveName() }
    }
    .alert("保存できませんでした", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("通信できる場所で、もう一度お試しください。")
    }
  }

  /// Saves what is typed, when it differs from the kept name.
  private func saveName() {
    guard let kept = unsaved else { return }
    Task {
      do {
        try await groupCalls.setDisplayName(kept, in: group.id)
        saved = kept
        nameFailed = false
      } catch {
        nameFailed = true
      }
    }
  }

  /// What is typed, trimmed, when it differs from the kept name and can be
  /// kept: within the limit, and empty only with a usual name to follow.
  private var unsaved: String? {
    let kept = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let fits = kept.count <= TextLimits.personName && !(kept.isEmpty && usualName.isEmpty)
    return kept != saved && fits ? kept : nil
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
}
