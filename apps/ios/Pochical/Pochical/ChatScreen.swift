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
  @State private var scroller: ScrollViewProxy?
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
  /// ここから新着 is on the screen whole, as at the latest when the new
  /// lines are few: opening has nowhere to go for it then.
  /// The top of the lines, where earlier ones are asked for, is on the
  /// screen.
  /// The first line laid out, kept from the chat's opening so new lines
  /// add to it rather than move it, and moved back a page at a time.
  @State private var window: Int64?
  /// The height the lines are seen in, between the pins and the composer.
  @State private var seen: CGFloat = 0
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
  /// The line gone to, ringed for a moment.
  @State private var ringed: Int64?
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

  var body: some View {
    let state = chat.state
    let names = self.names
    ScrollView {
      ScrollViewReader { proxy in
        // Not lazy: a lazy stack guesses the heights of lines not yet drawn
        // and corrects them as they come into sight, jolting the lines while
        // scrolling up. A chat holds its pages, not its whole history.
        VStack(spacing: CGFloat(Chat.lineGap)) {
          if !state.atStart {
            EarlierLines(scroll: scroll, first: state.lines.first?.seq, ready: opened) {
              await showEarlier()
            }
          }
          let listed = items(state)
          let timeless = linesWithoutTime(listed)
          let namesKey = names.hashValue
          ForEach(listed) { item in
            // Lines close within a run, parted where the writer changes; the
            // first has the list's own margin over it.
            let parted = item.startsRun && item.id != listed.first?.id
            row(item, names: names, namesKey: namesKey, showsTime: !timeless.contains(item.id))
              .padding(.top, parted ? CGFloat(Chat.runGap - Chat.lineGap) : 0)
          }
          // Who is writing now, under the latest line; not someone blocked.
          ForEach(typers.keys.filter { !blocked.contains($0) }.sorted(), id: \.self) { userID in
            TypingLine(name: names[userID] ?? "メンバー", photoID: faces[userID] ?? "")
              .padding(.top, CGFloat(Chat.runGap - Chat.lineGap))
              .id("typing-\(userID)")
              .transition(.opacity)
          }
          // The foot, which the chat goes to for its latest.
          Color.clear.frame(height: 0).id(Self.foot)
        }
        .coordinateSpace(.named(Self.lines))
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: {
          scroll.linesHeight = $0
        }
        .scrollTargetLayout()
        // In from the sides as padding, not content margins, so scrolling
        // to the foot's edge never moves the lines sideways.
        .padding(.horizontal, 16)
        // Lines shorter than the screen fill it, at its foot.
        .frame(minHeight: seen, alignment: .bottom)
        .onAppear { scroller = proxy }
      }
    }
    .contentMargins(.vertical, 12, for: .scrollContent)
    .opacity(placed ? 1 : 0)
    .overlay {
      if state.lines.isEmpty, state.waiting.isEmpty {
        Text("まだメッセージはありません")
          .font(.footnote)
          .foregroundStyle(colors.textQuaternary)
      }
    }
    // Opens at the foot (spec/chat.md, Unread lines and typing); where it
    // goes from there is the person's, or follows the latest.
    // Not for alignment: the lines fill the screen themselves (below), and
    // the inset it adds over short lines left room to scroll.
    .defaultScrollAnchor(.bottom, for: .initialOffset)
    .defaultScrollAnchor(.bottom, for: .sizeChanges)
    .scrollDismissesKeyboard(.interactively)
    .onScrollGeometryChange(for: ScrollPlace.self) { geometry in
      let below =
        geometry.contentSize.height + geometry.contentInsets.bottom
        - geometry.visibleRect.maxY
      return ScrollPlace(
        atLatest: below < 24, away: below > geometry.containerSize.height / 2,
        fits: geometry.contentSize.height <= seen + 1,
        atTop: geometry.contentOffset.y <= -geometry.contentInsets.top + 1,
        nearTop: geometry.contentOffset.y <= -geometry.contentInsets.top + Metrics.touch)
    } action: { before, now in
      scroll.place = now
      if now.atLatest, !before.atLatest {
        reachedLatest += 1
      }
    }
    // Following is the person's to change: off as they scroll, and on
    // again where their scroll comes to rest at the foot.
    .onScrollPhaseChange { _, phase in
      switch phase {
      case .interacting: following = false
      case .idle: if !following { following = scroll.place.atLatest }
      default: break
      }
      scroll.scrolling = phase.isScrolling
      // The person's own scrolling, not the chat following its latest.
      if phase == .interacting || phase == .decelerating, !scroll.dayShown {
        withAnimation(.easeOut(duration: 0.2)) { scroll.dayShown = true }
      }
    }
    .onScrollTargetVisibilityChange(idType: String.self) { seen in
      let day = dayOver(seen.first, in: items(chat.state))
      if day != scroll.topDay { scroll.topDay = day }
    }
    // The container is already inside the bars and the margins.
    .onScrollGeometryChange(for: CGFloat.self) { geometry in
      geometry.containerSize.height
    } action: { _, now in
      seen = now
    }
    .overlay(alignment: .bottomTrailing) {
      LatestButton(scroll: scroll, unread: meID.map { state.unread(by: $0) } ?? 0) {
        following = true
        toLatest(animated: true)
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
    .task(id: JumpKey(target: jumpTarget, first: chat.state.lines.first?.seq)) {
      await goToTarget()
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
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
        opened: opened, active: scenePhase == .active, latest: state.lines.last?.seq ?? 0,
        reached: reachedLatest)
    ) {
      guard opened, scroll.place.atLatest, scenePhase == .active else { return }
      // Lines just come in are not yet laid out, and the place not yet
      // moved for them: read only once they are on the screen.
      try? await Task.sleep(for: .milliseconds(100))
      if !Task.isCancelled, scroll.place.atLatest {
        read()
      }
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
    // Lines coming in, someone writing, and the keyboard coming up or
    // going keep a following chat at its foot.
    .onChange(of: FollowKey(latest: state.lines.last?.seq, writers: typers.count, seen: seen)) {
      before, now in
      guard opened, following else { return }
      // Others' lines the reader has not read stop at ここから新着 rather
      // than going past it, as the chat's catch-up bringing many at once.
      if before.latest != now.latest, let first = unreadComing(after: before.latest) {
        show(from: first)
      } else {
        toLatest(animated: true)
      }
    }
    // Whatever else changes the lines' height while following, a photo or
    // a link's page drawn, a long line folded, from the first layout on:
    // the scroll view keeps its offset, not its foot, so it is put back.
    .onScrollGeometryChange(for: CGFloat.self) { $0.contentSize.height } action: { before, now in
      if following {
        toLatest()
      }
    }
    // An earlier page coming in above, the lines seen stay: held at the
    // top edge, the view would stay there, on the page's first lines.
    .onChange(of: state.lines.first?.seq) { before, now in
      guard let before, let now, now < before, scroll.place.atTop,
        let first = state.lines.first(where: { $0.seq == before })
      else { return }
      // Once the page is laid out above it.
      Task { @MainActor in scroller?.scrollTo("line-\(first.opID)", anchor: .top) }
    }
    // One's own line just sent shows at the foot, wherever the lines were.
    .onChange(of: state.waiting.last?.opID) { _, sent in
      if sent != nil {
        following = true
        toLatest(animated: true)
      }
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
    _ item: ChatItem, names: [String: String], namesKey: Int, showsTime: Bool = true
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
      .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.lines)).minY } action: {
        scroll.unreadTop = $0
      }
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
        let onReact = { (emoji: String) in react(emoji, on: line) }
        let poll = pollLine(for: line)
        LineView(
          text: line.text, preview: line.preview, days: line.days, members: cardMembers,
          poll: poll, photo: line.photo, quote: line.replyTo.map(quote(of:)),
          unfolded: unfolded.contains(line.opID),
          // Opened where it is, its words going on down from there, as
          // the messaging apps open a long one: not carried to the foot.
          onUnfold: {
            following = false
            withAnimation { _ = unfolded.insert(line.opID) }
          },
          groupID: group.id, onOpenPhoto: { viewing = line.photo },
          onOpenQuote: { line.replyTo.map(jump(to:)) },
          onOpenProfile: {
            profileOf = ProfileOf(
              id: line.authorID, name: names[line.authorID] ?? "メンバー",
              photoID: faces[line.authorID] ?? "")
          },
          shifts: line.poll ? nil : line.days.first.map { GroupRoute.shifts(group, day: $0) },
          time: line.sentAtMs, showsTime: showsTime, edited: line.edited, mine: mine,
          writer: mine || !startsRun ? nil : names[line.authorID] ?? "",
          writerPhoto: faces[line.authorID] ?? "",
          named: otherID == nil, first: startsRun, waiting: false, nameOf: nameOf,
          namesKey: namesKey, reactions: line.reactions, countedReactions: otherID != nil,
          pinned: chat.state.pins.contains { $0.seq == line.seq }, ringed: ringed == line.seq,
          meID: meID, onReact: onReact, lifted: acting?.lineID == line.opID
        ) { frame, finger, link in
          let bubble = AnyView(
            LineContent(
              text: line.text, preview: line.preview, days: line.days, members: cardMembers,
              poll: poll,
              photo: line.photo, quote: line.replyTo.map(quote(of:)), groupID: group.id,
              mine: mine, first: startsRun, waiting: false, nameOf: nameOf))
          // A link held has its own menu, without the reactions.
          if let link {
            openActions(
              MessageActionsRequest(
                lineID: line.opID, frame: frame, mine: mine, bubble: bubble, finger: finger,
                actions: linkActions(link, open: { _ = open(link) }, copied: { sayDone("コピーしました") })))
          } else {
            openActions(
              MessageActionsRequest(
                lineID: line.opID, frame: frame, mine: mine, bubble: bubble,
                finger: finger, reactions: line.reactions, meID: meID, onReact: onReact,
                onMoreReactions: { reactingTo = line }, actions: actions(for: line, mine: mine)))
          }
        }
        .equatable()
      }
    case .waiting(let line, let startsRun):
      LineView(
        text: line.text, preview: line.preview, days: line.days, members: cardMembers,
        poll: line.poll
          ? PollLine(votes: [], decided: nil, names: names, meID: meID, canDecide: true) : nil,
        photo: line.photo, quote: line.replyTo.map(quote(of:)), groupID: group.id,
        time: line.madeAtMs,
        edited: false, mine: true, writer: nil, named: false, first: startsRun, waiting: true,
        failed: line.failed, onFailed: { unsentPhoto = line },
        nameOf: nameOf, namesKey: namesKey, lifted: acting?.lineID == line.opID
      ) { frame, finger, _ in
        // Still on its way: nothing but コピー yet, and days have nothing
        // to copy.
        guard line.days.isEmpty, line.photo == nil else { return }
        openActions(
          MessageActionsRequest(
            lineID: line.opID, frame: frame, mine: true,
            bubble: AnyView(
              MessageBubble(
                text: line.text, mine: true, first: startsRun, waiting: true, nameOf: nameOf,
                quote: line.replyTo.map(quote(of:)), groupID: group.id)),
            finger: finger, actions: [copy(line.text)]))
      }
      .equatable()
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
      send.photo.id = picked.id
      send.photo.width = UInt32(picked.shrunk.width)
      send.photo.height = UInt32(picked.shrunk.height)
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

  /// Lays out a page more of earlier lines: those the device holds, else
  /// asked for, shown as they come.
  private func showEarlier() async {
    guard let first = chat.state.lines.first?.seq else { return }
    window = max(first - Int64(Chat.pageSize), 1)
    await reload()
    guard chat.state.lines.first?.seq == first, !chat.state.atStart else { return }
    // Asked again until the socket is open to ask.
    while !Task.isCancelled, await socket?.requestPage(of: threadID, before: first) != true {
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
    // With nothing new, the bottom anchor has the lines at the latest
    // already. With something, once the lines are laid out, ここから新着
    // goes to the top, shown only once there rather than after a trip.
    if unreadFrom == nil {
      placed = true
    } else {
      // Not carried to the foot meanwhile by lines coming in or laid out.
      following = false
      // Once the lines are laid out, where they are and what is in sight
      // known.
      try? await Task.sleep(for: .milliseconds(50))
      // With few new lines, ここから新着 is on the screen at the latest
      // already; asked to the top with too few lines under it to get
      // there, the scroll view would go past the foot. Known from where it
      // is among the lines, not from its being in sight, which is read as
      // the lines are first laid out at the top.
      if let top = scroll.unreadTop, scroll.linesHeight - top > seen {
        scroller?.scrollTo(ChatItem.unread.id, anchor: .top)
      } else {
        following = true
        toLatest()
      }
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
    Task { @MainActor in
      // Asked to the top with too few lines under it to get there, it
      // stops at the foot.
      withAnimation { scroller?.scrollTo("line-\(first.opID)", anchor: .top) }
      try? await Task.sleep(for: .milliseconds(400))
      if scroll.place.atLatest {
        following = true
      } else if unreadFrom == nil {
        unreadFrom = first.seq
        try? await Task.sleep(for: .milliseconds(50))
        scroller?.scrollTo(ChatItem.unread.id, anchor: .top)
      }
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
      canDecide: canDecide(line),
      onVote: { day, on in
        var vote = Pochical_V1_ChatVote()
        vote.threadID = threadID
        vote.seq = UInt64(line.seq)
        vote.day = day.key
        vote.on = on
        write(.vote(vote))
      },
      onDecide: { deciding = line })
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

  /// The lines' own coordinates, where ここから新着 is measured.
  private static let lines = "lines"

  /// The foot's id, under the latest line and anyone writing.
  private static let foot = "foot"

  /// To the foot, every time it is asked: a scroll position set to the
  /// foot it already says does nothing, though the lines have moved. Once
  /// what asked has been laid out, after the scroll view's own adjusting,
  /// which would otherwise have the last word.
  private func toLatest(animated: Bool = false) {
    Task { @MainActor in
      if animated {
        withAnimation { scroller?.scrollTo(Self.foot, anchor: .bottom) }
      } else {
        scroller?.scrollTo(Self.foot, anchor: .bottom)
      }
    }
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
  /// as the device holds it, else said to be earlier, gone to at a tap.
  private func quote(of seq: Int64) -> LineQuote {
    guard let line = chat.state.lines.first(where: { $0.seq == seq }) else {
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

  /// Scrolls to the line gone to once held and rings it; else asks for the
  /// page before the lines held, again until the socket is open to ask,
  /// and comes back as it arrives.
  private func goToTarget() async {
    guard let target = jumpTarget else { return }
    let state = chat.state
    if let line = state.lines.first(where: { $0.seq == target }) {
      jumpTarget = nil
      following = false
      withAnimation { scroller?.scrollTo("line-\(line.opID)", anchor: .center) }
      ringed = target
      try? await Task.sleep(for: .milliseconds(500))
      withAnimation(.easeOut(duration: 0.7)) { ringed = nil }
    } else if !state.atStart {
      await showEarlier()
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
    OverlayWindow.shared.show(
      MessageActionsOverlay(request: request) { action in
        closeActions()
        action?()
      }
      .environment(\.themeColors, colors)
      .environment(settings)
      .environment(\.look, look))
  }

  /// Gives the line back its bubble in the chat, then takes the overlay
  /// away once the chat has drawn it, so the bubble never blinks out
  /// between the two.
  private func closeActions() {
    acting = nil
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
