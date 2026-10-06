import PochicalDesign
import PochicalKit
import PochicalProto
import SQLiteData
import SwiftUI

/// A group's chat and who wrote its lines, read again as either changes.
struct ChatRequest: FetchKeyRequest, Hashable {
  let groupID: String
  let threadID: String
  /// The reader, whose reactions still on their way show at once.
  var me: String?

  struct Value: Hashable, Sendable {
    var state = ChatState(lines: [], waiting: [], atStart: true, marks: [:])
    /// Everyone who has been in the group, those who left too.
    var writers: [GroupMemberRow] = []
  }

  func fetch(_ db: Database) throws -> Value {
    Value(
      state: try Chats.state(of: threadID, in: groupID, me: me, db: db),
      writers: try Chats.writers(in: groupID, db: db))
  }
}

/// A chat's latest line and unread count for `me`, and everyone's names
/// for its writer and mentions, read again as they change.
struct ChatSummaryRequest: FetchKeyRequest, Hashable {
  let groupID: String
  let threadID: String
  let me: String

  struct Value: Hashable, Sendable {
    var summary = ChatSummary()
    /// Everyone who has been in the group by id, those who left too.
    var names: [String: String] = [:]
  }

  func fetch(_ db: Database) throws -> Value {
    Value(
      summary: try Chats.summary(of: threadID, in: groupID, me: me, db: db),
      names: Dictionary(
        try Chats.writers(in: groupID, db: db).map { ($0.userID, $0.displayName) },
        uniquingKeysWith: { _, last in last }))
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

/// One of a group's chats (/design's ChatPage), 全体チャット or a
/// one-to-one chat: others' lines on the left with their face, and in the
/// group's chat their name, at the start of a run, one's own on the right
/// in the accent, the day over each day's first line. It opens
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
  let threadID: String
  /// The other member of a one-to-one chat; none for 全体チャット.
  let otherID: String?
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
  /// Members picked from the list of names while writing, to be sent as
  /// mentions while their @name stays.
  @State private var picked: [PickedMember] = []
  /// A link tapped in a line, open in the browser sheet.
  @State private var browsing: OpenedLink?
  @Environment(\.openInvite) private var openInvite
  /// The line whose ほかの絵文字 is open.
  @State private var reactingTo: ChatLineRow?
  /// The line whose reactions and menu are open.
  @State private var acting: MessageActionsRequest?
  /// What was picked there, done once it has closed.
  @State private var afterActing: (() -> Void)?

  var body: some View {
    let state = chat.state
    let names = self.names
    ScrollView {
      LazyVStack(spacing: 8) {
        if !state.atStart {
          ProgressView()
            .frame(maxWidth: .infinity, minHeight: Metrics.touch)
            .task(id: state.lines.first?.seq) {
              // Asked again until the socket is open to ask.
              let first = state.lines.first?.seq ?? 0
              while !Task.isCancelled {
                if await socket?.requestPage(of: threadID, before: first) == true { return }
                try? await Task.sleep(for: .seconds(1))
              }
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
      // Others' lines below not yet read, counted on the ↓ as a chat's
      // unread are; reading happens at the latest, so none while there.
      let unseen = place.atLatest ? 0 : meID.map { state.unread(by: $0) } ?? 0
      if place.away || unseen > 0 {
        Button {
          withAnimation { toLatest() }
        } label: {
          Image(systemName: "chevron.down")
            .font(.body.weight(.semibold))
            .foregroundStyle(colors.textPrimary)
            .frame(width: Metrics.touch, height: Metrics.touch)
            .glassEffect(.regular.interactive(), in: .circle)
            .overlay(alignment: .topTrailing) {
              if unseen > 0 {
                UnreadCount(count: unseen).offset(x: 4, y: -4)
              }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          unseen > 0 ? "最新のメッセージへ、まだ見ていない新着\(unseen)件" : "最新のメッセージへ"
        )
        .padding(12)
        .transition(.opacity)
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      // A one-to-one chat with someone who left stays to be read, but
      // takes no more lines.
      if let otherID, let gone = chat.writers.first(where: { $0.userID == otherID && $0.left }) {
        Text("\(gone.displayName)はグループを抜けました")
          .font(.footnote)
          .foregroundStyle(colors.textTertiary)
          .frame(maxWidth: .infinity, minHeight: Metrics.touch)
          .background(colors.backgroundBase)
          .overlay(alignment: .top) {
            Rectangle().fill(colors.separator).frame(height: 1)
          }
      } else {
        composer
      }
    }
    .background(colors.backgroundBase)
    .navigationTitle(otherID.flatMap { names[$0] } ?? group.name)
    .navigationSubtitle(otherID == nil ? "\(chat.writers.count { !$0.left })人" : group.name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.visible, for: .navigationBar)
    .toolbarVisibility(.hidden, for: .tabBar)
    .task {
      try? await $chat.load(ChatRequest(groupID: group.id, threadID: threadID))
      meID = await groupCalls.userID()
      try? await $chat.load(ChatRequest(groupID: group.id, threadID: threadID, me: meID))
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
    .environment(\.openURL, OpenURLAction { open($0) })
    .fullScreenCover(item: $acting) {
      afterActing?()
      afterActing = nil
    } content: { request in
      MessageActionsOverlay(request: request) { action in
        afterActing = action
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { acting = nil }
      }
      .presentationBackground(.clear)
    }
    .sheet(item: $reactingTo) { line in
      EmojiKeyboardSheet { react($0, on: line) }
    }
    .sheet(item: $browsing) { link in
      SafariView(url: link.url).ignoresSafeArea()
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
        let onReact = { (emoji: String) in react(emoji, on: line) }
        LineView(
          text: line.text, time: line.sentAtMs, edited: line.edited, mine: mine,
          writer: mine || !startsRun ? nil : names[line.authorID] ?? "",
          named: otherID == nil, waiting: false, nameOf: nameOf,
          reactions: line.reactions, meID: meID, onReact: onReact,
          lifted: acting?.lineID == line.opID
        ) { frame in
          openActions(
            MessageActionsRequest(
              lineID: line.opID, frame: frame, mine: mine,
              bubble: AnyView(
                MessageBubble(text: line.text, mine: mine, waiting: false, nameOf: nameOf)),
              reactions: line.reactions, meID: meID, onReact: onReact,
              onMoreReactions: { reactingTo = line }, actions: actions(for: line, mine: mine)))
        }
      }
    case .waiting(let line):
      LineView(
        text: line.text, time: line.madeAtMs, edited: false, mine: true, writer: nil,
        named: false, waiting: true, nameOf: nameOf, lifted: acting?.lineID == line.opID
      ) { frame in
        // Still on its way: nothing but コピー yet.
        openActions(
          MessageActionsRequest(
            lineID: line.opID, frame: frame, mine: true,
            bubble: AnyView(
              MessageBubble(text: line.text, mine: true, waiting: true, nameOf: nameOf)),
            actions: [copy(line.text)]))
      }
    }
  }

  // MARK: Composer

  private var composer: some View {
    let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let unchanged = editing.map { $0.text == withMentions(draft, picked: picked) } ?? false
    let blocked = trimmed.isEmpty || unchanged
    return VStack(spacing: 0) {
      mentionList
      if let editing {
        HStack(spacing: 8) {
          VStack(alignment: .leading, spacing: 2) {
            Text("メッセージを編集")
              .font(.caption.weight(.semibold))
              .foregroundStyle(colors.accentDefault)
            Text(plainText(editing.text, nameOf: nameOf))
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

  // MARK: Mentions

  /// Everyone who has been in the group by id, those who left too.
  private var names: [String: String] {
    Dictionary(
      chat.writers.map { ($0.userID, $0.displayName) }, uniquingKeysWith: { _, last in last })
  }

  /// A member's name in the group as it is now, for their mentions.
  private func nameOf(_ id: String) -> String {
    names[id] ?? "メンバー"
  }

  /// The others to mention, over the composer, while an @ is being
  /// written at the end of the message: in the group's chat only, those in
  /// it now whose name has what follows the @.
  @ViewBuilder private var mentionList: some View {
    let others =
      otherID != nil
      ? []
      : mentionQuery(draft).map { query in
        chat.writers.filter {
          !$0.left && $0.userID != meID && (query.isEmpty || $0.displayName.contains(query))
        }
      } ?? []
    if !others.isEmpty {
      ScrollView {
        VStack(spacing: 0) {
          ForEach(others, id: \.userID) { member in
            Button {
              // The ＠ a Japanese keyboard is still converting is
              // confirmed first, so the field takes the name.
              draft = pickingMention(field.commit(), name: member.displayName)
              picked.removeAll { $0.id == member.userID }
              picked.append(PickedMember(id: member.userID, name: member.displayName))
            } label: {
              HStack(spacing: 12) {
                LetterAvatar(name: member.displayName, size: 28)
                Text(member.displayName)
                  .foregroundStyle(colors.textPrimary)
                  .lineLimit(1)
                  .frame(maxWidth: .infinity, alignment: .leading)
              }
              .padding(.horizontal, 8)
              .frame(height: Metrics.touch)
              .contentShape(.rect)
            }
            .buttonStyle(.plain)
          }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
      }
      // A few in sight, the rest a scroll away.
      .frame(height: min(CGFloat(others.count) * Metrics.touch + 8, 180))
      .accessibilityLabel("メンションする人")
      .overlay(alignment: .top) {
        Rectangle().fill(colors.separator).frame(height: 1)
      }
    }
  }

  /// A link tapped in a line: Pochical's invitations on their join
  /// screen, other pages in the browser sheet over the chat.
  private func open(_ url: URL) -> OpenURLAction.Result {
    if let code = inviteCode(of: url) {
      openInvite(code)
    } else {
      browsing = OpenedLink(url: url)
    }
    return .handled
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
    read.threadID = threadID
    read.lastReadSeq = UInt64(latest)
    write(.read(read))
  }

  private func send(_ text: String) {
    var send = Pochical_V1_ChatSend()
    send.threadID = threadID
    send.text = withMentions(text, picked: picked)
    write(.send(send))
    draft = ""
    picked = []
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
    // Its mentions as @name again, still picked.
    draft = plainText(line.text, nameOf: nameOf)
    picked = mentions(in: line.text).map { PickedMember(id: $0, name: nameOf($0)) }
    field.focus()
  }

  private func stopEditing() {
    editing = nil
    draft = ""
    picked = []
  }

  private func save(_ line: ChatLineRow, text: String) {
    var change = Pochical_V1_ChatChange()
    change.threadID = threadID
    change.seq = UInt64(line.seq)
    change.text = withMentions(text, picked: picked)
    write(.change(change))
    stopEditing()
  }

  /// A line's menu: コピー, then for one's own 編集, and 送信取消 apart in
  /// the danger color (spec/chat.md, Editing and unsending).
  private func actions(for line: ChatLineRow, mine: Bool) -> [MessageAction] {
    var actions = [copy(line.text)]
    if mine {
      actions.append(MessageAction(title: "編集", systemImage: "pencil") { edit(line) })
      actions.append(
        MessageAction(
          title: "送信取消", systemImage: "arrow.uturn.backward", destructive: true,
          startsGroup: true
        ) { unsending = line })
    }
    return actions
  }

  private func copy(_ text: String) -> MessageAction {
    MessageAction(title: "コピー", systemImage: "doc.on.doc") {
      UIPasteboard.general.string = plainText(text, nameOf: nameOf)
    }
  }

  /// Opens a line's reactions and menu over everything, at once: the
  /// overlay draws its own coming in.
  private func openActions(_ request: MessageActionsRequest) {
    var transaction = Transaction()
    transaction.disablesAnimations = true
    withTransaction(transaction) { acting = request }
  }

  /// Puts the reader's `emoji` on the line, or takes it back if it was
  /// theirs already.
  private func react(_ emoji: String, on line: ChatLineRow) {
    let current = chat.state.lines.first { $0.seq == line.seq } ?? line
    var react = Pochical_V1_ChatReact()
    react.threadID = threadID
    react.seq = UInt64(line.seq)
    react.emoji = emoji
    react.on = !current.reactions.contains { $0.emoji == emoji && $0.userIDs.contains(meID ?? "") }
    write(.react(react))
  }

  private func unsend(_ line: ChatLineRow) {
    var unsend = Pochical_V1_ChatUnsend()
    unsend.threadID = threadID
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
private struct LineView: View {
  @Environment(\.themeColors) private var colors
  let text: String
  let time: Int64
  let edited: Bool
  let mine: Bool
  /// The writer's name at the start of a run of others' lines, for their
  /// face.
  let writer: String?
  /// Their name shows over the run too, as in a group chat.
  let named: Bool
  let waiting: Bool
  /// A member's name, for the line's mentions.
  let nameOf: (String) -> String
  var reactions: [LineReaction] = []
  var meID: String?
  /// Puts the reader's reaction on, or takes it back.
  var onReact: (String) -> Void = { _ in }
  /// Its bubble is lifted over the chat, its place standing empty.
  var lifted = false
  /// Opens the line's reactions and menu, from where its bubble is.
  let onActions: (CGRect) -> Void
  /// Where the bubble is on the screen, for its menu.
  @State private var frame = CGRect.zero
  @State private var pressing = false

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
        if let writer, named {
          Text(writer)
            .font(.caption2)
            .foregroundStyle(colors.textTertiary)
            .padding(.leading, 4)
        }
        HStack(alignment: .bottom, spacing: 8) {
          if mine { meta }
          MessageBubble(text: text, mine: mine, waiting: waiting, nameOf: nameOf)
            // Its own size and where its middle is: the press's give
            // shrinks its frame on the screen, not its size.
            .onGeometryChange(for: CGRect.self) { proxy in
              let global = proxy.frame(in: .global)
              return CGRect(
                x: global.midX - proxy.size.width / 2, y: global.midY - proxy.size.height / 2,
                width: proxy.size.width, height: proxy.size.height)
            } action: {
              frame = $0
            }
            // Gives a little under the finger, as Messages' bubble does,
            // and opens its reactions and menu once held.
            .scaleEffect(pressing ? 0.96 : 1)
            .opacity(lifted ? 0 : 1)
            .animation(.easeOut(duration: 0.2), value: pressing)
            .onLongPressGesture(minimumDuration: 0.35) {
              UIImpactFeedbackGenerator(style: .medium).impactOccurred()
              pressing = false
              onActions(frame)
            } onPressingChanged: {
              pressing = $0
            }
            .accessibilityAction(named: "リアクションとメニュー") { onActions(frame) }
          if !mine { meta }
        }
        if !reactions.isEmpty {
          ReactionRow(reactions: reactions, meID: meID, nameOf: nameOf, onReact: onReact)
        }
      }
      .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
      .padding(mine ? .leading : .trailing, 40)
    }
    // The line reads as one, its reactions as buttons of their own.
    .accessibilityElement(children: reactions.isEmpty ? .combine : .contain)
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

/// A line's words in its bubble: others' on the quiet fill, one's own in
/// the accent, dimmed while it waits to be sent.
struct MessageBubble: View {
  @Environment(\.themeColors) private var colors
  let text: String
  let mine: Bool
  let waiting: Bool
  /// A member's name, for the line's mentions.
  let nameOf: (String) -> String

  var body: some View {
    Text(words)
      .font(.subheadline)
      .lineSpacing(3)
      .foregroundStyle(mine ? colors.accentOnFill : colors.textPrimary)
      .tint(mine ? colors.accentOnFill : colors.accentDefault)
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .background(mine ? colors.accentFill : colors.fillTertiary, in: bubble)
      .opacity(waiting ? 0.6 : 1)
  }

  /// The line's words, its mentions as @ and the name in the name's
  /// weight and its links underlined, both in the accent in others' lines
  /// and in the bubble's color in one's own (spec/chat.md, In a message).
  private var words: AttributedString {
    var words = AttributedString()
    for part in textParts(text) {
      var piece = AttributedString(part.mention.map { "@\(nameOf($0))" } ?? part.text)
      if part.mention != nil {
        piece.font = .subheadline.weight(.semibold)
        if !mine { piece.foregroundColor = colors.accentDefault }
      } else if let link = part.url.flatMap({ URL(string: $0, encodingInvalidCharacters: true) }) {
        piece.link = link
        piece.underlineStyle = .single
      }
      words += piece
    }
    return words
  }

  /// Rounded but at the corner by the writer, toward the foot.
  private var bubble: UnevenRoundedRectangle {
    UnevenRoundedRectangle(
      topLeadingRadius: Radius.lg, bottomLeadingRadius: mine ? Radius.lg : Radius.sm,
      bottomTrailingRadius: mine ? Radius.sm : Radius.lg, topTrailingRadius: Radius.lg)
  }

}
