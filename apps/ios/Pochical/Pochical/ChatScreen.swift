import Nuke
import PochicalDesign
import PochicalKit
import PhotosUI
import PochicalProto
import SQLiteData
import SwiftUI
import SwiftUINavigation
import UIKit

/// A chat of a place (/design's ChatPage): a group's 全体チャット or a
/// one-to-one chat, or the chat with Pochical's people, each doing what
/// its place's rules let it (spec/chat.md, Where a chat is kept). Others'
/// lines on the left with their face, and in the
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
  @Environment(\.displayScale) private var displayScale
  @Environment(\.groupSocket) private var socket
  @Environment(\.groupSockets) private var groupSockets
  @Environment(\.account) private var account
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
  /// Where the chat is kept: a group, or the chat with Pochical's people.
  let place: ChatPlace
  let threadID: String
  /// The other member of a one-to-one chat; none for 全体チャット.
  let otherID: String?
  /// A day brought from みんなのシフト, set over the composer as the chat
  /// opens.
  var sharing: Day?
  /// What the chat's place says first, over its first line once the lines
  /// reach it: who the chat with Pochical's people reaches, and what does.
  var head: AnyView?
  /// `sharing` has been set over the composer, once.
  @State private var tookSharing = false
  /// The chat's draft was put back in the composer as it opened.
  @State private var tookDraft = false
  /// The draft last kept, so it is written only as it changes.
  @State private var keptDraft: KeptDraft?
  /// The draft as it opened, its words as the composer showed them: kept
  /// as it was while they stay so, so mentions of two members of one name
  /// keep who each is.
  @State private var openedDraft: (shown: String, sent: String)?
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
  @State private var unsending: Unsending?
  /// A link tapped in a line, open in the browser sheet.
  @State private var browsing: OpenedLink?

  /// The lines read as the screen is made, by the reader last heard of,
  /// so they are there through the push that brings it in rather than
  /// arriving, oldest first, as it ends.
  init(
    place: ChatPlace, threadID: String, otherID: String?, sharing: Day? = nil,
    head: AnyView? = nil
  ) {
    self.place = place
    self.head = head
    self.threadID = threadID
    self.otherID = otherID
    self.sharing = sharing
    let me = GroupCalls.knownUserID
    _meID = State(initialValue: me)
    _chat = Fetch(
      wrappedValue: ChatRequest.Value(),
      ChatRequest(groupID: place.id, threadID: threadID, me: me))
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
  /// The photos opened large.
  @State private var viewing: PhotoViewing?
  /// Long lines opened at 続きを読む, which stay open while the chat is.
  @State private var unfolded: Set<String> = []
  /// Lines not sent being sent again, by the time each was written then:
  /// shown waiting from the tap while the outbox read still has them as
  /// they were, which sending again writes anew.
  @State private var sendingAgain: [String: Int64] = [:]
  /// Others writing now, each until their typing lapses.
  @State private var typers: [String: Date] = [:]
  /// The line whose reactions and menu are open.
  @State private var acting: MessageActionsRequest?
  /// The photos of the lines near those in sight, fetched ahead.
  @State private var photoPrefetch = PhotoPrefetch()
  /// Says others' lines as they come in, for VoiceOver.
  @State private var announcer = LineAnnouncer()
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
      latest: AnyView(
        LatestButton(scroll: scroll, unread: meID.map { state.unread(by: $0) } ?? 0) {
          toLatestOrUnread()
        }),
      scroll: scroll, proxy: scroller, following: $following,
      shown: placed, holds: acting != nil, canAskEarlier: opened && !state.atStart,
      onNearTop: { showEarlier(laidOut: $0) }, dayOver: { dayOver($0, in: listed) },
      replySwipe: { replySwipe(byID[$0]) },
      onReply: { id in
        if let line = answered(byID[id]) { reply(to: line) }
      },
      onNear: { prefetchPhotos(of: $0.compactMap { byID[$0] }) }
    )
    .background {
      ReadsSeen(
        scroll: scroll, reads: placed && scenePhase == .active,
        seq: { seen in latestSeq(of: seen, in: listed) }, read: { read(to: $0) })
    }
    // Going on under the composer and the keyboard, which SwiftUI keeps
    // at the chat's foot, the lines told how much of them is under there.
    .ignoresSafeArea(edges: .bottom)
    .onGeometryChange(for: CGFloat.self, of: { $0.safeAreaInsets.bottom }) { scroll.bottomRoom = $0 }
    .safeAreaBar(edge: .bottom) { composer }
    .overlay {
      // A place's head says what the chat is for in its place.
      if state.lines.isEmpty, state.waiting.isEmpty, head == nil {
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
          .comesAsNotice()
      }
    }
    .safeAreaBar(edge: .top, spacing: 0) {
      if place.rules.pins {
        PinBar(
          pins: chat.state.pins, open: $pinsOpen, nameOf: nameOf,
          onJump: jump(to:), onUnpin: { pin($0, on: false) })
      }
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
            } else if otherID == nil, place.group != nil {
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
        .accessibilityHint(titleHint)
      }
      ToolbarItem(placement: .primaryAction) {
        Menu("チャットのメニュー", systemImage: "ellipsis") {
          if otherID == nil, let group = place.group {
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
    // Lines waiting too long stop going by themselves, marked, even
    // while offline (spec/chat.md, Lines on their way).
    .task(id: state.waiting.filter { !$0.failed }.map(\.opID)) {
      while !Task.isCancelled {
        let now = Int64(Date.now.timeIntervalSince1970 * 1000)
        let next = try? await database.write { try Chats.failOverdue(of: place.id, now: now, in: $0) }
        guard let next = next ?? nil else { return }
        try? await Task.sleep(for: .milliseconds(max(next - now, 0)))
      }
    }
    .task(id: typers) {
      guard let next = typers.values.min() else { return }
      try? await Task.sleep(for: .seconds(max(next.timeIntervalSinceNow, 0)))
      withAnimation { typers = typers.filter { $0.value > .now } }
    }
    // A following chat keeps to its foot as lines come in and someone
    // writes, in the update they come in by (ChatLinesView's `landed`), as
    // it does for anything else changing the lines' height or the room
    // they are seen in (a link's page drawn, the composer growing, the
    // keyboard). Others' lines the reader has not read stop at ここから新着
    // instead, as the chat's catch-up bringing many at once.
    .onChange(of: state.lines.last?.seq) { before, _ in
      guard opened, following, let first = unreadComing(after: before) else { return }
      show(from: first)
    }
    // Others' lines coming in while it is open are said by VoiceOver,
    // wherever the lines are scrolled (spec/chat.md, VoiceOver).
    .onChange(of: state.lines.last?.seq) { before, _ in
      guard opened, scenePhase == .active, let before else { return }
      for line in chat.state.lines where line.seq > before {
        if let words = spoken(line) { announcer.heard(words) }
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
      Notifications.shared.openChat = OpenedChat(groupID: place.id, threadID: threadID)
      if !tookDraft {
        tookDraft = true
        takeDraft()
      }
      // As sharing into a chat app does: nothing reaches everyone until it
      // is sent, with a word if one likes.
      if let sharing, !tookSharing {
        tookSharing = true
        draft.attachedDays = [sharing]
      }
    }
    .onDisappear {
      announcer.stop()
      closeActions()
      keepDraft()
      photoPrefetch.stop()
      draft.stopTyping(in: threadID, socket: socket)
      if Notifications.shared.openChat?.threadID == threadID {
        Notifications.shared.openChat = nil
      }
    }
    .task(id: sharedSpan) {
      guard let span = sharedSpan else { return }
      _ = try? await $dayMembers.load(
        GroupMembersRequest(groupID: place.id, from: span.from, through: span.through))
    }
    .sheet(isPresented: $sharingDays) {
      ShareDaysSheet(
        groupID: place.id, people: otherID.map { Set([$0, meID ?? ""]) },
        pollable: otherID == nil && place.rules.polls, onSend: shareDays)
    }
    // As the app leaves the screen, what is written is kept, as Signal
    // and Telegram keep it then.
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { keepDraft() }
    }
    .photoViewer($viewing, groupID: place.id) { photo in
      await savePhoto(photo, in: place.id, calls: groupCalls)
    }
    .modifier(
      ReportAndBlock(
        groupID: place.id, groupName: place.name, groupMark: place.group?.mark ?? GroupMarkValue(),
        blocked: blocked,
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
      isPresented: Binding<Bool>($unsending),
      presenting: unsending
    ) { unsending in
      Button("キャンセル", role: .cancel) {}
      Button("取り消す", role: .destructive) {
        switch unsending {
        case .line(let line): unsend(line)
        case .waiting(let line): takeBack(line)
        }
      }
    } message: { unsending in
      // A line still on its way is not in anyone's chat yet.
      if case .waiting = unsending {
        Text("まだ送られていないメッセージです。")
      } else {
        Text("メンバー全員のチャットから消えます。")
      }
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
        .padding(.horizontal, 16)
        .frame(minHeight: Metrics.touch)
        .glassEffect(.regular, in: .capsule)
        .padding(8)
    } else {
      ChatComposer(
        draft: draft, groupID: place.id, threadID: threadID,
        mentionable: otherID != nil || !place.rules.mentions
          ? [] : chat.writers.filter { !$0.left && $0.userID != meID },
        nameOf: nameOf, quoteOf: quote(of:), onSubmit: submit,
        onStopEditing: stopEditing,
        onShareDays: place.rules.days ? { sharingDays = true } : nil, say: say)
    }
  }

  /// The lines' items, each with all its row draws, so a line is drawn
  /// again, and measured, only as that changes.
  private func rows(
    _ listed: [ChatItem], writers: [String], timeless: Set<String>, names: [String: String]
  ) -> [LinesRow] {
    let state = chat.state
    // What every line draws by: when it changes, every line is drawn again.
    let common = RowsLook(
      names: names, faces: faces, meID: meID, deleted: deletedIDs, members: cardMembers,
      left: Set(chat.writers.filter(\.left).map(\.userID)))
    let pins = Set(state.pins.map(\.seq))
    var rows: [LinesRow] = []
    // Only while the next earlier page is on its way from the server:
    // those the device holds are laid out before the top is reached.
    if !state.atStart, state.heldBefore == 0 {
      rows.append(LinesRow(id: ChatItemID.earlier, look: AnyHashable(ChatItemID.earlier)))
    }
    if state.atStart, head != nil {
      rows.append(LinesRow(id: ChatItemID.head, look: AnyHashable(ChatItemID.head)))
    }
    for item in listed {
      // An album's quote is its first photo's.
      let first = if case .album(let photos, _) = item { photos.first ?? item } else { item }
      var quote: LineQuote?
      if case .line(let line, _) = first {
        quote = line.replyTo.map(self.quote(of:))
      } else if case .waiting(let line, _) = first {
        quote = line.replyTo.map(self.quote(of:))
      }
      // What the line shows of the person's own choices: its writer
      // blocked, shown anyway, or opened at 続きを読む.
      var blockedWriter = false
      var shownAnyway = false
      var unfoldedLine = false
      if case .line(let line, _) = first {
        blockedWriter = blocked.contains(line.authorID)
        shownAnyway = shownBlocked.contains(line.seq)
        unfoldedLine = unfolded.contains(line.opID)
      }
      let look = RowLook(
        item: item, parted: item.startsRun && item.id != listed.first?.id,
        showsTime: !timeless.contains(item.id), pinned: item.seqs.filter(pins.contains),
        quote: quote,
        blockedWriter: blockedWriter, shownAnyway: shownAnyway, unfolded: unfoldedLine,
        common: common)
      rows.append(LinesRow(id: item.id, look: AnyHashable(look)))
    }
    for userID in writers {
      rows.append(LinesRow(id: ChatItemID.typing(userID), look: AnyHashable(common)))
    }
    return rows
  }

  /// The item `id` as the chat's lines draw it.
  @ViewBuilder private func lineRow(
    _ id: String, item: ChatItem?, first: String?, names: [String: String], showsTime: Bool
  ) -> some View {
    Group {
      if id == ChatItemID.earlier {
        EarlierLines()
      } else if id == ChatItemID.head {
        head
      } else if let userID = ChatItemID.typer(of: id) {
        TypingLine(name: memberName(userID, in: names), photoID: faces[userID] ?? "")
          .padding(.top, CGFloat(Chat.runGap - Chat.lineGap))
      } else if let item {
        // Lines close within a run, parted where the writer changes; the
        // first has the list's own margin over it.
        let parted = item.startsRun && item.id != first
        row(item, names: names, showsTime: showsTime)
          .padding(.top, parted ? CGFloat(Chat.runGap - Chat.lineGap) : 0)
      }
    }
  }

  // MARK: Lines

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
    var lines = state.lines.map { ChatItem.line($0, startsRun: false) }
    for var line in state.waiting {
      // Sent again: waiting from the tap, before the outbox is read again.
      if sendingAgain[line.opID] == line.madeAtMs { line.failed = false }
      lines.append(.waiting(line, startsRun: false))
    }
    // Photos sent at once as one item, by its first (spec/chat.md, Albums).
    var albumOf: [String: [ChatItem]] = [:]
    var inAlbums: Set<String> = []
    let byID = Dictionary(lines.map { ($0.id, $0) }) { first, _ in first }
    for album in albums(lines.compactMap(albumLine(of:))) {
      albumOf[album[0]] = album.compactMap { byID[$0] }
      inAlbums.formUnion(album.dropFirst())
    }
    for item in lines where !inAlbums.contains(item.id) {
      let photos = albumOf[item.id]
      // ここから新着 goes over the album it falls in.
      let unread = unreadFrom.map { from in (photos ?? [item]).contains { $0.seqs.contains(from) } }
        ?? false
      let starts: Bool
      let replies: Bool
      switch item {
      case .line(let line, _):
        starts = startsRun(
          at: line.sentAtMs, writer: line.unsent || line.notice != nil ? nil : line.authorID)
        replies = line.replyTo != nil
      case .waiting(let line, _):
        starts = startsRun(at: line.madeAtMs, writer: meID)
        replies = line.replyTo != nil
      default: continue
      }
      if unread {
        items.append(.unread)
      }
      // A reply starts a run, as its quote begins it.
      let runs = starts || unread || replies
      switch item {
      case _ where photos != nil: items.append(.album(photos ?? [], startsRun: runs))
      case .line(let line, _): items.append(.line(line, startsRun: runs))
      case .waiting(let line, _): items.append(.waiting(line, startsRun: runs))
      default: break
      }
    }
    return items
  }

  /// A line as albums are found by: still a photo while it shows one, not
  /// a line not shown or folded away.
  private func albumLine(of item: ChatItem) -> AlbumLine<String>? {
    switch item {
    case .line(let line, _):
      let shows = line.photo != nil && !line.unsent && !line.hidden && !folded(line)
      return AlbumLine(id: item.id, writer: line.authorID, album: line.album, photo: shows)
    case .waiting(let line, _):
      return AlbumLine(
        id: item.id, writer: meID ?? "", album: line.album, photo: line.photo != nil)
    default: return nil
    }
  }

  /// The lines whose time is left to the next (spec/chat.md, In a
  /// message): one going on the run of the line after it, sent in the
  /// same minute, as LINE shows one time for them.
  private func linesWithoutTime(_ items: [ChatItem]) -> Set<String> {
    var timeless: Set<String> = []
    for (item, next) in zip(items, items.dropFirst()) {
      guard let time = sentAt(item, last: true), let after = sentAt(next, last: false),
        !next.startsRun, ChatTime.clock(time) == ChatTime.clock(after)
      else { continue }
      timeless.insert(item.id)
    }
    return timeless
  }

  /// When a message the group took was sent, for its time to be left to
  /// the next: an album's by its `last` photo or its first; nil for what
  /// shows no time of its own (a notice, a line taken back or waiting).
  private func sentAt(_ item: ChatItem, last: Bool) -> Int64? {
    switch item {
    case .line(let line, _):
      line.unsent || line.notice != nil ? nil : line.sentAtMs
    case .album(let photos, _):
      (last ? photos.last : photos.first).flatMap { sentAt($0, last: last) }
    default: nil
    }
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
      // A heading, as the days are, for VoiceOver's rotor to go to.
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isHeader)
    case .line(let line, _) where line.hidden:
      // Never delivered to the reader: nothing shows.
      EmptyView()
    case .line(let line, _) where folded(line) && !line.unsent && line.notice == nil:
      BlockedLine { shownBlocked.insert(line.seq) }
    case .line(let line, let runStart):
      // A blocked member's line shown at a tap stands alone between the
      // folded ones, with their face, the way to their profile.
      let startsRun = runStart || writerBlocked(line)
      if let notice = line.notice {
        // A line from the app, as an unsent line sits: who did what, by
        // the names the group shows now.
        Text(
          notice.words(
            by: memberName(line.authorID, in: names),
            subject: memberName(notice.subjectID, in: names)))
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
        lineView(line, startsRun: startsRun, showsTime: showsTime, names: names)
      }
    case .waiting(let line, let startsRun):
      lineView(waiting: line, startsRun: startsRun, names: names)
    case .album(let photos, let startsRun):
      if let album = albumView(photos, startsRun: startsRun, showsTime: showsTime, names: names) {
        album
      }
    }
  }

  /// A line of words, as its row draws it and its bubble is held.
  private func lineView(
    _ line: ChatLineRow, startsRun: Bool, showsTime: Bool = true, names: [String: String]
  ) -> LineView {
    let mine = line.authorID == meID
    return LineView(
      lineID: line.opID, text: line.text, preview: line.preview, days: line.days,
      members: cardMembers, poll: pollLine(for: line), photo: line.photo,
      quote: line.replyTo.map(quote(of:)), unfolded: unfolded.contains(line.opID),
      groupID: place.id,
      shifts: line.poll ? nil : shifts(on: line.days.first),
      time: line.sentAtMs, showsTime: showsTime, edited: line.edited, mine: mine,
      writer: mine || !startsRun ? nil : names[line.authorID] ?? "",
      author: mine ? nil : memberName(line.authorID, in: names),
      menu: actions(for: line, mine: mine).map(\.title),
      writerPhoto: faces[line.authorID] ?? "",
      appFace: line.authorID == Chat.pochicalMember,
      named: !ofTwo, first: startsRun, waiting: false, names: names,
      reactions: line.reactions, countedReactions: ofTwo,
      pinned: chat.state.pins.contains { $0.seq == line.seq }, marks: marks, seq: line.seq,
      meID: meID,
      actions: lineActions)
  }

  /// A line still on its way, as its row draws it and its bubble is held.
  private func lineView(
    waiting line: WaitingLine, startsRun: Bool, names: [String: String]
  ) -> LineView {
    LineView(
      lineID: line.opID, text: line.text, preview: line.preview, days: line.days,
      members: cardMembers, poll: waitingPoll(line), photo: line.photo,
      quote: line.replyTo.map(quote(of:)), groupID: place.id, time: line.madeAtMs,
      edited: false, mine: true, writer: nil, menu: actions(forWaiting: line).map(\.title),
      named: false, first: startsRun, waiting: true, failed: line.failed, names: names,
      marks: marks,
      actions: lineActions)
  }

  /// Photos sent at once, drawn as one album: the line as its first
  /// photo's, with its last photo's time, and each photo its own line in
  /// it (spec/chat.md, Albums).
  private func albumView(
    _ photos: [ChatItem], startsRun: Bool, showsTime: Bool, names: [String: String]
  ) -> LineView?
  {
    var album: LineView
    switch photos.first {
    case .line(let line, _): album = lineView(line, startsRun: startsRun, names: names)
    case .waiting(let line, _): album = lineView(waiting: line, startsRun: startsRun, names: names)
    default: return nil
    }
    let pins = Set(chat.state.pins.map(\.seq))
    album.album = photos.compactMap { item in
      switch item {
      case .line(let line, _):
        line.photo.map { photo in
          AlbumPhoto(
            lineID: line.opID, photo: photo, time: line.sentAtMs, pinned: pins.contains(line.seq),
            seq: line.seq, menu: actions(for: line, mine: line.authorID == meID).map(\.title))
        }
      case .waiting(let line, _):
        line.photo.map { photo in
          AlbumPhoto(
            lineID: line.opID, photo: photo, time: line.madeAtMs, waiting: true,
            failed: line.failed, menu: actions(forWaiting: line).map(\.title))
        }
      default: nil
      }
    }
    let last = album.album.last
    album.photo = nil
    album.time = last?.time ?? album.time
    album.waiting = last?.waiting == true && last?.failed == false
    album.failed = false
    album.pinned = false
    album.seq = nil
    album.showsTime = showsTime
    album.menu = []
    return album
  }

  /// The line an item answers by a swipe: its own, or its album's first.
  private func answered(_ item: ChatItem?) -> ChatLineRow? {
    switch item {
    case .line(let line, _): line
    case .album(let photos, _): answered(photos.first)
    default: nil
    }
  }

  /// A line come in as VoiceOver says it: who and what, or the app's
  /// notice; nothing for one's own, one not shown, or a blocked writer's.
  private func spoken(_ line: ChatLineRow) -> String? {
    guard line.authorID != meID, !line.hidden, !line.unsent else { return nil }
    let name = nameOf(line.authorID)
    if let notice = line.notice {
      return notice.words(by: name, subject: nameOf(notice.subjectID))
    }
    guard !writerBlocked(line) else { return nil }
    let words =
      line.photo.map(photoWords)
      ?? lineWords(line.text, days: line.days, poll: line.poll, decided: line.decided, nameOf: nameOf)
    return "\(name)、\(words)"
  }

  /// A poll on its way: nothing voted yet.
  private func waitingPoll(_ line: WaitingLine) -> PollLine? {
    line.poll ? PollLine(votes: [], decided: nil, names: names, meID: meID, canDecide: true) : nil
  }

  /// Acts on the line `lineID` as the chat is now.
  private func act(_ action: LineAction, on lineID: String) {
    let id = ChatItemID.line(lineID)
    switch items(chat.state).first(where: { $0.lineIDs.contains(id) }) {
    case .line(let line, let startsRun): act(action, on: line, startsRun: startsRun)
    case .waiting(let line, let startsRun): act(action, onWaiting: line, startsRun: startsRun)
    case .album(let photos, _):
      if let photo = photos.first(where: { $0.id == id }) {
        act(action, on: photo, inAlbum: photos)
      }
    default: break
    }
  }

  /// Acts on one of an album's photos as its own line, but for reactions,
  /// which are the album's first line's (spec/chat.md, Albums); held, it
  /// lifts alone.
  private func act(_ action: LineAction, on photo: ChatItem, inAlbum photos: [ChatItem]) {
    let first: ChatLineRow? = if case .line(let line, _) = photos.first { line } else { nil }
    let index = photos.firstIndex { $0.id == photo.id } ?? 0
    switch (action, photo) {
    case (.react(let emoji), _):
      if let first { react(emoji, on: first) }
    case (.hold(let spot, let finger, _), .line(let line, _)):
      let mine = line.authorID == meID
      openActions(
        MessageActionsRequest(
          lineID: line.opID, spot: spot, mine: mine,
          bubble: albumBubble(line.photo, at: index, of: photos.count, waiting: false),
          finger: finger, reactions: first?.reactions, meID: meID,
          onReact: { emoji in first.map { react(emoji, on: $0) } },
          onMoreReactions: { reactingTo = first }, actions: actions(for: line, mine: mine)))
    case (.hold(let spot, let finger, _), .waiting(let line, _)):
      openActions(
        MessageActionsRequest(
          lineID: line.opID, spot: spot, mine: true,
          bubble: albumBubble(
            line.photo, at: index, of: photos.count, waiting: !line.failed),
          finger: finger, actions: actions(forWaiting: line)))
    case (_, .line(let line, _)):
      act(action, on: line, startsRun: false)
    case (_, .waiting(let line, _)):
      act(action, onWaiting: line, startsRun: false)
    default:
      break
    }
  }

  /// An album's photo lifted alone over the chat for its menu.
  private func albumBubble(_ photo: LinePhoto?, at index: Int, of count: Int, waiting: Bool)
    -> AnyView
  {
    guard let photo else { return AnyView(EmptyView()) }
    return AnyView(
      PhotoLine(
        photo: photo, groupID: place.id, waiting: waiting,
        cell: AlbumBox.size(of: index, in: count)
      )
      .clipShape(RoundedRectangle(cornerRadius: Radius.md)))
  }

  private func act(_ action: LineAction, on line: ChatLineRow, startsRun: Bool) {
    switch action {
    case .unfold:
      // Opened where it is, its words going on down from there, as the
      // messaging apps open a long one: not carried to the foot.
      following = false
      scroller.growDown(ChatItemID.line(line.opID))
      withAnimation(reduceMotion ? nil : .default) { _ = unfolded.insert(line.opID) }
    case .openPhoto:
      openPhoto(of: line)
    case .openQuote:
      line.replyTo.map(jump(to:))
    case .openProfile:
      profileOf = ProfileOf(
        id: line.authorID, name: nameOf(line.authorID),
        photoID: faces[line.authorID] ?? "")
    case .sendAgain, .deleteUnsent, .stopSending:
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
    case .menu(let title):
      actions(for: line, mine: line.authorID == meID).first { $0.title == title }?.run()
    case .hold(let spot, let finger, let link):
      let mine = line.authorID == meID
      let bubble = AnyView(lineView(line, startsRun: startsRun, names: names).bubble)
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
    case .sendAgain:
      sendAgain(line)
    case .deleteUnsent:
      takeBack(line)
    case .stopSending:
      stopSending(line)
    case .menu(let title):
      actions(forWaiting: line).first { $0.title == title }?.run()
    case .hold(let spot, let finger, _):
      openActions(
        MessageActionsRequest(
          lineID: line.opID, spot: spot, mine: true,
          bubble: AnyView(lineView(waiting: line, startsRun: startsRun, names: names).bubble),
          finger: finger, actions: actions(forWaiting: line)))
    default:
      break
    }
  }

  /// A line still on its way's menu: コピー for words, and 送信取消, which
  /// takes it back before it goes (spec/chat.md, Lines on their way).
  private func actions(forWaiting line: WaitingLine) -> [MessageAction] {
    let words = line.days.isEmpty && line.photo == nil
    var actions = words ? [copy(line.text)] : []
    actions.append(
      MessageAction(
        title: "送信取消", systemImage: "arrow.uturn.backward", destructive: true,
        startsGroup: words
      ) { unsending = .waiting(line) })
    return actions
  }

  // MARK: Composer

  /// Sends the tray's photos, each as its own line, kept on the device to
  /// upload before its line goes; two or more as one album, named by the
  /// first's send (spec/chat.md, Albums).
  private func sendPhotos() {
    let kept = draft.photos.filter {
      (try? ChatPhotos.keep($0.shrunk.jpeg, as: $0.id, in: place.id)) != nil
    }
    let album = kept.count > 1 ? UUID().uuidString.lowercased() : ""
    for (index, picked) in kept.enumerated() {
      var send = Pochical_V1_ChatSend()
      send.threadID = threadID
      send.photo = picked.shrunk.line(picked.id).wire
      send.replyTo = takeReply()
      send.album = album
      write(.send(send), as: index == 0 && !album.isEmpty ? album : nil)
    }
    withAnimation { draft.photos = [] }
  }

  /// Stops a line's photo going up: the line is not sent, its ! offering
  /// もう一度送る and 削除 (spec/chat.md, Photos).
  /// Nothing once its photo is up and the line is being sent.
  private func stopSending(_ line: WaitingLine) {
    if let photo = line.photo, !PhotoUploads.shared.stop(photo.id) { return }
    try? database.write { try Chats.fail(line.opID, in: $0) }
  }

  /// Sends a line not sent once more, after the rest, as if written now.
  /// A photo up before goes again from waiting its turn, × stopping it.
  private func sendAgain(_ line: WaitingLine) {
    if let photo = line.photo { PhotoUploads.shared.forget(photo.id) }
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    sendingAgain[line.opID] = line.madeAtMs
    do {
      try database.write { try Chats.sendAgain(line.opID, now: now, in: $0) }
    } catch {
      sendingAgain[line.opID] = nil
    }
  }

  /// Takes a line of one's own back before the group has it, or deletes
  /// one not sent, with the photo kept on the device for it: out of the
  /// outbox, and from the group as it comes should it have gone just
  /// before (spec/chat.md, Lines on their way).
  private func takeBack(_ line: WaitingLine) {
    try? database.write { try Chats.takeBack(line.opID, in: $0) }
    if let photo = line.photo {
      PhotoUploads.shared.forget(photo.id)
      ChatPhotos.forget(photo.id, in: place.id)
    }
  }

  // MARK: Drafts

  /// Puts the chat's draft back in the composer, with the chat's names as
  /// they are now for its mentions (spec/chat.md, Drafts).
  private func takeDraft() {
    let read = try? database.read { db in
      (
        draft: try Chats.draft(of: threadID, in: place.id, db: db),
        writers: try Chats.writers(in: place.id, db: db)
      )
    }
    guard let read, let kept = read.draft else { return }
    let names = read.writers.shownNames
    let nameOf = { (id: String) in memberName(id, in: names) }
    draft.text = plainText(kept.text, nameOf: nameOf)
    draft.picked = mentions(in: kept.text).map { PickedMember(id: $0, name: nameOf($0)) }
    draft.editing = kept.editing
    draft.replyTo = kept.editing == nil ? kept.replyTo : nil
    keptDraft = KeptDraft(text: kept.text, replyTo: kept.replyTo, editing: kept.editing?.seq)
    openedDraft = (shown: draft.text, sent: kept.text)
  }

  /// Keeps what is being written with the chat, as it is left and as the
  /// app leaves the screen; written only as it changed.
  private func keepDraft() {
    let unchanged = openedDraft.flatMap { $0.shown == draft.text ? $0.sent : nil }
    let kept = KeptDraft(
      text: unchanged ?? withMentions(draft.text, picked: draft.picked),
      replyTo: draft.replyTo, editing: draft.editing?.seq)
    guard kept != keptDraft else { return }
    keptDraft = kept
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    try? database.write { db in
      try Chats.keepDraft(kept, of: threadID, in: place.id, now: now, db: db)
    }
  }

  // MARK: Mentions

  /// Everyone who has been in the group by id, those who left too.
  private var names: [String: String] {
    chat.writers.shownNames
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

  /// The line's writer is blocked, in the place's own chat, where their
  /// lines fold away; a one-to-one chat with them shows all it has.
  private func writerBlocked(_ line: ChatLineRow) -> Bool {
    otherID == nil && blocked.contains(line.authorID)
  }

  /// The line is folded away for its blocked writer, not shown at a tap.
  private func folded(_ line: ChatLineRow) -> Bool {
    writerBlocked(line) && !shownBlocked.contains(line.seq)
  }

  /// A member's name in the group as it is now, for their mentions.
  private func nameOf(_ id: String) -> String {
    memberName(id, in: names)
  }

  /// A link tapped in a line: Pochical's invitations on their join
  /// screen, other pages in the browser sheet over the chat.
  private func open(_ url: URL) -> OpenURLAction.Result {
    if let mentioned = mentioned(by: url) {
      // The reader's own opens nothing.
      if mentioned != meID {
        profileOf = ProfileOf(
          id: mentioned, name: nameOf(mentioned), photoID: faces[mentioned] ?? "")
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
      ChatRequest(groupID: place.id, threadID: threadID, me: meID, from: window))
  }

  /// Lays out a page more of the earlier lines the device holds, at once,
  /// as the reader scrolls near the top. With none held, the page the
  /// server was asked for ahead (`askAhead`) is laid out as it arrives.
  /// Only once the lines read are those laid out (`laidOut`, the first in
  /// place), not while the page before them is still going in.
  private func showEarlier(laidOut: String?) {
    let state = chat.state
    guard opened, state.heldBefore > 0, let line = state.lines.first, line.seq != earlierFrom,
      laidOut == ChatItemID.line(line.opID)
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
    // With nothing new, the lines are laid out at the latest already. With
    // something, once the lines are laid out, ここから新着 goes to the top,
    // shown only once there rather than after a trip.
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
    scroller.show(itemID(of: first), at: .top, animated: true) {
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

  /// The latest of the group's lines among the items `seen` of those
  /// `listed`, an album's lines all with it, nil for none (lines still
  /// waiting have no seq).
  private func latestSeq(of seen: [String], in listed: [ChatItem]) -> Int64? {
    let ids = Set(seen)
    return listed.lazy.filter { ids.contains($0.id) }.flatMap(\.seqs).max()
  }

  /// The item the chat draws `line` in: its own, or its album.
  private func itemID(of line: ChatLineRow) -> String {
    let id = ChatItemID.line(line.opID)
    return items(chat.state).first { $0.lineIDs.contains(id) }?.id ?? id
  }

  /// Marks the chat read on to `seq`, the latest line whose foot has come
  /// on screen, never back (spec/vectors/chat.json, readTo).
  private func read(to seq: Int64) {
    guard let me = meID else { return }
    let before = chat.state.lastRead(by: me)
    let mark = readTo(shown: [seq], read: before)
    guard mark > before else { return }
    var read = Pochical_V1_ChatRead()
    read.threadID = threadID
    read.lastReadSeq = UInt64(mark)
    write(.read(read))
    // The notifications of the lines read go too, as on the user's other
    // devices when the server tells them.
    let groupID = place.id
    Task { await Notifications.shared.withdraw(in: groupID, threadID, readTo: mark) }
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

  /// Fetches ahead the photos of the lines near those in sight, as their
  /// lines draw them, and lets go of the rest: not a blocked member's
  /// folded away.
  private func prefetchPhotos(of near: [ChatItem]) {
    let lines = near.flatMap { item in
      if case .album(let photos, _) = item { photos } else { [item] }
    }
    let photos = lines.compactMap { item -> LinePhoto? in
      switch item {
      case .line(let line, _):
        return line.hidden || line.unsent || folded(line) ? nil : line.photo
      case .waiting(let line, _): return line.photo
      default: return nil
      }
    }
    photoPrefetch.near(photos, in: place.id, scale: displayScale, calls: groupCalls)
  }

  /// The line's photo opened large among the chat's: those its lines laid
  /// out show at once, and the rest a page at a time from the group (not a
  /// blocked member's folded away, as the group leaves them out too).
  private func openPhoto(of line: ChatLineRow) {
    guard let photo = line.photo else { return }
    guard let tapped = ChatPhotoItem(line, blocked: []) else {
      viewing = PhotoViewing(photo)
      return
    }
    let held = chat.state.lines.compactMap { ChatPhotoItem($0, blocked: blocked) }
    let pager = PhotoPager(
      placeID: place.id, threadID: threadID, sockets: groupSockets, account: account,
      database: database, blocked: blocked)
    viewing = PhotoViewing(tapped, among: held, pager: pager)
    viewing?.names = names
  }

  /// Saves a photo to the person's library, and says so.
  private func save(_ photo: LinePhoto) {
    Task {
      if await savePhoto(photo, in: place.id, calls: groupCalls) {
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
    notifications.isMuted(threadID, in: place.id)
  }

  /// What a tap on the title opens, as VoiceOver says it: nothing for the
  /// chat with Pochical's people.
  private var titleHint: String {
    if otherID != nil { return "押すとプロフィール" }
    return place.group == nil ? "" : "押すとグループの設定"
  }

  /// A chat of two, a one-to-one chat or the chat with Pochical's people:
  /// no names over the lines, and a reaction's count without faces.
  private var ofTwo: Bool {
    otherID != nil || place.group == nil
  }

  /// The other member's name, or the group's (/design's ChatTitle).
  private var title: String {
    otherID.flatMap { names[$0] } ?? place.name
  }

  /// みんなのシフト on a shared day, in a group.
  private func shifts(on day: Day?) -> GroupRoute? {
    guard let group = place.group, let day else { return nil }
    return .shifts(group, day: day)
  }

  /// The group's settings from 全体チャット's title, the other member's
  /// profile from a one-to-one chat's.
  private func openTitle() {
    guard let otherID else {
      if let group = place.group {
        openGroupRoute(.settings(group))
      }
      return
    }
    profileOf = ProfileOf(
      id: otherID, name: nameOf(otherID), photoID: faces[otherID] ?? "")
  }

  /// The one-to-one chat with someone, from their profile; none for the
  /// one open already.
  private func message(_ person: ProfileOf) -> (() -> Void)? {
    guard person.id != otherID, let meID, let group = place.group else { return nil }
    return {
      openGroupRoute(.chat(group, thread: directThread(meID, person.id), with: person.id))
    }
  }

  /// Turns this chat's notifications off or on, and says so.
  private func setMuted(_ muted: Bool) {
    Task {
      do {
        try await groupCalls.setChatMuted(threadID, in: place.id, muted: muted)
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
    let text = sentWords(draft.field.commit())
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

  /// How a line is dragged to reply to it (spec/chat.md, Replies): any
  /// line the menu has 返信 on, from its writer's side; not the app's
  /// notices, a line taken back or folded for a blocked writer, nor one
  /// still on its way.
  private func replySwipe(_ item: ChatItem?) -> ReplySwipe? {
    guard let line = answered(item), !line.hidden, !line.unsent, line.notice == nil,
      !folded(line)
    else { return nil }
    return line.authorID == meID ? .leftward : .rightward
  }

  /// Answers a line (返信): quoted over the composer until sent or ×.
  private func reply(to line: ChatLineRow) {
    if draft.editing != nil { stopEditing() }
    withAnimation { draft.replyTo = line.seq }
    draft.field.focus()
  }

  /// The line being answered, for the first line sent: then no more.
  private func takeReply() -> UInt64 {
    defer { draft.replyTo = nil }
    return draft.replyTo.map(UInt64.init) ?? 0
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
    let writer = nameOf(line.authorID)
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
    if place.rules.pins {
      actions.append(
        MessageAction(
          title: pinned ? "ピン留めを外す" : "ピン留め", systemImage: pinned ? "pin.slash" : "pin"
        ) { pin(line.seq, on: !pinned) })
    }
    if mine, words, place.rules.edit {
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
        ) { unsending = .line(line) })
    } else if place.rules.reports {
      // Last, apart and in the danger color (spec/chat.md).
      actions.append(
        MessageAction(
          title: "通報", systemImage: "exclamationmark.bubble", destructive: true,
          startsGroup: true
        ) { reporting = .line(line, writer: nameOf(line.authorID)) })
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

  /// Says a save or a copy is done, felt as well as said: what it made
  /// happens out of sight, in Photos or on the clipboard.
  private func sayDone(_ words: String) {
    done += 1
    say(words)
  }

  /// Says `words` over the lines for a moment, as a toast does.
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
      // Rung once there, not on the way; by itself, as this task ends
      // with the line gone to.
      scroller.show(itemID(of: line), at: .center, animated: true) {
        marks.ringed = target
        Task { @MainActor in
          try? await Task.sleep(for: .milliseconds(500))
          withAnimation(.easeOut(duration: 0.7)) { marks.ringed = nil }
        }
      }
    } else if !state.atStart {
      // Gone to a line before those laid out: on back a page at a time.
      showEarlier(laidOut: state.lines.first.map { ChatItemID.line($0.opID) })
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

  /// Puts an edit in the outbox, as `opID` when it names an album.
  private func write(_ kind: Pochical_V1_ChatEdit.OneOf_Kind, as opID: String? = nil) {
    let kind = AppDevice.stamped(kind, in: place.id)
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    try? database.write { db in
      if let opID {
        try Chats.edit(kind, in: place.id, now: now, opID: opID, db: db)
      } else {
        try Chats.edit(kind, in: place.id, now: now, db: db)
      }
    }
  }
}

/// A line of one's own whose 送信取消 is being asked: sent, or still on
/// its way.
private enum Unsending {
  case line(ChatLineRow)
  case waiting(WaitingLine)
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
  /// Its lines pinned, by seq.
  let pinned: [Int64]
  let quote: LineQuote?
  let blockedWriter: Bool
  let shownAnyway: Bool
  let unfolded: Bool
  let common: RowsLook
}

/// When the server is asked for the page before the lines held: as the
/// first held changes, while fewer than a page are held before the lines
/// laid out.
private struct PageAhead: Hashable {
  let from: Int64?
  let short: Bool
}

/// Reads the chat on to the latest line whose foot is on the screen, as
/// the person scrolls through them (Signal's and Telegram's), as lines
/// come and as the app comes back; once they have stayed a moment, so a
/// fling reads once where it stops, and lines just come in are laid out.
private struct ReadsSeen: View {
  let scroll: ChatScroll
  /// The lines are shown where the chat opens, and the app is in front.
  let reads: Bool
  let seq: ([String]) -> Int64?
  let read: (Int64) -> Void

  var body: some View {
    let seen = reads ? seq(scroll.seen) : nil
    Color.clear
      .task(id: ReadKey(shown: reads, seen: seen ?? 0)) {
        guard let seen else { return }
        try? await Task.sleep(for: .milliseconds(100))
        if !Task.isCancelled { read(seen) }
      }
  }
}

