import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// The group's chats which have lines, read again as they change.
struct ChatThreadsRequest: FetchKeyRequest, Hashable {
  let groupID: String

  func fetch(_ db: Database) throws -> Set<String> {
    try Chats.threads(in: groupID, db: db)
  }
}

/// The hub's チャット (/design's GroupHub): 全体チャット, then a one-to-one
/// chat with each member it has been started with, and 個人チャットを始める
/// while someone is left to start one with, all on one card of rows.
struct ChatList: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Fetch private var threads: Set<String> = []
  let group: GroupRow
  /// Everyone in the group now.
  let members: [GroupMember]
  /// Opens a chat: its thread, and the other member of a one-to-one chat.
  let onOpen: (String, String?) -> Void
  @State private var meID: String?
  @State private var starting = false

  var body: some View {
    let others = members.filter { $0.userID != meID }
    let talking =
      meID.map { me in others.filter { threads.contains(directThread(me, $0.userID)) } }
      ?? []
    let untouched = others.filter { member in !talking.contains(member) }
    VStack(spacing: 0) {
      if let meID {
        ChatRow(group: group, threadID: groupThread, me: meID, label: "全体チャット") {
          Image(systemName: "bubble.left.and.bubble.right")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(colors.accentDefault)
            .frame(width: 28, height: 28)
            .background(colors.accentContainer, in: RoundedRectangle(cornerRadius: Radius.sm))
        } onOpen: {
          onOpen(groupThread, nil)
        }
        ForEach(talking) { member in
          separator
          ChatRow(
            group: group, threadID: directThread(meID, member.userID), me: meID,
            label: member.name
          ) {
            LetterAvatar(name: member.name, size: 28)
          } onOpen: {
            onOpen(directThread(meID, member.userID), member.userID)
          }
        }
        if !untouched.isEmpty {
          separator
          Button {
            starting = true
          } label: {
            HStack(spacing: 12) {
              Image(systemName: "plus")
                .font(.body.weight(.semibold))
                .foregroundStyle(colors.accentDefault)
                .frame(width: 28, height: 28)
              Text("個人チャットを始める")
                .foregroundStyle(colors.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
        }
      }
    }
    .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.xxl))
    .task { meID = await groupCalls.userID() }
    .task(id: group.id) {
      try? await $threads.load(ChatThreadsRequest(groupID: group.id))
    }
    .sheet(isPresented: $starting) {
      StartChatSheet(members: untouched) { member in
        starting = false
        if let meID {
          onOpen(directThread(meID, member.userID), member.userID)
        }
      }
    }
  }

  /// A line between rows, from where the words start, as iOS draws one.
  private var separator: some View {
    Rectangle()
      .fill(colors.separator)
      .frame(height: 1)
      .padding(.leading, 56)
      .padding(.trailing, 16)
  }
}

/// A chat in the hub's list (/design's ChatRow): its mark, name and latest
/// line, its time, and how many lines count as unread.
private struct ChatRow<Icon: View>: View {
  @Environment(\.themeColors) private var colors
  @Fetch private var chat = ChatSummaryRequest.Value()
  let group: GroupRow
  let threadID: String
  let me: String
  let label: String
  @ViewBuilder let icon: () -> Icon
  let onOpen: () -> Void

  var body: some View {
    let summary = chat.summary
    let time = summary.waiting?.madeAtMs ?? summary.last?.sentAtMs
    Button(action: onOpen) {
      HStack(spacing: 12) {
        icon().accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(label)
            .font(.body)
            .foregroundStyle(colors.textPrimary)
            .lineLimit(1)
          Text(preview)
            .font(.caption)
            .foregroundStyle(colors.textQuaternary)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if time != nil || summary.unread > 0 {
          VStack(alignment: .trailing, spacing: 4) {
            if let time {
              Text(ChatTime.listed(time))
                .font(.caption2)
                .foregroundStyle(colors.textQuaternary)
            }
            if summary.unread > 0 {
              UnreadCount(count: summary.unread)
            }
          }
        }
      }
      .padding(.horizontal, 16)
      .frame(minHeight: 68)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .task(id: ChatSummaryRequest(groupID: group.id, threadID: threadID, me: me)) {
      try? await $chat.load(ChatSummaryRequest(groupID: group.id, threadID: threadID, me: me))
    }
  }

  /// The latest line as one line of words: 自分： before one's own.
  private var preview: String {
    let summary = chat.summary
    if let waiting = summary.waiting {
      return "自分：\(waiting.text)"
    }
    guard let last = summary.last else { return "まだメッセージはありません" }
    if last.unsent {
      return unsentLine(chat.lastWriter, mine: last.authorID == me)
    }
    return last.authorID == me ? "自分：\(last.text)" : last.text
  }
}

/// 個人チャットを始める: the members there is no one-to-one chat with yet.
private struct StartChatSheet: View {
  @Environment(\.dismiss) private var dismiss
  let members: [GroupMember]
  let onPick: (GroupMember) -> Void

  var body: some View {
    NavigationStack {
      List(members) { member in
        Button {
          onPick(member)
        } label: {
          Label {
            Text(member.name).lineLimit(1)
          } icon: {
            LetterAvatar(name: member.name, size: 28)
          }
        }
        .tint(.primary)
      }
      .navigationTitle("個人チャットを始める")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
    }
    .presentationDetents([.medium, .large])
  }
}
