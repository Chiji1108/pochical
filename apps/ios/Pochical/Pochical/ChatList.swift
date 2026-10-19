import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// The group's chats which have lines, and everyone who has been in the
/// group, read again as they change.
struct ChatThreadsRequest: FetchKeyRequest, Hashable {
  let groupID: String

  struct Value: Hashable, Sendable {
    var threads: Set<String> = []
    /// Those who left too, whose chats stay to be read.
    var writers: [GroupMemberRow] = []
  }

  func fetch(_ db: Database) throws -> Value {
    Value(
      threads: try Chats.threads(in: groupID, db: db),
      writers: try Chats.writers(in: groupID, db: db))
  }
}

/// The hub's チャット (/design's GroupHub): 全体チャット, then a one-to-one
/// chat with each member it has been started with (one who left too, so
/// it can still be read and its unread lines cleared), and
/// 個人チャットを始める while someone is left to start one with, all on one
/// card of rows.
struct ChatList: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Fetch private var chats = ChatThreadsRequest.Value()
  /// Whom the user has blocked: their one-to-one chats are hidden and none
  /// can be started.
  @Fetch(BlocksRequest()) private var blocked: Set<String> = []
  let group: GroupRow
  /// Everyone in the group now.
  let members: [GroupMember]
  /// Opens a chat: its thread, and the other member of a one-to-one chat.
  let onOpen: (String, String?) -> Void
  /// The reader last heard of at first, so the rows are there on the
  /// first frame rather than after the server answers.
  @State private var meID = GroupCalls.knownUserID
  @State private var starting = false

  init(group: GroupRow, members: [GroupMember], onOpen: @escaping (String, String?) -> Void) {
    self.group = group
    self.members = members
    self.onOpen = onOpen
    _chats = Fetch(
      wrappedValue: ChatThreadsRequest.Value(), ChatThreadsRequest(groupID: group.id))
  }

  var body: some View {
    let talking =
      meID.map { me in
        chats.writers.filter {
          $0.userID != me && chats.threads.contains(directThread(me, $0.userID))
            && !blocked.contains($0.userID)
        }
      } ?? []
    let untouched = members.filter { member in
      member.userID != meID && !talking.contains { $0.userID == member.userID }
        && !blocked.contains(member.userID)
    }
    VStack(alignment: .leading, spacing: 8) {
      VStack(spacing: 0) {
        if let meID {
          ChatRow(
            placeID: group.id, threadID: groupThread, me: meID, label: "全体チャット", blocked: blocked
          ) {
            Image(systemName: "bubble.left.and.bubble.right")
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(colors.accentDefault)
              .frame(width: 28, height: 28)
              .background(colors.accentContainer, in: RoundedRectangle(cornerRadius: Radius.sm))
          } onOpen: {
            onOpen(groupThread, nil)
          }
          ForEach(talking, id: \.userID) { member in
            separator
            ChatRow(
              placeID: group.id, threadID: directThread(meID, member.userID), me: meID,
              label: member.shownName
            ) {
              MemberAvatar(
                name: member.shownName, photoID: member.deleted ? "" : member.photoID,
                groupID: group.id, size: 28)
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
      // Alone in the group, why there is no one to talk to one to one.
      if members.count <= 1 {
        Text("メンバーを招待すると、1対1でも話せます。")
          .font(.footnote)
          .foregroundStyle(colors.textTertiary)
          .padding(.horizontal, 16)
      }
    }
    .task { meID = await groupCalls.userID() }
    .task(id: group.id) {
      _ = try? await $chats.load(ChatThreadsRequest(groupID: group.id))
    }
    .sheet(isPresented: $starting) {
      StartChatSheet(members: untouched, groupID: group.id, groupName: group.name) { member in
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

/// A chat in the hub's list (/design's ChatRow), and the chat with
/// Pochical's people on 設定's: its mark, name and latest line, its time,
/// and how many lines count as unread.
struct ChatRow<Icon: View>: View {
  @Environment(\.themeColors) private var colors
  @Fetch private var chat = ChatSummaryRequest.Value()
  /// Whether the chat's notifications are off, marked after its name.
  @Fetch(ChatNotificationsRequest()) private var notifications = ChatNotificationState()
  /// The device's time the chat's lines not sent are read by.
  @State private var now = ChatTime.nowMs
  /// The chat's place, by the id the device keeps its chats by.
  let placeID: String
  let threadID: String
  let me: String
  let label: String
  /// Whom the user has blocked: their latest line is folded.
  var blocked: Set<String> = []
  @ViewBuilder let icon: () -> Icon
  let onOpen: () -> Void

  /// The chat read as the row is made, so its latest line is there on the
  /// first frame rather than まだメッセージはありません for a moment.
  init(
    placeID: String, threadID: String, me: String, label: String, blocked: Set<String> = [],
    @ViewBuilder icon: @escaping () -> Icon, onOpen: @escaping () -> Void
  ) {
    self.placeID = placeID
    self.threadID = threadID
    self.me = me
    self.label = label
    self.blocked = blocked
    self.icon = icon
    self.onOpen = onOpen
    _chat = Fetch(
      wrappedValue: ChatSummaryRequest.Value(),
      ChatSummaryRequest(groupID: placeID, threadID: threadID, me: me, now: ChatTime.nowMs))
  }

  var body: some View {
    let summary = chat.summary
    let time = summary.waiting?.madeAtMs ?? summary.last?.sentAtMs
    Button(action: onOpen) {
      HStack(spacing: 12) {
        icon().accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 4) {
            Text(label)
              .font(.body)
              .foregroundStyle(colors.textPrimary)
              .lineLimit(1)
            if notifications.isMuted(threadID, in: placeID) {
              Image(systemName: "bell.slash")
                .font(.system(size: 12))
                .foregroundStyle(colors.textTertiary)
                .accessibilityLabel("通知オフ")
            }
          }
          previewText
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
              HStack(spacing: 4) {
                // An unread line mentions the reader, as Telegram marks
                // one, so it is found among chats whose notifications
                // are off.
                if summary.mentioned {
                  Text("@")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(colors.accentOnFill)
                    .frame(width: 18, height: 18)
                    .background(colors.accentFill, in: Circle())
                    .accessibilityLabel("自分へのメンションあり")
                }
                UnreadCount(count: summary.unread)
              }
            }
          }
        }
      }
      .padding(.horizontal, 16)
      .frame(minHeight: 68)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .task(id: request) {
      _ = try? await $chat.load(request)
    }
    // A line still being sent says 送れませんでした the moment its wait is
    // over, the chat open or not (spec/chat.md, Lines on their way).
    .task(id: chat.summary.failsAt) {
      guard let at = chat.summary.failsAt else { return }
      await ChatTime.sleep(until: at)
      if !Task.isCancelled { now = ChatTime.nowMs }
    }
  }

  private var request: ChatSummaryRequest {
    ChatSummaryRequest(groupID: placeID, threadID: threadID, me: me, now: now)
  }

  /// What is being written, kept as the chat was left, in place of the
  /// latest line: 下書き： in the danger color, as Telegram marks one
  /// (spec/chat.md, Drafts). Else the member's own latest line not sent
  /// says so in place of its words: the line's red ! and 送れませんでした,
  /// as Messages marks one (spec/chat.md, Lines on their way).
  private var previewText: Text {
    if let draft = chat.summary.draft {
      let words = plainText(draft.text, nameOf: { memberName($0, in: chat.names) })
      return Text("\(Text("下書き：").foregroundStyle(colors.dangerDefault))\(words)")
    }
    if chat.summary.waiting?.failed == true {
      let mark = Text(Image(systemName: "exclamationmark.circle.fill"))
        .foregroundStyle(colors.dangerDefault)
      return Text("\(mark) 送れませんでした").accessibilityLabel("送れませんでした")
    }
    return Text(preview)
  }

  /// The latest line as one line of words: 自分： before one's own.
  private var preview: String {
    let summary = chat.summary
    let nameOf = { (id: String) in memberName(id, in: chat.names) }
    if let waiting = summary.waiting, waiting.photo != nil {
      return "自分：写真を送りました"
    }
    if let waiting = summary.waiting {
      return "自分：\(Self.words(waiting.text, days: waiting.days, poll: waiting.poll, nameOf: nameOf))"
    }
    guard let last = summary.last else { return "まだメッセージはありません" }
    if let notice = last.notice {
      return notice.words(
        by: memberName(last.authorID, in: chat.names),
        subject: memberName(notice.subjectID, in: chat.names))
    }
    if last.unsent {
      return unsentLine(
        chat.names[last.authorID], mine: last.authorID == me,
        deleted: chat.deleted.contains(last.authorID))
    }
    if blocked.contains(last.authorID) {
      return "ブロック中のメンバーのメッセージ"
    }
    if last.photo != nil {
      return last.authorID == me ? "自分：写真を送りました" : "写真を送りました"
    }
    let words = Self.words(
      last.text, days: last.days, poll: last.poll, decided: last.decided, nameOf: nameOf)
    return last.authorID == me ? "自分：\(words)" : words
  }

  /// A line as the list says it: days shared, or a poll still open, as
  /// 〜を共有しました (/design's lastLine); a decided poll says its day.
  private static func words(
    _ text: String, days: [Day], poll: Bool, decided: Day? = nil, nameOf: (String) -> String
  ) -> String {
    let words = lineWords(text, days: days, poll: poll, decided: decided, nameOf: nameOf)
    let shared = !days.isEmpty && !(poll && decided != nil)
    return shared ? "\(words)を共有しました" : words
  }
}

/// 個人チャットを始める: the members there is no one-to-one chat with yet.
private struct StartChatSheet: View {
  @Environment(\.dismiss) private var dismiss
  let members: [GroupMember]
  let groupID: String
  let groupName: String
  let onPick: (GroupMember) -> Void

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(members) { member in
            Button {
              onPick(member)
            } label: {
              Label {
                Text(member.name).lineLimit(1)
              } icon: {
                MemberAvatar(name: member.name, photoID: member.photoID, groupID: groupID, size: 28)
              }
            }
            .tint(.primary)
          }
        } footer: {
          // The chat is the group's, with the names and faces it shows.
          Text("\(groupName)での名前とアイコンで話します。")
        }
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
