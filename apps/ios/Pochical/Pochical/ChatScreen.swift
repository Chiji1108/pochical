import PochicalDesign
import PochicalKit
import PhotosUI
import PochicalProto
import SQLiteData
import SwiftUI

/// One of a group's chats (/design's ChatPage), 全体チャット or a
/// one-to-one chat: others' lines on the left with their face, and in the
/// group's chat their name, at the start of a run, one's own on the right
/// in the accent, the day over each day's first line. It opens
/// on the first unread line under ここから新着, else on the latest, and
/// earlier lines come from the group as it is scrolled back. A long press
/// opens a line's menu: コピー, and on one's own 編集 and 送信取消.
struct ChatScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  @Environment(\.look) private var look
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.groupSocket) private var socket
  /// The socket said under the title, once it has stayed not current for
  /// a moment (spec/chat.md): the lines shown may not be all there is.
  @State private var syncSaid = SyncStatus.current
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.openGroupRoute) private var openGroupRoute
  @Dependency(\.defaultDatabase) private var database
  @Fetch private var chat = ChatRequest.Value()
  /// Everyone with their shifts over the days the chat's lines share.
  @Fetch private var dayMembers: [GroupMember] = []
  /// Whom the user has blocked: their lines fold away.
  @Fetch(BlocksRequest()) private var blocked: Set<String> = []
  /// Whether this chat's notifications are off.
  @Fetch(ChatNotificationsRequest()) private var notifications = ChatNotificationState()
  /// What is being reported.
  @State private var reporting: ReportTarget?
  /// Blocking or unblocking someone, asked first.
  @State private var blockQuestion: BlockQuestion?
  /// Someone else's profile, from their face.
  @State private var profileOf: ProfileOf?
  /// Blocked members' lines shown this once at a tap.
  @State private var shownBlocked: Set<Int64> = []
  let group: GroupRow
  let threadID: String
  /// The other member of a one-to-one chat; none for 全体チャット.
  let otherID: String?
  /// A day brought from みんなのシフト, set over the composer as the chat
  /// opens.
  var sharing: Day?
  /// `sharing` has been set over the composer, once.
  @State private var tookSharing = false
  @State private var meID: String?
  /// The line ここから新着 sits over: the first unread as the chat opens,
  /// or the first of others' lines coming in at once, more than the screen
  /// shows (spec/chat.md, Unread lines and typing). Once there, it stays
  /// while the chat is open.
  @State private var unreadFrom: Int64?
  /// The chat has opened on its line, and reading may count.
  @State private var opened = false
  /// The lines are where the chat opens on (the latest, or ここから新着),
  /// hidden until then so the way there is not seen.
  @State private var placed = false
  /// Moves the lines, at the moments the chat does: not a scroll
  /// position bound to the screen, which as the person scrolls would make
  /// the screen, and every line, again at each line passing the top.
  @State private var scroller = ChatLinesProxy()
  /// What scrolling changes, kept out of the screen's own state so that
  /// scrolling remakes only what shows it, not every line.
  @State private var scroll = ChatScroll()
  /// Times the person's scrolling has come to the latest, which reads it.
  @State private var reachedLatest = 0
  /// The chat keeps to its latest line as lines come and the keyboard
  /// comes and goes: true until the person scrolls up, and again once they
  /// scroll back down to it, send, or tap ↓. Only their own scrolling
  /// changes it, not lines or the keyboard moving the view.
  @State private var following = true
  /// The first line laid out, kept from the chat's opening so new lines
  /// add to it rather than move it, and moved back a page at a time.
  @State private var window: Int64?
  /// The first line laid out as the page before it was last laid out, so a
  /// page is laid out once as the top nears, not at each scroll.
  @State private var earlierFrom: Int64?
  /// What is being written, read by the composer alone.
  @State private var draft = ChatDraft()
  @State private var unsending: ChatLineRow?
  /// A link tapped in a line, open in the browser sheet.
  @State private var browsing: OpenedLink?

  /// The lines read as the screen is made, by the reader last heard of,
  /// so they are there through the push that brings it in rather than
  /// arriving, oldest first, as it ends.
  init(group: GroupRow, threadID: String, otherID: String?, sharing: Day? = nil) {
    self.group = group
    self.threadID = threadID
    self.otherID = otherID
    self.sharing = sharing
    let me = GroupCalls.knownUserID
    _meID = State(initialValue: me)
    _chat = Fetch(
      wrappedValue: ChatRequest.Value(),
      ChatRequest(groupID: group.id, threadID: threadID, me: me))
  }
  /// All the pins open under the bar.
  @State private var pinsOpen = false
  /// A pinned line being gone to, its earlier lines asked for until held.
  @State private var jumpTarget: Int64?
  /// The line gone to, ringed for a moment, and the line lifted while its
  /// menu is open.
  @State private var marks = LineMarks()
  /// What a pin did, said for a moment over the lines.
  @State private var notice: String?
  /// Saves and copies done, each felt as it is (spec/haptics.md).
  @State private var done = 0
  /// How many notices have been said, so only the latest one's time
  /// takes it away.
  @State private var notices = 0
  @Environment(\.openInvite) private var openInvite
  /// The line whose ほかの絵文字 is open.
  @State private var reactingTo: ChatLineRow?
  /// The days to share are being picked.
  @State private var sharingDays = false
  /// The poll whose day is being picked.
  @State private var deciding: ChatLineRow?
  /// A photo opened large.
  @State private var viewing: LinePhoto?
  /// Long lines opened at 続きを読む, which stay open while the chat is.
  @State private var unfolded: Set<String> = []
  /// A photo's line that could not be sent, its choices open.
  @State private var unsentPhoto: WaitingLine?
  /// Others writing now, each until their typing lapses.
  @State private var typers: [String: Date] = [:]
  /// The line whose reactions and menu are open.
  @State private var acting: MessageActionsRequest?
  /// What is done on a line, for every line of the chat.
  @State private var lineActions = Handler<(lineID: String, action: LineAction)>()

  var body: some View {
    let state = chat.state
    let names = self.names
    let listed = items(state)
    let timeless = linesWithoutTime(listed)
    let byID = Dictionary(listed.map { ($0.id, $0) }) { first, _ in first }
    // Who is writing now, under the latest line; not someone blocked.
    let writers = typers.keys.filter { !blocked.contains($0) }.sorted()
    ChatLinesView(
      rows: rows(listed, writers: writers, timeless: timeless, names: names),
      row: { id in
        AnyView(
          lineRow(
            id, item: byID[id], first: listed.first?.id, names: names,
            showsTime: !timeless.contains(id)))
      },
      composer: AnyView(composer),
      latest: AnyView(
        LatestButton(scroll: scroll, unread: meID.map { state.unread(by: $0) } ?? 0) {
          toLatestOrUnread()
        }),
      ground: colors.backgroundBase, scroll: scroll, proxy: scroller, following: $following,
      shown: placed, holds: acting != nil, canAskEarlier: opened && !state.atStart,
      onNearTop: { showEarlier(laidOut: $0) }, dayOver: { dayOver($0, in: listed) },
      onReachLatest: { reachedLatest += 1 }
    )
    // The composer rides the keyboard on its own guide, under the lines.
    .ignoresSafeArea(.container, edges: .bottom)
    .ignoresSafeArea(.keyboard)
    .overlay {
      if state.lines.isEmpty, state.waiting.isEmpty {
        Text("まだメッセージはありません")
          .font(.footnote)
          .foregroundStyle(colors.textQuaternary)
      }
    }
    .sensoryFeedback(.success, trigger: done)
    .overlay(alignment: .top) {
      FloatingDay(scroll: scroll, covered: notice != nil)
    }
    // Under the pins, over the lines.
    .overlay(alignment: .top) {
      if let notice {
        NoticeCapsule(words: notice)
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .safeAreaInset(edge: .top, spacing: 0) {
      PinBar(
        pins: chat.state.pins, open: $pinsOpen, nameOf: nameOf,
        onJump: jump(to:), onUnpin: { pin($0, on: false) })
    }
    .task(
      id: JumpKey(
        target: jumpTarget, first: chat.state.lines.first?.seq, held: chat.state.heldFrom)
    ) {
      await goToTarget()
    }
    // The server asked a page ahead of the lines laid out.
    .task(
      id: PageAhead(
        from: opened ? chat.state.heldFrom : nil,
        short: chat.state.heldBefore < Chat.pageSize)
    ) {
      await askAhead()
    }
    .background(colors.backgroundBase)
    .environment(\.memberFaces, faces)
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.visible, for: .navigationBar)
    .toolbarVisibility(.hidden, for: .tabBar)
    .toolbar {
      // The title drawn here to carry 通知オフ's bell after it, which the
      // bar's own title does not draw, and to open what the chat is of:
      // the group's settings, or the other member's profile.
      ToolbarItem(placement: .principal) {
        Button(action: openTitle) {
          VStack(spacing: 0) {
            HStack(spacing: 4) {
              Text(title).font(.headline).lineLimit(1)
              if isMuted {
                Image(systemName: "bell.slash")
                  .font(.caption)
                  .foregroundStyle(colors.textTertiary)
                  .accessibilityLabel("通知オフ")
              }
            }
            if let words = syncWords {
              Text(words)
                .font(.caption2)
                .foregroundStyle(colors.textTertiary)
            } else if otherID == nil {
              Text("\(chat.writers.count { !$0.left })人")
                .font(.caption2)
                .foregroundStyle(colors.textTertiary)
            }
          }
          .foregroundStyle(colors.textPrimary)
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .accessibilityHint(otherID == nil ? "押すとグループの設定" : "押すとプロフィール")
      }
      ToolbarItem(placement: .primaryAction) {
        Menu("チャットのメニュー", systemImage: "ellipsis") {
          if otherID == nil {
            Button("みんなのシフト", systemImage: "calendar") {
              openGroupRoute(.shifts(group, day: nil))
            }
            Divider()
          }
          let muted = isMuted
          Button(
            muted ? "通知をオンにする" : "通知をオフにする",
            systemImage: muted ? "bell" : "bell.slash"
          ) {
            setMuted(!muted)
          }
        }
      }
    }
    .task {
      // The reader is asked of the server before the chat opens only when
      // not yet heard of; else after, in case the account changed.
      if meID == nil {
        await hearReader()
      }
      // Opens at once on the lines the device holds, as the messaging apps
      // do; lines the group's catch-up still brings come in under them.
      await open()
      await hearReader()
    }
    // Read at the latest: as it opens, as lines come, as the app comes
    // back, and as the person scrolls down to it (the place's action).
    .task(
      id: ReadKey(
        opened: opened, active: scenePhase == .active, landed: scroll.landed,
        reached: reachedLatest)
    ) {
      // Lines just come in are read once they are in place on the screen,
      // not as they arrive.
      guard opened, scroll.place.atLatest, scenePhase == .active else { return }
      read()
    }
    // The socket's status, said once it has not been current for
    // statusShownAfterMs, and gone as soon as it is.
    .task(id: socket.map(ObjectIdentifier.init)) {
      guard let socket else { return }
      var saying: Task<Void, Never>?
      for await status in await socket.statuses() {
        saying?.cancel()
        if status == .current || syncSaid != .current {
          syncSaid = status
          continue
        }
        saying = Task {
          try? await Task.sleep(for: .milliseconds(SyncSocket.statusShownAfterMs))
          if !Task.isCancelled { syncSaid = status }
        }
      }
      saying?.cancel()
    }
    // Others' typing, as it comes, each shown until it lapses.
    .task(id: socket.map(ObjectIdentifier.init)) {
      guard let socket else { return }
      for await typing in await socket.typing() where typing.threadID == threadID {
        withAnimation {
          typers[typing.userID] = typing.on ? Date.now.addingTimeInterval(
            Double(Chat.typingShowMs) / 1000) : nil
        }
      }
    }
    .task(id: typers) {
      guard let next = typers.values.min() else { return }
      try? await Task.sleep(for: .seconds(max(next.timeIntervalSinceNow, 0)))
      withAnimation { typers = typers.filter { $0.value > .now } }
    }
    // Lines coming in and someone writing keep a following chat at its
    // foot, in the same update they come in by (ChatLinesView), as does
    // anything else changing the lines' height or the room they are seen
    // in (a link's page drawn, the composer growing, the keyboard).
    .onChange(of: FollowKey(latest: state.lines.last?.seq, writers: typers.count)) {
      before, now in
      guard opened, following else { return }
      // Others' lines the reader has not read stop at ここから新着 rather
      // than going past it, as the chat's catch-up bringing many at once.
      // Else the lines keep to their foot as they come in (ChatLinesView).
      if before.latest != now.latest, let first = unreadComing(after: before.latest) {
        show(from: first)
      }
    }
    // One's own line just sent shows at the foot, wherever the lines were;
    // already there, the lines slid up to it as it was written (`write`).
    .onChange(of: state.waiting.last?.opID) { _, sent in
      guard sent != nil else { return }
      following = true
      // At the foot already, the lines slid up to it as it came in.
      toLatest(animated: !reduceMotion)
    }
    .environment(\.openURL, OpenURLAction { open($0) })
    // Leaving the chat takes its open menu with it.
    .onAppear {
      Notifications.shared.openChat = OpenedChat(groupID: group.id, threadID: threadID)
      // As sharing into a chat app does: nothing reaches everyone until it
      // is sent, with a word if one likes.
      if let sharing, !tookSharing {
        tookSharing = true
        draft.attachedDays = [sharing]
      }
    }
    .onDisappear {
      closeActions()
      draft.stopTyping(in: threadID, socket: socket)
      if Notifications.shared.openChat?.threadID == threadID {
        Notifications.shared.openChat = nil
      }
    }
    .task(id: sharedSpan) {
      guard let span = sharedSpan else { return }
      _ = try? await $dayMembers.load(
        GroupMembersRequest(groupID: group.id, from: span.from, through: span.through))
    }
    .sheet(isPresented: $sharingDays) {
      ShareDaysSheet(
        groupID: group.id, people: otherID.map { Set([$0, meID ?? ""]) }, pollable: otherID == nil,
        onSend: shareDays)
    }
    .confirmationDialog(
      "送れなかった写真",
      isPresented: Binding(get: { unsentPhoto != nil }, set: { if !$0 { unsentPhoto = nil } }),
      titleVisibility: .visible, presenting: unsentPhoto
    ) { line in
      Button("もう一度送る") { sendAgain(line) }
      Button("削除", role: .destructive) { deleteUnsent(line) }
      Button("キャンセル", role: .cancel) {}
    }
    .fullScreenCover(item: $viewing) { photo in
      PhotoViewer(photo: photo, groupID: group.id) {
        await savePhoto(photo, in: group.id, calls: groupCalls)
      }
    }
    .modifier(
      ReportAndBlock(
        groupID: group.id, groupName: group.name, groupMark: group.mark, blocked: blocked,
        reporting: $reporting, profileOf: $profileOf, blockQuestion: $blockQuestion,
        onMessage: message(_:), onReported: reported, onSetBlocked: setBlocked))
    .sheet(item: $deciding) { line in
      DecidePollSheet(days: line.days, votes: line.votes, decided: line.decided) { day in
        decide(line, on: day)
      }
    }
    .sheet(item: $reactingTo) { line in
      EmojiKeyboardSheet(title: "リアクション") { react($0, on: line) }
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
    .handles(lineActions) { act($0.action, on: $0.lineID) }
  }

  /// Under the lines: the composer, or what a one-to-one chat with
  /// someone who left says in its place.
  @ViewBuilder private var composer: some View {
    // A one-to-one chat with someone who left stays to be read, but
    // takes no more lines.
    if let otherID, let gone = chat.writers.first(where: { $0.userID == otherID && $0.left }) {
      Text(gone.deleted ? "相手のアカウントは削除されました" : "\(gone.displayName)はグループを抜けました")
        .font(.footnote)
        .foregroundStyle(colors.textTertiary)
        .frame(maxWidth: .infinity, minHeight: Metrics.touch)
        .background(colors.backgroundBase)
        .overlay(alignment: .top) {
          Rectangle().fill(colors.separator).frame(height: 1)
        }
    } else {
      ChatComposer(
        draft: draft, groupID: group.id, threadID: threadID,
        mentionable: otherID != nil
          ? [] : chat.writers.filter { !$0.left && $0.userID != meID },
        nameOf: nameOf, quoteOf: { quote(of: Int64($0) ?? 0) }, onSubmit: submit,
        onStopEditing: stopEditing,
        onShareDays: { sharingDays = true }, say: say)
    }
  }

  /// Someone writing now's item, by their id.
  private static let typing = "typing-"

  /// The lines' items, each with all its row draws, so a line is drawn
  /// again, and measured, only as that changes.
  private func rows(
    _ listed: [ChatItem], writers: [String], timeless: Set<String>, names: [String: String]
  ) -> [LinesRow] {
    let state = chat.state
    // What every line draws by: when it changes, every line is drawn again.
    let common = RowsLook(
      names: names, faces: faces, meID: meID, deleted: deletedIDs, members: cardMembers,
      left: Set(chat.writers.filter(\.left).map(\.userID))
    ).hashValue
    let pins = Set(state.pins.map(\.seq))
    var rows: [LinesRow] = []
    // Only while the next earlier page is on its way from the server:
    // those the device holds are laid out before the top is reached.
    if !state.atStart, state.heldBefore == 0 {
      rows.append(LinesRow(id: ChatLinesView.earlier, look: AnyHashable(ChatLinesView.earlier)))
    }
    for item in listed {
      var quote: LineQuote?
      var pinned = false
      if case .line(let line, _) = item {
        quote = line.replyTo.map(self.quote(of:))
        pinned = pins.contains(line.seq)
      } else if case .waiting(let line, _) = item {
        quote = line.replyTo.map(self.quote(of:))
      }
      // What the line shows of the person's own choices: its writer
      // blocked, shown anyway, or opened at 続きを読む.
      var blockedWriter = false
      var shownAnyway = false
      var unfoldedLine = false
      if case .line(let line, _) = item {
        blockedWriter = blocked.contains(line.authorID)
        shownAnyway = shownBlocked.contains(line.seq)
        unfoldedLine = unfolded.contains(line.opID)
      }
      let look = RowLook(
        item: item, parted: item.startsRun && item.id != listed.first?.id,
        showsTime: !timeless.contains(item.id), pinned: pinned, quote: quote,
        blockedWriter: blockedWriter, shownAnyway: shownAnyway, unfolded: unfoldedLine,
        common: common)
      rows.append(LinesRow(id: item.id, look: AnyHashable(look)))
    }
    for userID in writers {
      rows.append(LinesRow(id: "\(Self.typing)\(userID)", look: AnyHashable(common)))
    }
    return rows
  }

  /// The item `id` as the chat's lines draw it.
  @ViewBuilder private func lineRow(
    _ id: String, item: ChatItem?, first: String?, names: [String: String], showsTime: Bool
  ) -> some View {
    Group {
      if id == ChatLinesView.earlier {
        EarlierLines()
      } else if id.hasPrefix(Self.typing) {
        let userID = String(id.dropFirst(Self.typing.count))
        TypingLine(name: names[userID] ?? "メンバー", photoID: faces[userID] ?? "")
          .padding(.top, CGFloat(Chat.runGap - Chat.lineGap))
      } else if let item {
        // Lines close within a run, parted where the writer changes; the
        // first has the list's own margin over it.
        let parted = item.startsRun && item.id != first
        row(item, names: names, showsTime: showsTime)
          .padding(.top, parted ? CGFloat(Chat.runGap - Chat.lineGap) : 0)
      }
    }
    .frame(maxWidth: .infinity)
    // A tap off a line's own parts puts the keyboard away, as LINE does.
    .background {
      Color.clear.contentShape(.rect).onTapGesture {
        UIApplication.shared.sendAction(
          #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
      }
      .accessibilityHidden(true)
    }
  }

  // MARK: Lines

  /// What the lines show, in order: each day's title, ここから新着, and
  /// the lines with whether each starts a run of one writer's.
  /// The day whose lines are at the top, from the first item in sight:
  /// none while that is the day's own title.
  private func dayOver(_ top: String?, in items: [ChatItem]) -> Day? {
    guard let top, let at = items.firstIndex(where: { $0.id == top }) else { return nil }
    for item in items[...at].reversed() {
      if case .day(let day) = item {
        return item.id == top ? nil : day
      }
    }
    return nil
  }

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
      let starts = startsRun(
        at: line.sentAtMs, writer: line.unsent || line.notice != nil ? nil : line.authorID)
      if line.seq == unreadFrom {
        items.append(.unread)
      }
      // A reply starts a run, as its quote begins it.
      items.append(
        .line(line, startsRun: starts || line.seq == unreadFrom || line.replyTo != nil))
    }
    for line in state.waiting {
      let starts = startsRun(at: line.madeAtMs, writer: meID)
      items.append(.waiting(line, startsRun: starts || line.replyTo != nil))
    }
    return items
  }

  /// The lines whose time is left to the next (spec/chat.md, In a
  /// message): one going on the run of the line after it, sent in the
  /// same minute, as LINE shows one time for them.
  private func linesWithoutTime(_ items: [ChatItem]) -> Set<String> {
    var timeless: Set<String> = []
    for (item, next) in zip(items, items.dropFirst()) {
      guard case .line(let line, _) = item, case .line(let after, let startsRun) = next,
        !startsRun, !line.unsent, !after.unsent, line.notice == nil, after.notice == nil,
        ChatTime.clock(line.sentAtMs) == ChatTime.clock(after.sentAtMs)
      else { continue }
      timeless.insert(item.id)
    }
    return timeless
  }

  @ViewBuilder private func row(
    _ item: ChatItem, names: [String: String], showsTime: Bool = true
  ) -> some View {
    switch item {
    case .day(let day):
      DayChip(day: day)
    case .unread:
      HStack(spacing: 12) {
        Rectangle().fill(colors.accentBorder).frame(height: 1)
        Text("ここから新着").font(.caption).foregroundStyle(colors.accentDefault)
        Rectangle().fill(colors.accentBorder).frame(height: 1)
      }
      .padding(.vertical, 4)
    case .line(let line, _) where line.hidden:
      // Never delivered to the reader: nothing shows.
      EmptyView()
    case .line(let line, _)
    where otherID == nil && blocked.contains(line.authorID) && !shownBlocked.contains(line.seq)
      && !line.unsent && line.notice == nil:
      BlockedLine { shownBlocked.insert(line.seq) }
    case .line(let line, let runStart):
      // A blocked member's line shown at a tap stands alone between the
      // folded ones, with their face, the way to their profile.
      let startsRun = runStart || (otherID == nil && blocked.contains(line.authorID))
      if let notice = line.notice {
        // A line from the app, as an unsent line sits: who did what, by
        // the names the group shows now.
        Text(
          notice.words(
            by: names[line.authorID] ?? "メンバー", subject: names[notice.subjectID] ?? "メンバー"))
          .font(.caption)
          .foregroundStyle(colors.textTertiary)
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
          .padding(.horizontal, 24)
          .padding(.vertical, 8)
      } else if line.unsent {
        Text(
          unsentLine(
            names[line.authorID], mine: line.authorID == meID,
            deleted: deletedIDs.contains(line.authorID)))
          .font(.caption)
          .foregroundStyle(colors.textTertiary)
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
      } else {
        let mine = line.authorID == meID
        LineView(
          lineID: line.opID, text: line.text, preview: line.preview, days: line.days,
          members: cardMembers, poll: pollLine(for: line), photo: line.photo,
          quote: line.replyTo.map(quote(of:)), unfolded: unfolded.contains(line.opID),
          groupID: group.id,
          shifts: line.poll ? nil : line.days.first.map { GroupRoute.shifts(group, day: $0) },
          time: line.sentAtMs, showsTime: showsTime, edited: line.edited, mine: mine,
          writer: mine || !startsRun ? nil : names[line.authorID] ?? "",
          writerPhoto: faces[line.authorID] ?? "",
          named: otherID == nil, first: startsRun, waiting: false, names: names,
          reactions: line.reactions, countedReactions: otherID != nil,
          pinned: chat.state.pins.contains { $0.seq == line.seq }, marks: marks, seq: line.seq,
          meID: meID,
          actions: lineActions)
      }
    case .waiting(let line, let startsRun):
      LineView(
        lineID: line.opID, text: line.text, preview: line.preview, days: line.days,
        members: cardMembers, poll: waitingPoll(line), photo: line.photo,
        quote: line.replyTo.map(quote(of:)), groupID: group.id, time: line.madeAtMs,
        edited: false, mine: true, writer: nil, named: false, first: startsRun, waiting: true,
        failed: line.failed, names: names, marks: marks,
        actions: lineActions)
    }
  }

  /// A poll on its way: nothing voted yet.
  private func waitingPoll(_ line: WaitingLine) -> PollLine? {
    line.poll ? PollLine(votes: [], decided: nil, names: names, meID: meID, canDecide: true) : nil
  }

  /// Acts on the line `lineID` as the chat is now.
  private func act(_ action: LineAction, on lineID: String) {
    switch items(chat.state).first(where: { $0.id == "line-\(lineID)" }) {
    case .line(let line, let startsRun): act(action, on: line, startsRun: startsRun)
    case .waiting(let line, let startsRun): act(action, onWaiting: line, startsRun: startsRun)
    default: break
    }
  }

  private func act(_ action: LineAction, on line: ChatLineRow, startsRun: Bool) {
    switch action {
    case .unfold:
      // Opened where it is, its words going on down from there, as the
      // messaging apps open a long one: not carried to the foot.
      following = false
      scroller.growDown("line-\(line.opID)")
      withAnimation { _ = unfolded.insert(line.opID) }
    case .openPhoto:
      viewing = line.photo
    case .openQuote:
      line.replyTo.map(jump(to:))
    case .openProfile:
      profileOf = ProfileOf(
        id: line.authorID, name: names[line.authorID] ?? "メンバー",
        photoID: faces[line.authorID] ?? "")
    case .retry:
      break
    case .react(let emoji):
      react(emoji, on: line)
    case .vote(let day, let on):
      var vote = Pochical_V1_ChatVote()
      vote.threadID = threadID
      vote.seq = UInt64(line.seq)
      vote.day = day.key
      vote.on = on
      write(.vote(vote))
    case .decide:
      deciding = line
    case .hold(let spot, let finger, let link):
      let mine = line.authorID == meID
      let bubble = AnyView(
        LineContent(
          text: line.text, preview: line.preview, days: line.days, members: cardMembers,
          poll: pollLine(for: line), photo: line.photo, quote: line.replyTo.map(quote(of:)),
          groupID: group.id, mine: mine, first: startsRun, waiting: false, nameOf: nameOf))
      // A link held has its own menu, without the reactions.
      if let link {
        openActions(
          MessageActionsRequest(
            lineID: line.opID, spot: spot, mine: mine, bubble: bubble, finger: finger,
            actions: linkActions(link, open: { _ = open(link) }, copied: { sayDone("コピーしました") })))
      } else {
        openActions(
          MessageActionsRequest(
            lineID: line.opID, spot: spot, mine: mine, bubble: bubble,
            finger: finger, reactions: line.reactions, meID: meID,
            onReact: { react($0, on: line) },
            onMoreReactions: { reactingTo = line }, actions: actions(for: line, mine: mine)))
      }
    }
  }

  private func act(_ action: LineAction, onWaiting line: WaitingLine, startsRun: Bool) {
    switch action {
    case .retry:
      unsentPhoto = line
    case .hold(let spot, let finger, _):
      // Still on its way: nothing but コピー yet, and days have nothing
      // to copy.
      guard line.days.isEmpty, line.photo == nil else { return }
      openActions(
        MessageActionsRequest(
          lineID: line.opID, spot: spot, mine: true,
          bubble: AnyView(
            MessageBubble(
              text: line.text, mine: true, first: startsRun, waiting: true, nameOf: nameOf,
              quote: line.replyTo.map(quote(of:)), groupID: group.id)),
          finger: finger, actions: [copy(line.text)]))
    default:
      break
    }
  }

  // MARK: Composer

  /// Sends the tray's photos, each as its own line, kept on the device to
  /// upload before its line goes.
  private func sendPhotos() {
    for picked in draft.photos {
      guard (try? ChatPhotos.keep(picked.shrunk.jpeg, as: picked.id, in: group.id)) != nil else {
        continue
      }
      var send = Pochical_V1_ChatSend()
      send.threadID = threadID
      send.photo = picked.shrunk.line(picked.id).wire
      send.replyTo = takeReply()
      write(.send(send))
    }
    withAnimation { draft.photos = [] }
  }

  /// Sends a photo that could not be sent once more, after the rest.
  private func sendAgain(_ line: WaitingLine) {
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    try? database.write { try Chats.sendAgain(line.opID, now: now, in: $0) }
  }

  /// Deletes a photo's line that could not be sent, and the photo kept
  /// on the device for it.
  private func deleteUnsent(_ line: WaitingLine) {
    try? database.write { try Chats.drop(line.opID, in: $0) }
    if let photo = line.photo {
      ChatPhotos.forget(photo.id, in: group.id)
    }
  }

  // MARK: Mentions

  /// Everyone who has been in the group by id, those who left too.
  private var names: [String: String] {
    Dictionary(
      chat.writers.map { ($0.userID, $0.shownName) }, uniquingKeysWith: { _, last in last })
  }

  /// Everyone's photo as the group shows it, by id.
  private var faces: [String: String] {
    Dictionary(
      chat.writers.map { ($0.userID, $0.deleted ? "" : $0.photoID) },
      uniquingKeysWith: { _, last in last })
  }

  /// Those in the group whose account is deleted, whose lines are gone.
  private var deletedIDs: Set<String> {
    Set(chat.writers.filter(\.deleted).map(\.userID))
  }

  /// A member's name in the group as it is now, for their mentions.
  private func nameOf(_ id: String) -> String {
    names[id] ?? "メンバー"
  }

  /// A link tapped in a line: Pochical's invitations on their join
  /// screen, other pages in the browser sheet over the chat.
  private func open(_ url: URL) -> OpenURLAction.Result {
    if let mentioned = mentioned(by: url) {
      // The reader's own opens nothing.
      if mentioned != meID {
        profileOf = ProfileOf(
          id: mentioned, name: names[mentioned] ?? "メンバー", photoID: faces[mentioned] ?? "")
      }
    } else if let code = inviteCode(of: url) {
      openInvite(code)
    } else {
      browsing = OpenedLink(url: url)
    }
    return .handled
  }

  // MARK: Doing

  /// The reader as the server knows them, the lines read again by them
  /// when that is not who they were taken to be.
  private func hearReader() async {
    let heard = await groupCalls.userID()
    guard heard != meID else { return }
    meID = heard
    await reload()
  }

  /// Reads the chat again for the reader and the lines laid out.
  private func reload() async {
    _ = try? await $chat.load(
      ChatRequest(groupID: group.id, threadID: threadID, me: meID, from: window))
  }

  /// Lays out a page more of the earlier lines the device holds, at once,
  /// as the reader scrolls near the top. With none held, the page the
  /// server was asked for ahead (`askAhead`) is laid out as it arrives.
  /// Only once the lines read are those laid out (`laidOut`, the first in
  /// place), not while the page before them is still going in.
  private func showEarlier(laidOut: String?) {
    let state = chat.state
    guard opened, state.heldBefore > 0, let line = state.lines.first, line.seq != earlierFrom,
      laidOut == "line-\(line.opID)"
    else { return }
    let first = line.seq
    earlierFrom = first
    window = max(first - Int64(Chat.pageSize), state.heldFrom ?? 1)
    Task { await reload() }
  }

  /// Asks the server for the page before the lines held while fewer than
  /// a page are held before those laid out, so the next page is on the
  /// device before it is scrolled to; again until the socket is open to
  /// ask.
  private func askAhead() async {
    let state = chat.state
    guard opened, state.heldBefore < Chat.pageSize, let from = state.heldFrom, from > 1 else {
      return
    }
    while !Task.isCancelled, await socket?.requestPage(of: threadID, before: from) != true {
      try? await Task.sleep(for: .seconds(1))
    }
  }

  /// What the title says of the socket in place of how many are in the
  /// group, as the messaging apps do; nil while it is current.
  private var syncWords: String? {
    switch syncSaid {
    case .connecting: "接続中…"
    case .catchingUp: "更新中…"
    case .current: nil
    }
  }

  /// Opens on the first unread line under ここから新着, else stays on the
  /// latest; reading counts from then on.
  private func open() async {
    if let me = meID {
      let lines = chat.state.lines
      // The app's notices are never unread, as one's own lines are not.
      let writers = lines.map { $0.authorID == me || $0.notice != nil ? LineWriter.me : .others }
      if let index = firstUnread(writers, unread: chat.state.unread(by: me)) {
        unreadFrom = lines[index].seq
      }
    }
    // With nothing new, the lines are laid out at the latest already. With something, once the lines are laid out, ここから新着
    // goes to the top, shown only once there rather than after a trip.
    if unreadFrom == nil {
      placed = true
    } else {
      // Not carried to the foot meanwhile by lines coming in or laid out.
      following = false
      // Once ここから新着 is laid out. With few new lines, it is on the
      // screen at the latest already, and the lines stop at their foot
      // short of it.
      await scroller.show(ChatItem.unread.id, at: .top)
      following = scroll.place.atLatest
      withAnimation(.easeOut(duration: 0.15)) { placed = true }
    }
    opened = true
    window = chat.state.lines.first?.seq
    await reload()
  }

  /// The first of the lines that just came in after `latest` which is
  /// others' and unread, the app's notices aside.
  private func unreadComing(after latest: Int64?) -> ChatLineRow? {
    guard let me = meID else { return nil }
    let state = chat.state
    // A line never delivered to the reader counts as the app's, passed over.
    let writers = state.lines.map { line in
      (seq: line.seq, writer: line.authorID == me ? LineWriter.me
        : line.notice != nil || line.hidden ? .app : .others)
    }
    let seq = firstComing(writers, after: latest ?? 0, read: state.lastRead(by: me))
    return seq.flatMap { seq in state.lines.first { $0.seq == seq } }
  }

  /// Shows the lines from `first` as far as the screen goes rather than
  /// the latest: at the foot after all when they fit, following on, else
  /// stopped there under ここから新着 (unless the chat has one already).
  private func show(from first: ChatLineRow) {
    following = false
    // Asked to the top with too few lines under it to get there, it stops
    // at the foot.
    scroller.show("line-\(first.opID)", at: .top, animated: true) {
      if scroll.place.atLatest {
        following = true
      } else if unreadFrom == nil {
        // Shown once ここから新着 is laid out over it.
        unreadFrom = first.seq
        scroller.show(ChatItem.unread.id, at: .top)
      }
    }
  }

  /// ↓: to ここから新着 first while it is below the top of the screen with
  /// lines under it still unread, as Signal goes, following again only if
  /// that is the foot; else to the latest, following it.
  private func toLatestOrUnread() {
    let unread = meID.map { chat.state.unread(by: $0) } ?? 0
    guard scroll.place.unreadBelow, unread > 0 else {
      following = true
      toLatest(animated: true)
      return
    }
    scroller.show(ChatItem.unread.id, at: .top, animated: true) {
      if scroll.place.atLatest { following = true }
    }
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
    Notifications.shared.askOnce()
    var send = Pochical_V1_ChatSend()
    send.threadID = threadID
    send.text = withMentions(text, picked: draft.picked)
    if let preview = draft.attachedPreview(for: text) {
      send.preview = preview.wire
    }
    // Taken off with ×, so the server does not read it either; a page not
    // come yet the server reads and adds to the line.
    send.withoutPreview = draft.previewRemoved != nil && previewLink(text) == draft.previewRemoved
    send.replyTo = takeReply()
    write(.send(send))
    draft.text = ""
    draft.picked = []
    draft.previewRemoved = nil
  }

  /// The first and last of the days the chat's lines share, for their
  /// cards' shifts.
  private var sharedSpan: DaySpan? {
    let days = chat.state.lines.flatMap(\.days) + chat.state.waiting.flatMap(\.days)
    guard let from = days.min(), let through = days.max() else { return nil }
    return DaySpan(from: from, through: through)
  }

  /// Whose shifts a card of days shows: everyone in the group, or the two
  /// of a one-to-one chat.
  private var cardMembers: [GroupMember] {
    guard let otherID else { return dayMembers }
    return dayMembers.filter { $0.userID == otherID || $0.userID == meID }
  }

  /// Shares days with everyone's shifts, as a line of their own.
  private func shareDays(_ days: [Day], poll: Bool) {
    var send = Pochical_V1_ChatSend()
    send.threadID = threadID
    send.days = days.map(\.key)
    send.poll = poll
    send.replyTo = takeReply()
    write(.send(send))
  }

  /// Saves a photo to the person's library, and says so.
  private func save(_ photo: LinePhoto) {
    Task {
      if await savePhoto(photo, in: group.id, calls: groupCalls) {
        sayDone("写真を保存しました")
      } else {
        say("保存できませんでした")
      }
    }
  }

  /// A report sent: blocking them is offered, unless they are already.
  private func reported(_ target: ReportTarget) {
    if let question = blockAfterReport(target, blocked: blocked) {
      blockQuestion = question
    } else {
      say("通報しました")
    }
  }

  /// Blocks or unblocks someone, and says so.
  private func setBlocked(_ question: BlockQuestion) {
    answer(question, calls: groupCalls, say: SayAction(say: say))
  }

  private var isMuted: Bool {
    notifications.isMuted(threadID, in: group.id)
  }

  /// The other member's name, or the group's (/design's ChatTitle).
  private var title: String {
    otherID.flatMap { names[$0] } ?? group.name
  }

  /// The group's settings from 全体チャット's title, the other member's
  /// profile from a one-to-one chat's.
  private func openTitle() {
    guard let otherID else {
      openGroupRoute(.settings(group))
      return
    }
    profileOf = ProfileOf(
      id: otherID, name: names[otherID] ?? "メンバー", photoID: faces[otherID] ?? "")
  }

  /// The one-to-one chat with someone, from their profile; none for the
  /// one open already.
  private func message(_ person: ProfileOf) -> (() -> Void)? {
    guard person.id != otherID, let meID else { return nil }
    return {
      openGroupRoute(.chat(group, thread: directThread(meID, person.id), with: person.id))
    }
  }

  /// Turns this chat's notifications off or on, and says so.
  private func setMuted(_ muted: Bool) {
    Task {
      do {
        try await groupCalls.setChatMuted(threadID, in: group.id, muted: muted)
        say(muted ? "通知をオフにしました" : "通知をオンにしました")
      } catch {
        say("できませんでした。通信できるところでもう一度どうぞ")
      }
    }
  }

  /// Who may settle a poll: its writer, or anyone once they have left, so
  /// a poll is never stuck.
  private func canDecide(_ line: ChatLineRow) -> Bool {
    line.authorID == meID
      || chat.writers.contains { $0.userID == line.authorID && $0.left }
  }

  /// A poll's card's votes and what voting and settling it do.
  private func pollLine(for line: ChatLineRow) -> PollLine? {
    guard line.poll else { return nil }
    return PollLine(
      votes: line.votes, decided: line.decided, names: names, meID: meID,
      canDecide: canDecide(line))
  }

  /// Settles a poll on `day`, and says so to whoever settled it.
  private func decide(_ line: ChatLineRow, on day: Day) {
    var decide = Pochical_V1_ChatDecide()
    decide.threadID = threadID
    decide.seq = UInt64(line.seq)
    decide.day = day.key
    write(.decide(decide))
    say("\(day.fullText)に決めました")
  }

  /// To the foot, once what asked has been laid out.
  private func toLatest(animated: Bool = false) {
    Task { @MainActor in scroller.toLatest(animated: animated) }
  }

  /// The composer's send: a word still being converted goes too,
  /// confirmed, and is cut to the limit as confirming it would. Saves the
  /// line being changed; else sends the days first, then each photo, then
  /// the words.
  private func submit() {
    let text = String(draft.field.commit().prefix(TextLimits.chatMessage))
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if let editing = draft.editing {
      if !text.isEmpty { save(editing, text: text) }
      return
    }
    if let days = draft.attachedDays {
      shareDays(days, poll: false)
      draft.attachedDays = nil
    }
    sendPhotos()
    if !text.isEmpty { send(text) }
  }

  /// Answers a line (返信): quoted over the composer until sent or ×.
  private func reply(to line: ChatLineRow) {
    if draft.editing != nil { stopEditing() }
    withAnimation { draft.replyTo = String(line.seq) }
    draft.field.focus()
  }

  /// The line being answered, for the first line sent: then no more.
  private func takeReply() -> UInt64 {
    defer { draft.replyTo = nil }
    return draft.replyTo.flatMap(UInt64.init) ?? 0
  }

  /// The line a reply answers, as its quote shows it (spec/chat.md, Replies):
  /// as the device holds it, however far back, else said to be earlier
  /// until it comes; gone to at a tap.
  private func quote(of seq: Int64) -> LineQuote {
    guard
      let line = chat.state.lines.first(where: { $0.seq == seq }) ?? chat.state.quoted[seq]
    else {
      return LineQuote(seq: seq, words: "以前のメッセージ")
    }
    let writer = names[line.authorID] ?? "メンバー"
    if line.unsent {
      return LineQuote(seq: seq, writer: writer, words: "取り消されたメッセージ")
    }
    if blocked.contains(line.authorID) {
      return LineQuote(seq: seq, words: "ブロック中のメンバーのメッセージ")
    }
    return LineQuote(
      seq: seq, writer: writer,
      words: lineWords(
        line.text, days: line.days, poll: line.poll, decided: line.decided,
        photo: line.photo != nil, nameOf: nameOf),
      photo: line.photo)
  }

  private func edit(_ line: ChatLineRow) {
    draft.replyTo = nil
    draft.editing = line
    // Its mentions as @name again, still picked.
    draft.text = plainText(line.text, nameOf: nameOf)
    draft.picked = mentions(in: line.text).map { PickedMember(id: $0, name: nameOf($0)) }
    draft.field.focus()
  }

  private func stopEditing() {
    draft.editing = nil
    draft.text = ""
    draft.picked = []
  }

  private func save(_ line: ChatLineRow, text: String) {
    var change = Pochical_V1_ChatChange()
    change.threadID = threadID
    change.seq = UInt64(line.seq)
    change.text = withMentions(text, picked: draft.picked)
    // The page stays while the first link does (spec/vectors/chat.json,
    // edited); else the new link's, if it has come.
    change.keepsPreview = keepsPreview(of: line.text, editedTo: change.text)
    if !change.keepsPreview, let preview = draft.attachedPreview(for: text) {
      change.preview = preview.wire
    }
    write(.change(change))
    draft.previewRemoved = nil
    stopEditing()
  }

  /// A line's menu: コピー, then for one's own 編集, and 送信取消 apart in
  /// the danger color (spec/chat.md, Editing and unsending).
  private func actions(for line: ChatLineRow, mine: Bool) -> [MessageAction] {
    let pinned = chat.state.pins.contains { $0.seq == line.seq }
    // Shared days, polls and photos have no words to copy or change.
    let words = line.days.isEmpty && line.photo == nil
    // First, for any line (/design's menu).
    var actions = [
      MessageAction(title: "返信", systemImage: "arrowshape.turn.up.left") { reply(to: line) }
    ]
    if words {
      actions.append(copy(line.text))
    }
    if let photo = line.photo {
      actions.append(
        MessageAction(title: "保存", systemImage: "square.and.arrow.down") { save(photo) })
    }
    // Anyone's line, for everyone in the chat (spec/chat.md, Pins).
    actions.append(
      MessageAction(
        title: pinned ? "ピン留めを外す" : "ピン留め", systemImage: pinned ? "pin.slash" : "pin"
      ) { pin(line.seq, on: !pinned) })
    if mine, words {
      actions.append(MessageAction(title: "編集", systemImage: "pencil") { edit(line) })
    }
    if line.poll, line.decided != nil, canDecide(line) {
      actions.append(
        MessageAction(title: "決め直す", systemImage: "calendar.badge.checkmark") {
          deciding = line
        })
    }
    if mine {
      actions.append(
        MessageAction(
          title: "送信取消", systemImage: "arrow.uturn.backward", destructive: true,
          startsGroup: true
        ) { unsending = line })
    } else {
      // Last, apart and in the danger color (spec/chat.md).
      actions.append(
        MessageAction(
          title: "通報", systemImage: "exclamationmark.bubble", destructive: true,
          startsGroup: true
        ) { reporting = .line(line, writer: names[line.authorID] ?? "メンバー") })
    }
    return actions
  }

  /// Pins a line for everyone, or takes its pin off, and says what
  /// happened, the oldest pin making room for a new one by name.
  private func pin(_ seq: Int64, on: Bool) {
    let current = chat.state.pins.map { String($0.seq) }
    let dropped = on ? pinStep(current, pin: String(seq)).dropped : nil
    var pin = Pochical_V1_ChatPin()
    pin.threadID = threadID
    pin.seq = UInt64(seq)
    pin.on = on
    write(.pin(pin))
    say(
      dropped != nil
        ? "ピン留めは\(Chat.maxPins)件までです。いちばん古いものを外しました"
        : on ? "ピン留めしました" : "ピン留めを外しました")
  }

  /// Says `words` over the lines for a moment, as a toast does.
  /// Says a save or a copy is done, felt as well as said: what it made
  /// happens out of sight, in Photos or on the clipboard.
  private func sayDone(_ words: String) {
    done += 1
    say(words)
  }

  private func say(_ words: String) {
    notices += 1
    let said = notices
    withAnimation { notice = words }
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(2.5))
      if notices == said {
        withAnimation { notice = nil }
      }
    }
  }

  /// Goes to a pinned line: closes the list and asks for earlier lines
  /// until the line is held.
  private func jump(to seq: Int64) {
    pinsOpen = false
    jumpTarget = seq
  }

  /// Scrolls to the line gone to once laid out and rings it; else lays out
  /// the page before, coming back as each comes, from the device or, as
  /// it arrives, the server.
  private func goToTarget() async {
    guard let target = jumpTarget else { return }
    let state = chat.state
    if let line = state.lines.first(where: { $0.seq == target }) {
      jumpTarget = nil
      following = false
      // Rung once there, not on the way.
      await scroller.show("line-\(line.opID)", at: .center, animated: true)
      marks.ringed = target
      try? await Task.sleep(for: .milliseconds(500))
      withAnimation(.easeOut(duration: 0.7)) { marks.ringed = nil }
    } else if !state.atStart {
      // Gone to a line before those laid out: on back a page at a time.
      showEarlier(laidOut: state.lines.first.map { "line-\($0.opID)" })
    } else {
      jumpTarget = nil
    }
  }

  private func copy(_ text: String) -> MessageAction {
    MessageAction(title: "コピー", systemImage: "doc.on.doc") {
      UIPasteboard.general.string = plainText(text, nameOf: nameOf)
      sayDone("コピーしました")
    }
  }

  /// Opens a line's reactions and menu over everything, at once: the
  /// overlay draws its own coming in.
  private func openActions(_ request: MessageActionsRequest) {
    acting = request
    marks.lifted = request.lineID
    OverlayWindow.shared.show(
      MessageActionsOverlay(request: request) { closeActions() }
      .environment(\.themeColors, colors)
      .environment(settings)
      .environment(\.look, look))
  }

  /// Gives the line back its bubble in the chat, then takes the overlay
  /// away once the chat has drawn it, so the bubble never blinks out
  /// between the two.
  private func closeActions() {
    acting = nil
    marks.lifted = nil
    OverlayWindow.shared.hide(after: .milliseconds(50))
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
    if draft.editing?.seq == line.seq { stopEditing() }
  }

  private func write(_ kind: Pochical_V1_ChatEdit.OneOf_Kind) {
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    try? database.write { db in
      try Chats.edit(kind, in: group.id, now: now, db: db)
    }
  }
}

/// What every line of a chat is drawn by, beyond the line itself.
private struct RowsLook: Hashable {
  let names: [String: String]
  let faces: [String: String]
  let meID: String?
  let deleted: Set<String>
  let members: [GroupMember]
  let left: Set<String>
}

/// All a line's row draws.
private struct RowLook: Hashable {
  let item: ChatItem
  let parted: Bool
  let showsTime: Bool
  let pinned: Bool
  let quote: LineQuote?
  let blockedWriter: Bool
  let shownAnyway: Bool
  let unfolded: Bool
  let common: Int
}

/// When the server is asked for the page before the lines held: as the
/// first held changes, while fewer than a page are held before the lines
/// laid out.
private struct PageAhead: Hashable {
  let from: Int64?
  let short: Bool
}
