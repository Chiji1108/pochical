import PochicalDesign
import PochicalKit
import PochicalProto
import SQLiteData
import SwiftUI

/// A group's chat and who wrote its lines, read again as either changes.
struct ChatRequest: FetchKeyRequest, Hashable {
  let groupID: String
  let threadID: String

  struct Value: Hashable, Sendable {
    var state = ChatState(lines: [], waiting: [], atStart: true, marks: [:])
    /// Everyone who has been in the group, those who left too.
    var writers: [GroupMemberRow] = []
  }

  func fetch(_ db: Database) throws -> Value {
    Value(
      state: try Chats.state(of: threadID, in: groupID, db: db),
      writers: try Chats.writers(in: groupID, db: db))
  }
}

/// 全体チャット in the hub's list (/design's ChatRow): its latest line and
/// time, and how many of others' lines are unread.
struct ChatRow: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Fetch private var chat = ChatRequest.Value()
  let group: GroupRow
  let onOpen: () -> Void
  @State private var meID: String?

  var body: some View {
    let state = chat.state
    let unread = meID.map { state.unread(by: $0) } ?? 0
    let time = state.waiting.last?.madeAtMs ?? state.lines.last?.sentAtMs
    Button(action: onOpen) {
      HStack(spacing: 12) {
        Image(systemName: "bubble.left.and.bubble.right")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(colors.accentDefault)
          .frame(width: 28, height: 28)
          .background(colors.accentContainer, in: RoundedRectangle(cornerRadius: Radius.sm))
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text("全体チャット")
            .font(.body)
            .foregroundStyle(colors.textPrimary)
          Text(preview)
            .font(.caption)
            .foregroundStyle(colors.textQuaternary)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if time != nil || unread > 0 {
          VStack(alignment: .trailing, spacing: 4) {
            if let time {
              Text(ChatTime.listed(time))
                .font(.caption2)
                .foregroundStyle(colors.textQuaternary)
            }
            if unread > 0 {
              UnreadCount(count: unread)
            }
          }
        }
      }
      .padding(.horizontal, 16)
      .frame(minHeight: 68)
      .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.xxl))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .task(id: group.id) {
      try? await $chat.load(ChatRequest(groupID: group.id, threadID: groupThread))
    }
    .task { meID = await groupCalls.userID() }
  }

  /// The latest line as one line of words: 自分： before one's own.
  private var preview: String {
    let state = chat.state
    if let waiting = state.waiting.last {
      return "自分：\(waiting.text)"
    }
    guard let last = state.lines.last else { return "まだメッセージはありません" }
    let writer = chat.writers.first { $0.userID == last.authorID }
    if last.unsent {
      return unsentLine(writer?.displayName, mine: last.authorID == meID)
    }
    return last.authorID == meID ? "自分：\(last.text)" : last.text
  }
}

/// How many lines are unread, in the badge's red.
struct UnreadCount: View {
  @Environment(\.themeColors) private var colors
  let count: Int

  var body: some View {
    Text("\(count)")
      .font(.system(size: 11, weight: .bold).monospacedDigit())
      .foregroundStyle(colors.dangerOnFill)
      .padding(.horizontal, 5)
      .frame(minWidth: 18, minHeight: 18)
      .background(colors.dangerFill, in: Capsule())
      .accessibilityLabel("\(count)件の未読")
  }
}

/// The line a line taken back leaves (spec/chat.md, Editing and unsending).
func unsentLine(_ writer: String?, mine: Bool) -> String {
  mine ? "メッセージの送信を取り消しました" : "\(writer ?? "メンバー")がメッセージの送信を取り消しました"
}

/// A chat's times as the messaging apps write them.
enum ChatTime {
  private static var calendar: Calendar { .current }

  static func date(_ ms: Int64) -> Date {
    Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
  }

  /// The time by a line: 9:41.
  static func clock(_ ms: Int64) -> String {
    let parts = calendar.dateComponents([.hour, .minute], from: date(ms))
    return String(format: "%d:%02d", parts.hour ?? 0, parts.minute ?? 0)
  }

  /// The day over a day's first line: 今日, 昨日, 10月5日(月), with the
  /// year once it is another year's.
  static func day(_ day: Day) -> String {
    let today = Day.today
    if day == today { return "今日" }
    if day == today.adding(days: -1) { return "昨日" }
    return day.year == today.year ? dayName(day) : "\(day.year)年\(dayName(day))"
  }

  /// The time in the list of chats: the time today, 昨日, else the date.
  static func listed(_ ms: Int64) -> String {
    let day = Day(date(ms), in: calendar)
    let today = Day.today
    if day == today { return clock(ms) }
    if day == today.adding(days: -1) { return "昨日" }
    return day.year == today.year
      ? "\(day.month)/\(day.day)" : "\(day.year)/\(day.month)/\(day.day)"
  }
}

/// A group's own chat, 全体チャット (/design's ChatPage): others' lines on
/// the left with their face and name at the start of a run, one's own on
/// the right in the accent, the day over each day's first line. It opens
/// on the first unread line under ここから新着, else on the latest, and
/// earlier lines come from the group as it is scrolled back. A long press
/// opens a line's menu: コピー, and on one's own 編集 and 送信取消.
struct ChatScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.groupSocket) private var socket
  @Environment(\.scenePhase) private var scenePhase
  @Dependency(\.defaultDatabase) private var database
  @Fetch private var chat = ChatRequest.Value()
  let group: GroupRow
  @State private var meID: String?
  /// The line ここから新着 sits over, fixed as the chat opens.
  @State private var unreadFrom: Int64?
  /// The chat has opened on its line, and reading may count.
  @State private var opened = false
  @State private var position = ScrollPosition(idType: String.self)
  @State private var place = ScrollPlace()
  @State private var draft = ""
  /// The line of one's own being changed in the composer.
  @State private var editing: ChatLineRow?
  @State private var unsending: ChatLineRow?
  @State private var field = ComposerBox()
  /// A word is being converted in the composer.
  @State private var composing = false

  var body: some View {
    let state = chat.state
    let names = Dictionary(
      chat.writers.map { ($0.userID, $0.displayName) }, uniquingKeysWith: { _, last in last })
    ScrollView {
      LazyVStack(spacing: 8) {
        if !state.atStart {
          ProgressView()
            .frame(maxWidth: .infinity, minHeight: Metrics.touch)
            .task(id: state.lines.first?.seq) {
              await socket?.requestPage(of: groupThread, before: state.lines.first?.seq ?? 0)
            }
        }
        ForEach(items(state)) { item in
          row(item, names: names)
        }
      }
      .scrollTargetLayout()
    }
    .contentMargins(.horizontal, 16, for: .scrollContent)
    .contentMargins(.vertical, 12, for: .scrollContent)
    .overlay {
      if state.lines.isEmpty, state.waiting.isEmpty {
        Text("まだメッセージはありません")
          .font(.footnote)
          .foregroundStyle(colors.textQuaternary)
      }
    }
    .scrollPosition($position)
    .defaultScrollAnchor(.bottom)
    .defaultScrollAnchor(.bottom, for: .sizeChanges)
    .scrollDismissesKeyboard(.interactively)
    .onScrollGeometryChange(for: ScrollPlace.self) { geometry in
      let below =
        geometry.contentSize.height + geometry.contentInsets.bottom
        - geometry.visibleRect.maxY
      return ScrollPlace(
        atLatest: below < 24, away: below > geometry.containerSize.height / 2)
    } action: { _, now in
      place = now
    }
    .overlay(alignment: .bottomTrailing) {
      if place.away {
        Button("最新のメッセージへ", systemImage: "chevron.down") {
          withAnimation { toLatest() }
        }
        .labelStyle(.iconOnly)
        .font(.body.weight(.semibold))
        .foregroundStyle(colors.textPrimary)
        .frame(width: Metrics.touch, height: Metrics.touch)
        .glassEffect(.regular.interactive(), in: .circle)
        .padding(12)
        .transition(.opacity)
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      composer
    }
    .background(colors.backgroundBase)
    .navigationTitle(group.name)
    .navigationSubtitle("\(chat.writers.count { !$0.left })人")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.visible, for: .navigationBar)
    .toolbarVisibility(.hidden, for: .tabBar)
    .task {
      try? await $chat.load(ChatRequest(groupID: group.id, threadID: groupThread))
      meID = await groupCalls.userID()
      await open()
    }
    .task(
      id: ReadKey(
        opened: opened, atLatest: place.atLatest, active: scenePhase == .active,
        latest: state.lines.last?.seq ?? 0)
    ) {
      if opened, place.atLatest, scenePhase == .active {
        read()
      }
    }
    // One's own line just sent shows at the foot, wherever the lines were.
    .onChange(of: state.waiting.last?.opID) { _, sent in
      if sent != nil {
        withAnimation { toLatest() }
      }
    }
    .alert(
      "送信を取り消しますか？",
      isPresented: Binding {
        unsending != nil
      } set: {
        if !$0 { unsending = nil }
      }
    ) {
      Button("キャンセル", role: .cancel) {}
      Button("取り消す", role: .destructive) {
        if let line = unsending { unsend(line) }
      }
    } message: {
      Text("メンバー全員のチャットから消えます。")
    }
  }

  // MARK: Lines

  /// What the lines show, in order: each day's title, ここから新着, and
  /// the lines with whether each starts a run of one writer's.
  private func items(_ state: ChatState) -> [ChatItem] {
    var items: [ChatItem] = []
    var lastDay: Day?
    var lastWriter: String?
    /// Puts the day's title before the day's first line, and says whether
    /// the line starts a run.
    @discardableResult func startsRun(at ms: Int64, writer: String?) -> Bool {
      let day = Day(ChatTime.date(ms), in: .current)
      var starts = writer != lastWriter
      if day != lastDay {
        items.append(.day(day))
        lastDay = day
        starts = true
      }
      lastWriter = writer
      return starts
    }
    for line in state.lines {
      let starts = startsRun(at: line.sentAtMs, writer: line.unsent ? nil : line.authorID)
      if line.seq == unreadFrom {
        items.append(.unread)
      }
      items.append(.line(line, startsRun: starts || line.seq == unreadFrom))
    }
    for line in state.waiting {
      startsRun(at: line.madeAtMs, writer: meID)
      items.append(.waiting(line))
    }
    return items
  }

  @ViewBuilder private func row(_ item: ChatItem, names: [String: String]) -> some View {
    switch item {
    case .day(let day):
      Text(ChatTime.day(day))
        .font(.caption2)
        .foregroundStyle(colors.textTertiary)
        .padding(.horizontal, 12)
        .padding(.vertical, 2)
        .background(colors.fillTertiary, in: RoundedRectangle(cornerRadius: Radius.sm))
        .padding(.top, 8)
    case .unread:
      HStack(spacing: 12) {
        Rectangle().fill(colors.accentBorder).frame(height: 1)
        Text("ここから新着").font(.caption).foregroundStyle(colors.accentDefault)
        Rectangle().fill(colors.accentBorder).frame(height: 1)
      }
      .padding(.vertical, 4)
    case .line(let line, let startsRun):
      if line.unsent {
        Text(unsentLine(names[line.authorID], mine: line.authorID == meID))
          .font(.caption)
          .foregroundStyle(colors.textTertiary)
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
      } else {
        let mine = line.authorID == meID
        LineView(
          text: line.text, time: line.sentAtMs, edited: line.edited, mine: mine,
          writer: mine || !startsRun ? nil : names[line.authorID] ?? "", waiting: false
        ) {
          Button("コピー", systemImage: "doc.on.doc") { UIPasteboard.general.string = line.text }
          if mine {
            Button("編集", systemImage: "pencil") { edit(line) }
            Divider()
            Button("送信取消", systemImage: "arrow.uturn.backward", role: .destructive) {
              unsending = line
            }
          }
        }
      }
    case .waiting(let line):
      LineView(
        text: line.text, time: line.madeAtMs, edited: false, mine: true, writer: nil,
        waiting: true
      ) {
        Button("コピー", systemImage: "doc.on.doc") { UIPasteboard.general.string = line.text }
      }
    }
  }

  // MARK: Composer

  private var composer: some View {
    let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let unchanged = editing.map { $0.text == draft } ?? false
    let blocked = trimmed.isEmpty || unchanged
    return VStack(spacing: 0) {
      if let editing {
        HStack(spacing: 8) {
          VStack(alignment: .leading, spacing: 2) {
            Text("メッセージを編集")
              .font(.caption.weight(.semibold))
              .foregroundStyle(colors.accentDefault)
            Text(editing.text)
              .font(.footnote)
              .foregroundStyle(colors.textSecondary)
              .lineLimit(1)
          }
          .padding(.leading, 10)
          .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: Radius.xxs)
              .fill(colors.accentDefault)
              .frame(width: 3)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          Button("編集をやめる", systemImage: "xmark") { stopEditing() }
            .labelStyle(.iconOnly)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(colors.textSecondary)
            .frame(width: Metrics.touch, height: Metrics.touch)
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
        .padding(.top, 4)
      }
      HStack(alignment: .bottom, spacing: 8) {
        ComposerField(
          placeholder: "メッセージ", text: $draft, limit: TextLimits.chatMessage,
          composing: $composing, box: field
        )
        .overlay(alignment: .leading) {
          if draft.isEmpty {
            Text("メッセージ")
              .foregroundStyle(colors.textQuaternary)
              .allowsHitTesting(false)
              .accessibilityHidden(true)
          }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(minHeight: 38)
        .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.xl))
        Button {
          // A word still being converted goes too, confirmed, and is cut
          // to the limit as confirming it would.
          let text = String(
            field.commit().prefix(TextLimits.chatMessage)
          ).trimmingCharacters(in: .whitespacesAndNewlines)
          guard !text.isEmpty else { return }
          if let editing { save(editing, text: text) } else { send(text) }
        } label: {
          Image(systemName: editing == nil ? "arrow.up" : "checkmark")
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(colors.accentOnFill)
            .frame(width: 38, height: 38)
            .background(blocked ? colors.fillPrimary : colors.accentFill, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(blocked)
        .accessibilityLabel(editing == nil ? "送る" : "編集を保存")
        .animation(.easeOut(duration: 0.15), value: trimmed.isEmpty)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      if TextLimits.chatMessage - draft.count <= TextFields.countWhenLeft {
        Text("\(draft.count)/\(TextLimits.chatMessage)")
          .font(.footnote.monospacedDigit())
          .foregroundStyle(
            composing && draft.count > TextLimits.chatMessage
              ? colors.dangerDefault : colors.textTertiary
          )
          .frame(maxWidth: .infinity, alignment: .trailing)
          .padding(.horizontal, 20)
          .padding(.bottom, 4)
          .accessibilityLabel("\(TextLimits.chatMessage)文字中\(draft.count)文字")
      }
    }
    .background(colors.backgroundBase)
    .overlay(alignment: .top) {
      Rectangle().fill(colors.separator).frame(height: 1)
    }
  }

  // MARK: Doing

  /// Opens on the first unread line under ここから新着, else stays on the
  /// latest; reading counts from then on.
  private func open() async {
    if let me = meID {
      let lines = chat.state.lines
      let writers = lines.map { $0.authorID == me ? LineWriter.me : .others }
      if let index = firstUnread(writers, unread: chat.state.unread(by: me)) {
        unreadFrom = lines[index].seq
        // Once the line is laid out.
        try? await Task.sleep(for: .milliseconds(50))
        position.scrollTo(id: ChatItem.unread.id, anchor: .top)
      }
    }
    try? await Task.sleep(for: .milliseconds(300))
    opened = true
  }

  /// Marks the chat read up to its latest line, once it has come on screen.
  private func read() {
    guard let me = meID, let latest = chat.state.lines.last?.seq,
      latest > chat.state.lastRead(by: me)
    else { return }
    var read = Pochical_V1_ChatRead()
    read.threadID = groupThread
    read.lastReadSeq = UInt64(latest)
    write(.read(read))
  }

  private func send(_ text: String) {
    var send = Pochical_V1_ChatSend()
    send.threadID = groupThread
    send.text = text
    write(.send(send))
    draft = ""
  }

  /// To the latest line, by its id: scrolling to the edge would also
  /// move the lines sideways.
  private func toLatest() {
    if let latest = items(chat.state).last {
      position.scrollTo(id: latest.id, anchor: .bottom)
    }
  }

  private func edit(_ line: ChatLineRow) {
    editing = line
    draft = line.text
    field.focus()
  }

  private func stopEditing() {
    editing = nil
    draft = ""
  }

  private func save(_ line: ChatLineRow, text: String) {
    var change = Pochical_V1_ChatChange()
    change.threadID = groupThread
    change.seq = UInt64(line.seq)
    change.text = text
    write(.change(change))
    stopEditing()
  }

  private func unsend(_ line: ChatLineRow) {
    var unsend = Pochical_V1_ChatUnsend()
    unsend.threadID = groupThread
    unsend.seq = UInt64(line.seq)
    write(.unsend(unsend))
    if editing?.seq == line.seq { stopEditing() }
  }

  private func write(_ kind: Pochical_V1_ChatEdit.OneOf_Kind) {
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    try? database.write { db in
      try Chats.edit(kind, in: group.id, now: now, db: db)
    }
  }
}

/// One thing in a chat's lines.
private enum ChatItem: Identifiable {
  case day(Day)
  case unread
  case line(ChatLineRow, startsRun: Bool)
  case waiting(WaitingLine)

  var id: String {
    switch self {
    case .day(let day): "day-\(day.key)"
    case .unread: "unread"
    case .line(let line, _): "line-\(line.opID)"
    // As the group's line will be, so it stays in place once taken.
    case .waiting(let line): "line-\(line.opID)"
    }
  }
}

/// Where the lines are scrolled: at the latest, and more than half a
/// screen up from it.
private struct ScrollPlace: Hashable {
  var atLatest = true
  var away = false
}

private struct ReadKey: Hashable {
  let opened: Bool
  let atLatest: Bool
  let active: Bool
  let latest: Int64
}

/// A line of words: others' on the left with their face and, at the start
/// of a run, their name; one's own on the right in the accent, dimmed
/// while it waits to be sent. The time beside the bubble, 編集済み over it.
private struct LineView<Menu: View>: View {
  @Environment(\.themeColors) private var colors
  let text: String
  let time: Int64
  let edited: Bool
  let mine: Bool
  /// The writer's name at the start of a run of others' lines.
  let writer: String?
  let waiting: Bool
  /// The bubble's long-press menu.
  @ViewBuilder let menu: () -> Menu

  private static var avatar: CGFloat { 32 }

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      if !mine {
        Group {
          if let writer {
            LetterAvatar(name: writer, size: Self.avatar)
          } else {
            Color.clear
          }
        }
        .frame(width: Self.avatar, height: writer == nil ? 0 : Self.avatar)
        .accessibilityHidden(true)
      }
      VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
        if let writer {
          Text(writer)
            .font(.caption2)
            .foregroundStyle(colors.textTertiary)
            .padding(.leading, 4)
        }
        HStack(alignment: .bottom, spacing: 8) {
          if mine { meta }
          Text(text)
            .font(.subheadline)
            .lineSpacing(3)
            .foregroundStyle(mine ? colors.accentOnFill : colors.textPrimary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(mine ? colors.accentFill : colors.fillTertiary, in: bubble)
            .opacity(waiting ? 0.6 : 1)
            // The bubble alone lifts, as Messages lifts one.
            .contentShape(.contextMenuPreview, bubble)
            .contextMenu(menuItems: menu)
          if !mine { meta }
        }
      }
      .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
      .padding(mine ? .leading : .trailing, 40)
    }
    .accessibilityElement(children: .combine)
  }

  /// Rounded but at the corner by the writer, toward the foot.
  private var bubble: UnevenRoundedRectangle {
    UnevenRoundedRectangle(
      topLeadingRadius: Radius.lg, bottomLeadingRadius: mine ? Radius.lg : Radius.sm,
      bottomTrailingRadius: mine ? Radius.sm : Radius.lg, topTrailingRadius: Radius.lg)
  }

  /// 編集済み over the time, toward the bubble; a clock while it waits.
  private var meta: some View {
    VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
      if edited {
        Text("編集済み")
      }
      if waiting {
        Image(systemName: "clock")
          .accessibilityLabel("送信中")
      } else {
        Text(ChatTime.clock(time))
      }
    }
    .font(.caption2)
    .foregroundStyle(colors.textQuaternary)
    .padding(.bottom, 2)
    .fixedSize()
  }
}
