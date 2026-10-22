import Nuke
import PochicalDesign
import PochicalKit
import PhotosUI
import PochicalProto
import SQLiteData
import SwiftUI
import SwiftUINavigation
import UIKit

/// A chat of a place (/design's ChatScreen): a group's 全体チャット or a
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
  @Environment(\.groupSockets) private var groupSockets
  /// The reader as the session keeps them.
  @Environment(\.meID) private var signedIn
  /// The socket said under the title, once it has stayed not current for
  /// a moment (spec/chat.md): the lines shown may not be all there is.
  @State private var syncSaid = SyncStatus.current
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.openGroupRoute) private var openGroupRoute
  @Environment(\.rootNavigator) private var navigator
  @Dependency(\.defaultDatabase) private var database
  @Environment(\.write) private var write
  /// The chat, read by this screen alone while it is there.
  @State private var feed: ChatFeed
  private var chat: ChatRequest.Value { feed.value }
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
  /// Changed only by `layOut(from:)`, which reads the lines again for it.
  @State private var window: Int64?
  /// The device's time the lines not sent are read by, later as the next
  /// line still being sent stops going by itself.
  @State private var now = ChatTime.nowMs
  /// The first line laid out as the page before it was last laid out, so a
  /// page is laid out once as the top nears, not at each scroll.
  @State private var earlierFrom: Int64?
  /// The last line laid out as the page after it was last asked, so that
  /// page is asked once as the foot nears, not at each scroll.
  @State private var laterThrough: Int64?
  /// How many times the socket has opened again after a drop: the pages
  /// asked of the server are asked again, their answers maybe lost.
  @State private var reopened = 0
  /// What is being written, read by the composer alone.
  @State private var draft = ChatDraft()
  @State private var unsending: Unsending?
  /// A link tapped in a line, open in the browser sheet.
  @State private var browsing: OpenedLink?

  /// The lines read as the screen first draws, by the reader last heard
  /// of, so they are there through the push that brings it in rather than
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
    let me = widgetMeID()
    _meID = State(initialValue: me)
    _feed = State(
      initialValue: ChatFeed(
        ChatRequest(groupID: place.id, threadID: threadID, me: me, now: ChatTime.nowMs)))
  }
  /// All the pins open under the bar.
  @State private var pinsOpen = false
  /// A pinned line being gone to, its earlier lines asked for until held.
  @State private var jumpTarget: Int64?
  /// The line gone to, ringed for a moment, and the line lifted while its
  /// menu is open.
  @State private var marks = LineMarks()
  /// What a pin did, said for a moment over the lines.
  @State private var notice = ChatNotice()
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
    ChatStage(
      rows: rows(listed, writers: writers, timeless: timeless, names: names),
      row: { id in
        AnyView(
          lineRow(
            id, item: byID[id], first: listed.first?.id, names: names,
            showsTime: !timeless.contains(id)))
      },
      top: AnyView(top),
      latest: AnyView(
        LatestButton(
          scroll: scroll, unread: meID.map { state.unread(by: $0) } ?? 0, atEnd: state.atEnd
        ) {
          toLatestOrUnread()
        }),
      composer: AnyView(composer),
      empty: AnyView(empty),
      scroll: scroll, proxy: scroller, following: $following,
      shown: placed, holds: acting != nil, dayOver: { dayOver($0, in: listed) },
      replySwipe: { replySwipe(byID[$0]) },
      onReply: { id in
        if let line = answered(byID[id]) { reply(to: line) }
      },
      menu: acting, onHold: { act(.hold(link: $1), on: $0) }, onMenuClosed: menuClosed,
      onNear: { prefetchPhotos(of: $0.compactMap { byID[$0] }) }
    )
    // A line gone from the chat (taken back by its writer) takes its
    // open menu with it, the stage fading its bubble as it goes; the
    // lines laid out keep it meanwhile (`holds`).
    .onChange(
      of: acting.map { acting in
        state.lines.contains { $0.opID == acting.lineID && $0.content != .unsent }
      }
    ) {
      _, there in
      if there == false { acting = nil }
    }
    .background {
      ReadsSeen(
        scroll: scroll, reads: placed && scenePhase == .active,
        seq: { seen in latestSeq(of: seen, in: listed) }, read: { read(to: $0) })
      PagesNear(
        scroll: scroll,
        lines: LinesHeld(
          opened: opened, before: state.heldBefore, atStart: state.atStart, atEnd: state.atEnd)
      ) { near in
        if let top = near.top { showEarlier(laidOut: top) }
        if let foot = near.foot { askLater(laidOut: foot) }
      }
    }
    // The whole screen, the keyboard's room too: the lines go on under the
    // header, as iOS 26's lists go under their bars (its edge effect
    // setting it off), and the stage itself stands the composer on the
    // keyboard.
    .ignoresSafeArea()
    .sensoryFeedback(.success, trigger: done)
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
        short: chat.state.heldBefore < Chat.pageSize, reopened: reopened)
    ) {
      await askAhead()
    }
    // The page after the lines laid out, as their foot nears, while they
    // stop short of the latest (past a gap the catch-up left).
    .task(
      id: PageAfter(
        through: opened && !chat.state.atEnd ? laterThrough : nil, reopened: reopened)
    ) {
      await askAfter()
    }
    .background(colors.backgroundBase)
    .environment(\.memberFaces, faces)
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.visible, for: .navigationBar)
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
          }
          Button("写真", systemImage: "photo.on.rectangle") {
            navigator?.open(
              .photos(PhotosOfChat(placeID: place.id, threadID: threadID, names: names)))
          }
          Divider()
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
      // Once: shown again, after a photo opened large over it or a page
      // pushed over it, the chat stays where it was.
      guard !opened else { return }
      // Opens at once on the lines the device holds, as the messaging apps
      // do; lines the group's catch-up still brings come in under them.
      await open()
    }
    // Read again for the reader the session says, should it change.
    .onChange(of: signedIn) { _, reader in
      guard reader != meID else { return }
      meID = reader
      Task { await reload() }
    }
    // The chat is read while the screen is shown, and stops as it goes.
    .task { await feed.follow() }
    // The socket's status, said once it has not been current for
    // statusShownAfterMs, and gone as soon as it is.
    .task(id: place.id) {
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
    .task(id: place.id) {
      for await _ in await socket.statuses().reopenings() { reopened += 1 }
    }
    // Others' typing, as it comes, each shown until it lapses.
    .task(id: place.id) {
      for await typing in await socket.typing() where typing.threadID == threadID {
        withAnimation {
          typers[typing.userID] = typing.on ? Date.now.addingTimeInterval(
            Double(Chat.typingShowMs) / 1000) : nil
        }
      }
    }
    // A line still being sent shows not sent the moment its wait is over,
    // even while offline (spec/chat.md, Lines on their way).
    .task(id: state.failsAt) {
      guard let at = state.failsAt else { return }
      await ChatTime.sleep(until: at)
      guard !Task.isCancelled else { return }
      now = ChatTime.nowMs
      await reload()
    }
    .task(id: typers) {
      guard let next = typers.values.min() else { return }
      try? await Task.sleep(for: .seconds(max(next.timeIntervalSinceNow, 0)))
      withAnimation { typers = typers.filter { $0.value > .now } }
    }
    // A following chat keeps to its foot as lines come in and someone
    // writes, in the update they come in by (ChatStage's `landed`), as
    // it does for anything else changing the lines' height or the room
    // they are seen in (a link's page drawn, the composer growing, the
    // keyboard). Others' lines the reader has not read stop at ここから新着
    // instead, as the chat's catch-up bringing many at once. Lines laid
    // out again from elsewhere (`layOut`) have not come in: where those go
    // is said by what laid them out.
    .onChange(of: LinesEnds(first: state.lines.first?.seq, last: state.lines.last?.seq)) {
      before, now in
      guard opened, following, before.first == now.first,
        let first = unreadComing(after: before.last)
      else { return }
      show(from: first)
    }
    // Others' lines coming in while it is open are said by VoiceOver,
    // wherever the lines are scrolled (spec/chat.md, VoiceOver).
    .onChange(of: LinesEnds(first: state.lines.first?.seq, last: state.lines.last?.seq)) {
      seen, now in
      guard opened, scenePhase == .active, seen.first == now.first, let before = seen.last
      else { return }
      for line in chat.state.lines where line.seq > before {
        if let words = spoken(line) { announcer.heard(words) }
      }
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
      menuClosed()
      keepDraft(leaving: true)
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
    // As the app leaves the screen, what is written is kept at once,
    // without waiting for the writing to pause.
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { keepDraft(leaving: true) }
    }
    .photoViewer($viewing, shelf: place.shelf, onSave: { photo in
      await savePhoto(photo, in: place.shelf, calls: groupCalls)
    })
    .modifier(
      ReportAndBlock(
        groupID: place.id, groupName: place.name, groupMark: place.group?.mark ?? GroupMarkValue(),
        blocked: blocked,
        reporting: $reporting, profileOf: $profileOf, blockQuestion: $blockQuestion,
        onMessage: message(_:), onReported: reported, onSetBlocked: setBlocked))
    .sheet(item: $deciding) { line in
      if case .poll(let poll) = line.content {
        DecidePollSheet(days: poll.days, votes: poll.votes, decided: poll.decided) { day in
          decide(line, on: day)
        }
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

  /// Over the lines' top, under the header: the pins, floating over the
  /// lines, which go on under them and stay where they are as the pins
  /// come, go or open; and hanging under the pins, the day of the lines at
  /// the top and what a pin did, not taking any room of their own.
  private var top: some View {
    VStack(spacing: 0) {
      if place.rules.pins {
        PinBar(
          pins: chat.state.pins, open: $pinsOpen, nameOf: nameOf,
          onJump: jump(to:), onUnpin: { pin($0, on: false) })
      }
    }
    .frame(maxWidth: .infinity)
    .overlay(alignment: .bottom) {
      UnderPins(scroll: scroll, notice: notice)
        .frame(height: 0, alignment: .top)
    }
  }

  /// What the lines' room says while there are none yet; a place's head
  /// says what the chat is for in its place instead.
  @ViewBuilder private var empty: some View {
    if chat.state.lines.isEmpty, chat.state.waiting.isEmpty, head == nil {
      Text("まだメッセージはありません")
        .font(.footnote)
        .foregroundStyle(colors.textQuaternary)
    }
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
        draft: draft, place: place, threadID: threadID,
        mentionable: otherID != nil || !place.rules.mentions
          ? [] : chat.writers.filter { !$0.left && $0.userID != meID },
        nameOf: nameOf, quoteOf: quote(of:), onSubmit: submit,
        onStopEditing: stopEditing, keepDraft: { keepDraft() },
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
      var quote: LineQuote?
      if case .line(let line, _) = item {
        quote = line.replyTo.map(self.quote(of:))
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
        showsTime: !timeless.contains(item.id), pinned: item.seq.map(pins.contains) ?? false,
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
    let waiting = state.waiting.map { line in
      var line = line
      // Sent again: waiting from the tap, before the outbox is read again.
      if sendingAgain[line.opID] == line.madeAtMs { line.failed = false }
      return line
    }
    // A line still being sent last, one not sent where it was written
    // (spec/chat.md, Lines on their way).
    let lines = chatOrder(
      sent: state.lines.map { TimedLine(id: ChatItem.line($0, startsRun: false), at: $0.sentAtMs) },
      waiting: waiting.map {
        TimedLine(id: ChatItem.waiting($0, startsRun: false), at: $0.madeAtMs, failed: $0.failed)
      })
    for item in lines {
      let unread = unreadFrom != nil && item.seq == unreadFrom
      let starts: Bool
      let replies: Bool
      switch item {
      case .line(let line, _):
        starts = startsRun(
          at: line.sentAtMs, writer: isMessage(line) ? line.authorID : nil)
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
      case .line(let line, _): items.append(.line(line, startsRun: runs))
      case .waiting(let line, _): items.append(.waiting(line, startsRun: runs))
      default: break
      }
    }
    return items
  }

  /// The lines whose time is left to the next (spec/chat.md, In a
  /// message): one going on the run of the line after it, sent in the
  /// same minute, as LINE shows one time for them.
  private func linesWithoutTime(_ items: [ChatItem]) -> Set<String> {
    var timeless: Set<String> = []
    for (item, next) in zip(items, items.dropFirst()) {
      guard let time = sentAt(item), let after = sentAt(next),
        !next.startsRun, ChatTime.clock(time) == ChatTime.clock(after)
      else { continue }
      timeless.insert(item.id)
    }
    return timeless
  }

  /// When a message the group took was sent, for its time to be left to
  /// the next; nil for what shows no time of its own (a notice, a line
  /// taken back or waiting).
  private func sentAt(_ item: ChatItem) -> Int64? {
    guard case .line(let line, _) = item, isMessage(line) else { return nil }
    return line.sentAtMs
  }

  /// A line someone wrote, not one the chat words itself: a notice, or
  /// a line taken back, which sits apart from the runs of messages.
  private func isMessage(_ line: ChatLineRow) -> Bool {
    switch line.content {
    case .words, .photos, .days, .poll, .hidden: true
    case .notice, .unsent: false
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
    case .line(let line, let runStart):
      switch line.content {
      case .hidden:
        // Never delivered to the reader: nothing shows.
        EmptyView()
      case .notice(let notice):
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
      case .unsent:
        Text(
          unsentLine(
            names[line.authorID], mine: line.authorID == meID,
            deleted: deletedIDs.contains(line.authorID)))
          .font(.caption)
          .foregroundStyle(colors.textTertiary)
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
      case .words, .photos, .days, .poll:
        if folded(line) {
          BlockedLine { shownBlocked.insert(line.seq) }
        } else {
          // A blocked member's line shown at a tap stands alone between
          // the folded ones, with their face, the way to their profile.
          lineView(
            line, startsRun: runStart || writerBlocked(line), showsTime: showsTime, names: names)
        }
      }
    case .waiting(let line, let startsRun):
      lineView(waiting: line, startsRun: startsRun, names: names)
    }
  }

  /// A line of words, as its row draws it and its bubble is held.
  private func lineView(
    _ line: ChatLineRow, startsRun: Bool, showsTime: Bool = true, names: [String: String]
  ) -> LineView {
    let mine = line.authorID == meID
    let table: GroupRoute? =
      if case .days(let days) = line.content { shifts(on: days.first) } else { nil }
    return LineView(
      lineID: line.opID, content: line.content, members: cardMembers,
      canDecide: canDecide(line),
      quote: line.replyTo.map(quote(of:)), unfolded: unfolded.contains(line.opID),
      shelf: place.shelf, shifts: table,
      time: line.sentAtMs, showsTime: showsTime, mine: mine,
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
      lineID: line.opID, content: line.content, members: cardMembers, canDecide: true,
      up: line.up, quote: line.replyTo.map(quote(of:)), shelf: place.shelf, time: line.madeAtMs,
      mine: true, writer: nil, menu: actions(forWaiting: line).map(\.title),
      named: false, first: startsRun, waiting: true, failed: line.failed, names: names,
      marks: marks, meID: meID,
      actions: lineActions)
  }

  /// The line an item answers by a swipe.
  private func answered(_ item: ChatItem?) -> ChatLineRow? {
    if case .line(let line, _) = item { line } else { nil }
  }

  /// A line come in as VoiceOver says it: who and what, or the app's
  /// notice; nothing for one's own, one not shown, or a blocked writer's.
  private func spoken(_ line: ChatLineRow) -> String? {
    guard line.authorID != meID else { return nil }
    let name = nameOf(line.authorID)
    let words: String
    switch line.content {
    case .hidden, .unsent:
      return nil
    case .notice(let notice):
      return notice.words(by: name, subject: nameOf(notice.subjectID))
    case .photos(let photos):
      words = photoWords(photos)
    case .words, .days, .poll:
      words = lineWords(line.content, nameOf: nameOf)
    }
    guard !writerBlocked(line) else { return nil }
    return "\(name)、\(words)"
  }

  /// Acts on the line `lineID` as the chat is now.
  private func act(_ action: LineAction, on lineID: String) {
    let id = ChatItemID.line(lineID)
    switch items(chat.state).first(where: { $0.id == id }) {
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
      scroller.growDown(ChatItemID.line(line.opID))
      withAnimation(reduceMotion ? nil : .default) { _ = unfolded.insert(line.opID) }
    case .openPhoto(let index):
      openPhoto(PhotoKey(seq: line.seq, index: index), of: line)
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
      keep(.vote(vote))
    case .decide:
      deciding = line
    case .menu(let title):
      actions(for: line, mine: line.authorID == meID).first { $0.title == title }?.run()
    case .hold(let link):
      let mine = line.authorID == meID
      let bubble = AnyView(lineView(line, startsRun: startsRun, names: names).bubble)
      // A link held has its own menu, without the reactions.
      if let link {
        openActions(
          MessageActionsRequest(
            lineID: line.opID, mine: mine, bubble: bubble,
            actions: linkActions(link, open: { _ = open(link) }, copied: { sayDone("コピーしました") })))
      } else {
        openActions(
          MessageActionsRequest(
            lineID: line.opID, mine: mine, bubble: bubble,
            reactions: line.reactions, meID: meID,
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
    case .hold:
      openActions(
        MessageActionsRequest(
          lineID: line.opID, mine: true,
          bubble: AnyView(lineView(waiting: line, startsRun: startsRun, names: names).bubble),
          actions: actions(forWaiting: line)))
    default:
      break
    }
  }

  /// A line still on its way's menu: コピー for words, and 送信取消, which
  /// takes it back before it goes (spec/chat.md, Lines on their way).
  private func actions(forWaiting line: WaitingLine) -> [MessageAction] {
    var actions: [MessageAction] = []
    if let words = line.content.words {
      actions.append(copy(words.text))
    }
    actions.append(
      MessageAction(
        title: "送信取消", systemImage: "arrow.uturn.backward", destructive: true,
        startsGroup: !actions.isEmpty
      ) { unsending = .waiting(line) })
    return actions
  }

  // MARK: Composer

  /// Sends the tray's photos as one line, kept on the device to upload
  /// before it goes; two or more drawn as one album (spec/chat.md,
  /// Albums).
  private func sendPhotos() -> Bool {
    let photos = draft.photos
    guard !photos.isEmpty else { return true }
    let shelf = place.shelf
    var send = Pochical_V1_ChatSend()
    send.threadID = threadID
    send.content.photos.photos = photos.map { $0.shrunk.line($0.id).wire }
    guard
      write.keeping({
        for photo in photos {
          try ChatPhotos.keep(photo.shrunk.jpeg, as: photo.id, in: shelf)
        }
      }), sent(send)
    else {
      for photo in photos {
        ChatPhotos.forget(photo.id, in: shelf)
      }
      return false
    }
    draft.photos = []
    return true
  }

  /// Stops a line's photos going up: the line is not sent, its ! offering
  /// もう一度送る and 削除 (spec/chat.md, Photos).
  /// Nothing once its photos are up and the line is being sent.
  private func stopSending(_ line: WaitingLine) {
    if !line.content.photos.isEmpty, !PhotoUploads.shared.stop(line.opID) { return }
    write { try Chats.fail(line.opID, in: $0) }
  }

  /// Sends a line not sent once more, after the rest, as if written now.
  /// Its photos not up go again from waiting their turn, × stopping it.
  private func sendAgain(_ line: WaitingLine) {
    PhotoUploads.shared.forget(line.opID, photos: line.content.photos.map(\.id))
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    sendingAgain[line.opID] = line.madeAtMs
    if !write({ try Chats.sendAgain(line.opID, now: now, in: $0) }) {
      sendingAgain[line.opID] = nil
    }
  }

  /// Takes a line of one's own back before the group has it, or deletes
  /// one not sent, with the photo kept on the device for it: out of the
  /// outbox, and from the group as it comes should it have gone just
  /// before (spec/chat.md, Lines on their way).
  private func takeBack(_ line: WaitingLine) {
    guard write({ try Chats.takeBack(line.opID, in: $0) }) else { return }
    PhotoUploads.shared.forget(line.opID, photos: line.content.photos.map(\.id))
    for photo in line.content.photos {
      ChatPhotos.forget(photo.id, in: place.shelf)
    }
  }

  // MARK: Drafts

  /// Puts the chat's draft back in the composer, with the chat's names as
  /// they are now for its mentions (spec/chat.md, Drafts).
  private func takeDraft() {
    let read = try? database.read { try Chats.draft(of: threadID, in: place.id, db: $0) }
    guard let kept = read ?? nil else { return }
    let names = names
    let nameOf = { (id: String) in memberName(id, in: names) }
    draft.text = plainText(kept.text, nameOf: nameOf)
    draft.picked = mentions(in: kept.text).map { PickedMember(id: $0, name: nameOf($0)) }
    draft.target = kept.target
    keptDraft = KeptDraft(text: kept.text, target: kept.target?.map(\.seq))
    openedDraft = (shown: draft.text, sent: kept.text)
  }

  /// Keeps what is being written with the chat, the one place a chat's
  /// draft is written: as the composer changes, as the chat is left and as
  /// the app leaves the screen; written only as it changed, and not before
  /// the chat's draft is back in the composer. One not kept while the
  /// composer still holds it is tried again as it next changes, quietly;
  /// said as the chat or the app is left, when the words would go.
  private func keepDraft(leaving: Bool = false) {
    guard tookDraft else { return }
    var kept = draft.kept
    if let opened = openedDraft, opened.shown == draft.text { kept.text = opened.sent }
    guard kept != keptDraft else { return }
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    let keeping = leaving ? write : WriteAction {}
    if keeping({ try Chats.keepDraft(kept, of: threadID, in: place.id, now: now, db: $0) }) {
      keptDraft = kept
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

  /// Reads the chat again for the reader and the lines laid out.
  private func reload() async {
    await feed.load(
      ChatRequest(groupID: place.id, threadID: threadID, me: meID, from: window, now: now))
  }

  /// Lays the lines out from `first` on, read again at once. Nil lays
  /// them out as the chat opens and then keeps them from where those
  /// begin, so that later lines add to them, past a gap too, rather than
  /// swap them for the latest.
  private func layOut(from first: Int64?) async {
    window = first
    await reload()
    guard first == nil, let begun = chat.state.lines.first?.seq else { return }
    window = begun
    await reload()
  }

  /// Lays out a page more of the earlier lines the device holds, at once,
  /// as the reader scrolls near the top (ChatScroll.near). With none held,
  /// the page the server was asked for ahead (`askAhead`) is laid out as it
  /// arrives.
  /// Only once the lines read are those laid out (`laidOut`, the first in
  /// place), not while the page before them is still going in.
  private func showEarlier(laidOut: String?) {
    let state = chat.state
    guard opened, state.heldBefore > 0, let line = state.lines.first, line.seq != earlierFrom,
      laidOut == ChatItemID.line(line.opID)
    else { return }
    let first = line.seq
    earlierFrom = first
    let from = max(first - Int64(Chat.pageSize), state.heldFrom ?? 1)
    Task { await layOut(from: from) }
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
    while !Task.isCancelled, await socket.requestPage(of: threadID, before: from) != true {
      try? await Task.sleep(for: .seconds(1))
    }
  }

  /// The page after the lines laid out is to be asked as their foot nears
  /// (ChatScroll.near), the same as the page before them as
  /// their top nears: once the lines read are those laid out (`laidOut`,
  /// the last in place), not while a page after them is still going in.
  private func askLater(laidOut: String?) {
    let state = chat.state
    guard opened, !state.atEnd, let line = state.lines.last, line.seq != laterThrough,
      laidOut == items(state).last(where: { ChatItemID.isLine($0.id) })?.id
    else { return }
    laterThrough = line.seq
  }

  /// Asks the server for the page straight after the lines laid out while
  /// they stop short of the latest the device holds and their foot is
  /// near (`laterThrough`), again until the socket is open to ask; the
  /// lines then go on into it, and on to the latest once it meets the lines
  /// held after.
  private func askAfter() async {
    guard opened, !chat.state.atEnd, let through = laterThrough else { return }
    while !Task.isCancelled,
      await socket.requestPage(of: threadID, before: pageAfter(through: through)) != true
    {
      try? await Task.sleep(for: .seconds(1))
    }
  }

  /// One's own line just sent shows at the foot, wherever the lines were;
  /// already there, the lines slide up to it as it comes in. Gone to from
  /// the send itself, not from the line seen waiting: the server's answer
  /// can come before the lines are read again, and the line is then never
  /// seen waiting (as the first send's notification alert holds the app).
  private func toOwnLine() {
    following = true
    guard chat.state.atEnd else {
      toLatestRun(stoppingAtUnread: false)
      return
    }
    scroller.toLatest(animated: !reduceMotion)
  }

  /// To the latest when the lines laid out stop short of it: the latest
  /// lines laid out instead, as the chat opens, following them. From ↓,
  /// others' unread lines among them stop it under ここから新着, as the
  /// catch-up's do, the lines hidden as the chat's are as it opens until
  /// there: where the new lines first land is neither seen nor read. For
  /// one's own line sent, it goes on to the foot, where that line is.
  private func toLatestRun(stoppingAtUnread: Bool) {
    let before = chat.state.lines.last?.seq
    following = !stoppingAtUnread
    earlierFrom = nil
    if stoppingAtUnread { placed = false }
    Task {
      await layOut(from: nil)
      if stoppingAtUnread, let first = unreadComing(after: before) {
        show(from: first, animated: false) {
          withAnimation(.easeOut(duration: 0.15)) { placed = true }
        }
      } else {
        // Laid out anew, at their foot (ChatStage), following them.
        following = true
        placed = true
      }
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
      let writers = lines.map { $0.writer(for: me) }
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
    await layOut(from: chat.state.lines.first?.seq)
  }

  /// The first of the lines that just came in after `latest` which is
  /// others' and unread, the app's notices aside.
  private func unreadComing(after latest: Int64?) -> ChatLineRow? {
    guard let me = meID else { return nil }
    let state = chat.state
    let writers = state.lines.map { ($0.seq, $0.writer(for: me)) }
    let seq = firstComing(writers, after: latest ?? 0, read: state.lastRead(by: me))
    return seq.flatMap { seq in state.lines.first { $0.seq == seq } }
  }

  /// Shows the lines from `first` as far as the screen goes rather than
  /// the latest: at the foot after all when they fit, following on, else
  /// stopped there under ここから新着 (unless the chat has one already).
  private func show(
    from first: ChatLineRow, animated: Bool = true, then: @escaping () -> Void = {}
  ) {
    following = false
    // Asked to the top with too few lines under it to get there, it stops
    // at the foot.
    scroller.show(ChatItemID.line(first.opID), at: .top, animated: animated) {
      if scroll.place.atLatest {
        following = true
      } else if unreadFrom == nil {
        // Shown once ここから新着 is laid out over it.
        unreadFrom = first.seq
        scroller.show(ChatItem.unread.id, at: .top, then: then)
        return
      }
      then()
    }
  }

  /// ↓: to ここから新着 first while it is below the top of the screen with
  /// lines under it still unread, as Signal goes, following again only if
  /// that is the foot; else to the latest, following it.
  private func toLatestOrUnread() {
    let unread = meID.map { chat.state.unread(by: $0) } ?? 0
    guard scroll.place.unreadBelow, unread > 0 else {
      guard chat.state.atEnd else {
        toLatestRun(stoppingAtUnread: true)
        return
      }
      following = true
      scroller.toLatest(animated: true)
      return
    }
    scroller.show(ChatItem.unread.id, at: .top, animated: true) {
      if scroll.place.atLatest { following = true }
    }
  }

  /// The latest of the group's lines among the items `seen` of those
  /// `listed`, nil for none (lines still waiting have no seq).
  private func latestSeq(of seen: [String], in listed: [ChatItem]) -> Int64? {
    let ids = Set(seen)
    return listed.lazy.filter { ids.contains($0.id) }.compactMap(\.seq).max()
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
    // Not the person's edit: a mark not kept is tried again as a line
    // next comes into sight.
    let quietly = WriteAction {}
    guard quietly(outboxed(.read(read))) else { return }
    // The notifications of the lines read go too, as on the user's other
    // devices when the server tells them.
    let groupID = place.id
    Task { await Notifications.shared.withdraw(in: groupID, threadID, readTo: mark) }
  }

  private func send(_ text: String) {
    Notifications.shared.askOnce()
    var words = Pochical_V1_ChatSendWords()
    words.text = withMentions(text, picked: draft.picked)
    if let preview = draft.attachedPreview(for: text) {
      words.preview = preview.wire
    }
    // Taken off with ×, so the server does not read it either; a page not
    // come yet the server reads and adds to the line.
    words.withoutPreview = draft.previewRemoved != nil && previewLink(text) == draft.previewRemoved
    var send = Pochical_V1_ChatSend()
    send.threadID = threadID
    send.content.words = words
    guard sent(send) else { return }
    draft.text = ""
    draft.picked = []
    draft.previewRemoved = nil
  }

  /// The first and last of the days the chat's lines share, for their
  /// cards' shifts.
  private var sharedSpan: DaySpan? {
    let contents = chat.state.lines.map(\.content) + chat.state.waiting.map(\.content)
    let days = contents.flatMap(\.days)
    guard let from = days.min(), let through = days.max() else { return nil }
    return DaySpan(from: from, through: through)
  }

  /// Whose shifts a card of days shows: everyone in the group, or the two
  /// of a one-to-one chat.
  private var cardMembers: [GroupMember] {
    guard let otherID else { return dayMembers }
    return dayMembers.filter { $0.userID == otherID || $0.userID == meID }
  }

  /// Shares days with everyone's shifts, as a line of their own; true when
  /// kept.
  private func shareDays(_ days: [Day], poll: Bool) -> Bool {
    var send = Pochical_V1_ChatSend()
    send.threadID = threadID
    if poll {
      send.content.poll.days = days.map(\.key)
    } else {
      send.content.days.days = days.map(\.key)
    }
    return sent(send)
  }

  /// Fetches ahead the photos of the lines near those in sight, as their
  /// lines draw them, and lets go of the rest: not a blocked member's
  /// folded away.
  private func prefetchPhotos(of near: [ChatItem]) {
    let photos = near.flatMap { item -> [LinePhoto] in
      switch item {
      case .line(let line, _):
        return folded(line) ? [] : line.content.photos
      case .waiting(let line, _): return line.content.photos
      default: return []
      }
    }
    photoPrefetch.near(photos, in: place.shelf, scale: displayScale, calls: groupCalls)
  }

  /// The line's photo `key` opened large among the chat's, one by one:
  /// those its lines laid out show at once, and the rest a page at a time
  /// from the group (not a blocked member's folded away, as the group
  /// leaves them out too).
  private func openPhoto(_ key: PhotoKey, of line: ChatLineRow) {
    let photos = line.content.photos
    guard photos.indices.contains(key.index) else { return }
    guard let tapped = ChatPhotoItem.items(of: line, blocked: []).first(where: { $0.key == key })
    else {
      viewing = PhotoViewing(photos[key.index])
      return
    }
    let held = chat.state.lines.flatMap { ChatPhotoItem.items(of: $0, blocked: blocked) }
    viewing = PhotoViewing(tapped, among: held, pager: photoPager)
    viewing?.names = names
  }

  /// The place's socket, which the app holds while the place is open
  /// (OpenPlaceSocket).
  private var socket: SyncClient {
    groupSockets.client(place.id)
  }

  /// Where the chat's photos come from beyond its lines laid out: not a
  /// blocked member's folded away, as the group leaves them out too.
  private var photoPager: PhotoPager {
    PhotoPager(placeID: place.id, threadID: threadID, client: socket, database: database)
  }

  /// Saves a line's photos to the person's library, each in turn, one
  /// that fails not stopping the rest, and says how it went.
  private func save(_ photos: [LinePhoto]) {
    Task {
      var saved = 0
      for photo in photos {
        if await savePhoto(photo, in: place.shelf, calls: groupCalls) { saved += 1 }
      }
      if saved == photos.count {
        sayDone("写真を保存しました")
      } else if saved == 0 {
        say("保存できませんでした")
      } else {
        say("一部の写真を保存できませんでした")
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

  /// Settles a poll on `day`, and says so to whoever settled it.
  private func decide(_ line: ChatLineRow, on day: Day) {
    var decide = Pochical_V1_ChatDecide()
    decide.threadID = threadID
    decide.seq = UInt64(line.seq)
    decide.day = day.key
    guard keep(.decide(decide)) else { return }
    say("\(day.fullText)に決めました")
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
    // What is not kept stays in the composer, with all after it.
    if let days = draft.attachedDays {
      guard shareDays(days, poll: false) else { return }
      draft.attachedDays = nil
    }
    guard sendPhotos() else { return }
    if !text.isEmpty { send(text) }
  }

  /// How a line is dragged to reply to it (spec/chat.md, Replies): any
  /// line the menu has 返信 on, from its writer's side; not the app's
  /// notices, a line taken back or folded for a blocked writer, nor one
  /// still on its way.
  private func replySwipe(_ item: ChatItem?) -> ReplySwipe? {
    guard let line = answered(item), !folded(line) else { return nil }
    switch line.content {
    case .words, .photos, .days, .poll: return line.authorID == meID ? .leftward : .rightward
    case .notice, .unsent, .hidden: return nil
    }
  }

  /// Answers a line (返信): quoted over the composer until sent or ×.
  private func reply(to line: ChatLineRow) {
    if draft.editing != nil { stopEditing() }
    draft.target = .reply(line.seq)
    draft.field.focus()
  }

  /// Sends a line of the composer's, answering the line it replies to, the
  /// reply let go once the line is kept; true when kept.
  private func sent(_ line: Pochical_V1_ChatSend) -> Bool {
    var line = line
    line.replyTo = draft.replyTo.map(UInt64.init) ?? 0
    guard keep(.send(line)) else { return false }
    if draft.replyTo != nil { draft.target = nil }
    return true
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
    switch line.content {
    case .unsent:
      return LineQuote(seq: seq, writer: writer, words: "取り消されたメッセージ")
    case .notice, .hidden:
      // A notice takes no reply; a line of a kind the app does not know
      // is quoted as one not held.
      return LineQuote(seq: seq, words: "以前のメッセージ")
    case .words, .photos, .days, .poll:
      if blocked.contains(line.authorID) {
        return LineQuote(seq: seq, words: "ブロック中のメンバーのメッセージ")
      }
      return LineQuote(
        seq: seq, writer: writer, words: lineWords(line.content, nameOf: nameOf),
        photo: line.content.photos.first)
    }
  }

  private func edit(_ line: ChatLineRow) {
    guard case .words(let words) = line.content else { return }
    draft.target = .edit(line)
    // Its mentions as @name again, still picked.
    draft.text = plainText(words.text, nameOf: nameOf)
    draft.picked = mentions(in: words.text).map { PickedMember(id: $0, name: nameOf($0)) }
    draft.field.focus()
  }

  private func stopEditing() {
    draft.target = nil
    draft.text = ""
    draft.picked = []
  }

  private func save(_ line: ChatLineRow, text: String) {
    guard case .words(let words) = line.content else { return }
    var change = Pochical_V1_ChatChange()
    change.threadID = threadID
    change.seq = UInt64(line.seq)
    change.text = withMentions(text, picked: draft.picked)
    // The page stays while the first link does (spec/vectors/chat.json,
    // edited); else the new link's, if it has come.
    change.keepsPreview = keepsPreview(of: words.text, editedTo: change.text)
    if !change.keepsPreview, let preview = draft.attachedPreview(for: text) {
      change.preview = preview.wire
    }
    guard keep(.change(change)) else { return }
    draft.previewRemoved = nil
    stopEditing()
  }

  /// A line's menu: コピー, then for one's own 編集, and 送信取消 apart in
  /// the danger color (spec/chat.md, Editing and unsending).
  private func actions(for line: ChatLineRow, mine: Bool) -> [MessageAction] {
    let pinned = chat.state.pins.contains { $0.seq == line.seq }
    // First, for any line (/design's menu).
    var actions = [
      MessageAction(title: "返信", systemImage: "arrowshape.turn.up.left") { reply(to: line) }
    ]
    // Shared days and polls have no words to copy or change.
    var words = false
    var poll: LineContent.Poll?
    switch line.content {
    case .words(let said):
      words = true
      actions.append(copy(said.text))
    case .photos(let photos):
      actions.append(
        MessageAction(title: "保存", systemImage: "square.and.arrow.down") { save(photos) })
    case .poll(let asked):
      poll = asked
    case .days, .notice, .unsent, .hidden:
      break
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
    if poll?.decided != nil, canDecide(line) {
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
    let dropped = on ? pinStep(chat.state.pins.map(\.seq), pin: seq).dropped : nil
    var pin = Pochical_V1_ChatPin()
    pin.threadID = threadID
    pin.seq = UInt64(seq)
    pin.on = on
    guard keep(.pin(pin)) else { return }
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
    notice.words = words
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(2.5))
      if notices == said {
        notice.words = nil
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
      scroller.show(ChatItemID.line(line.opID), at: .center, animated: true) {
        marks.ringed = target
        Task { @MainActor in
          try? await Task.sleep(for: .milliseconds(500))
          withAnimation(.easeOut(duration: 0.7)) { marks.ringed = nil }
        }
      }
    } else if let last = state.lines.last, target > last.seq {
      // Gone to a line after those laid out, past a gap: laid out from it.
      earlierFrom = nil
      await layOut(from: target)
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

  /// Opens a line's reactions and menu over the chat, its bubble lifted
  /// from its place, which stands empty meanwhile.
  private func openActions(_ request: MessageActionsRequest) {
    acting = request
    marks.lifted = request.lineID
  }

  /// The menu has gone: the line draws its bubble again.
  private func menuClosed() {
    acting = nil
    marks.lifted = nil
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
    keep(.react(react))
  }

  private func unsend(_ line: ChatLineRow) {
    var unsend = Pochical_V1_ChatUnsend()
    unsend.threadID = threadID
    unsend.seq = UInt64(line.seq)
    guard keep(.unsend(unsend)) else { return }
    if draft.editing?.seq == line.seq { stopEditing() }
  }

  /// Puts the person's edit in the outbox (WriteAction); true when kept.
  @discardableResult
  private func keep(_ kind: Pochical_V1_ChatEdit.OneOf_Kind) -> Bool {
    guard write(outboxed(kind)) else { return false }
    if case .send = kind { toOwnLine() }
    return true
  }

  /// What puts an edit in the outbox.
  private func outboxed(_ kind: Pochical_V1_ChatEdit.OneOf_Kind) -> (Database) throws -> Void {
    let kind = AppDevice.stamped(kind, in: place.id)
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    let groupID = place.id
    return { try Chats.edit(kind, in: groupID, now: now, db: $0) }
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
  let pinned: Bool
  let quote: LineQuote?
  let blockedWriter: Bool
  let shownAnyway: Bool
  let unfolded: Bool
  let common: RowsLook
}

/// When the server is asked for the page before the lines held: as the
/// first held changes, while fewer than a page are held before the lines
/// laid out, and again as the socket opens after a drop.
private struct PageAhead: Hashable {
  let from: Int64?
  let short: Bool
  let reopened: Int
}

/// When the server is asked for the page after the lines laid out: as
/// their foot nears with a new last line while they stop short of the
/// latest (`through`, else nil), and again as the socket opens after a
/// drop.
private struct PageAfter: Hashable {
  let through: Int64?
  let reopened: Int
}

/// The first and last of the lines laid out: lines come in while the first
/// stays, and are laid out again from elsewhere as it changes.
private struct LinesEnds: Equatable {
  let first: Int64?
  let last: Int64?
}

/// What of the lines the device holds beyond those laid out the chat can
/// go on to, for the page beyond an end once the reader nears it.
private struct LinesHeld: Hashable {
  /// The chat has opened on its place: none before, which the lines laid
  /// out then would push away.
  let opened: Bool
  /// How many lines are held before the first laid out.
  let before: Int
  let atStart: Bool
  let atEnd: Bool
}

/// Asks for the page beyond an end of the lines laid out as the reader
/// scrolls near it (ChatScroll.near), and as more lines are held there
/// while they are near, so the reader scrolling on finds it laid out
/// already; apart from the screen, which reading `near` would draw again.
private struct PagesNear: View {
  let scroll: ChatScroll
  let lines: LinesHeld
  let ask: (NearEnds) -> Void

  var body: some View {
    Color.clear
      .onChange(of: PagesNearKey(near: scroll.near, lines: lines)) { _, key in ask(key.near) }
  }
}

private struct PagesNearKey: Hashable {
  let near: NearEnds
  let lines: LinesHeld
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

