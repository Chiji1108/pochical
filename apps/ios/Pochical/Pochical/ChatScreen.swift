import PochicalDesign
import PochicalKit
import PhotosUI
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
  @Environment(Settings.self) private var settings
  @Environment(\.look) private var look
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.groupSocket) private var socket
  @Environment(\.scenePhase) private var scenePhase
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
  /// All the pins open under the bar.
  @State private var pinsOpen = false
  /// A pinned line being gone to, its earlier lines asked for until held.
  @State private var jumpTarget: Int64?
  /// The line gone to, ringed for a moment.
  @State private var ringed: Int64?
  /// What a pin did, said for a moment over the lines.
  @State private var notice: String?
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
  /// Photos picked for the next send, waiting above the composer.
  @State private var pickedPhotos: [PickedPhoto] = []
  /// What the photo picker just handed over, read into `pickedPhotos`.
  @State private var photoItems: [PhotosPickerItem] = []
  /// Picked photos are being read and shrunk.
  @State private var readingPhotos = false
  /// A photo opened large.
  @State private var viewing: LinePhoto?
  /// Others writing now, each until their typing lapses.
  @State private var typers: [String: Date] = [:]
  /// When the member's own typing was last sent.
  @State private var typingSentAt = Date.distantPast
  /// The page of the words' first link, while writing.
  @State private var composerPreview: ComposerPreview?
  /// A link whose page was taken off with ×, until sent or changed.
  @State private var previewRemoved: String?
  /// The line whose reactions and menu are open.
  @State private var acting: MessageActionsRequest?

  var body: some View {
    let state = chat.state
    let names = self.names
    ScrollView {
      LazyVStack(spacing: CGFloat(Chat.lineGap)) {
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
          // Lines close within a run, parted where the writer changes.
          row(item, names: names)
            .padding(.top, item.startsRun ? CGFloat(Chat.runGap - Chat.lineGap) : 0)
        }
        // Who is writing now, under the latest line; not someone blocked.
        ForEach(typers.keys.filter { !blocked.contains($0) }.sorted(), id: \.self) { userID in
          TypingLine(name: names[userID] ?? "メンバー")
            .padding(.top, CGFloat(Chat.runGap - Chat.lineGap))
            .id("typing-\(userID)")
            .transition(.opacity)
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
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.visible, for: .navigationBar)
    .toolbarVisibility(.hidden, for: .tabBar)
    .toolbar {
      // The title drawn here only to carry 通知オフ's bell after it, which
      // the bar's own title does not draw.
      ToolbarItem(placement: .principal) {
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
          Text(subtitle)
            .font(.caption)
            .foregroundStyle(colors.textSecondary)
            .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
      }
      ToolbarItem(placement: .primaryAction) {
        Menu("チャットのメニュー", systemImage: "ellipsis") {
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
      try? await $chat.load(ChatRequest(groupID: group.id, threadID: threadID))
      meID = await groupCalls.userID()
      try? await $chat.load(ChatRequest(groupID: group.id, threadID: threadID, me: meID))
      // Opened from a notification as the app starts, its new lines are
      // still coming: where it opens waits for them, a little.
      await socket?.catchUp(within: .seconds(2))
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
    // Others' typing, as it comes, each shown until it lapses.
    .task(id: socket != nil) {
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
    // The member's own typing: at most every typingSendMs while the field
    // holds words, and a stop once it empties.
    .onChange(of: draft.isEmpty) { _, empty in
      if empty { stopTyping() }
    }
    .onChange(of: draft) { _, words in
      guard !words.isEmpty else { return }
      let now = Date.now
      if now.timeIntervalSince(typingSentAt) * 1000 >= Double(Chat.typingSendMs) {
        typingSentAt = now
        Task { await socket?.sendTyping(in: threadID, on: true) }
      }
    }
    // Others' lines as they come keep the chat at its foot when it was
    // there, as the bottom anchor alone stops short of them.
    .onChange(of: state.lines.last?.seq) {
      if opened, place.atLatest {
        withAnimation { toLatest() }
      }
    }
    .onChange(of: state.waiting.last?.opID) { _, sent in
      if sent != nil {
        withAnimation { toLatest() }
      }
    }
    .environment(\.openURL, OpenURLAction { open($0) })
    // Leaving the chat takes its open menu with it.
    .onAppear {
      Notifications.shared.openChat = OpenedChat(groupID: group.id, threadID: threadID)
    }
    .onDisappear {
      closeActions()
      stopTyping()
      if Notifications.shared.openChat?.threadID == threadID {
        Notifications.shared.openChat = nil
      }
    }
    .task(id: sharedSpan) {
      guard let span = sharedSpan else { return }
      try? await $dayMembers.load(
        GroupMembersRequest(groupID: group.id, from: span.from, through: span.through))
    }
    .task(id: previewLink(draft)) { await readPreview(of: previewLink(draft)) }
    .sheet(isPresented: $sharingDays) {
      ShareDaysSheet(
        groupID: group.id, people: otherID.map { Set([$0, meID ?? ""]) }, pollable: otherID == nil,
        onSend: shareDays)
    }
    .fullScreenCover(item: $viewing) { photo in
      PhotoViewer(photo: photo, groupID: group.id) { save(photo) }
    }
    .modifier(
      ReportAndBlock(
        groupID: group.id, groupName: group.name, blocked: blocked, reporting: $reporting,
        profileOf: $profileOf, blockQuestion: $blockQuestion, onReported: reported,
        onSetBlocked: setBlocked))
    .sheet(item: $deciding) { line in
      DecidePollSheet(days: line.days, votes: line.votes, decided: line.decided) { day in
        decide(line, on: day)
      }
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
      items.append(.waiting(line, startsRun: startsRun(at: line.madeAtMs, writer: meID)))
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
    case .line(let line, _) where line.hidden:
      // Never delivered to the reader: nothing shows.
      EmptyView()
    case .line(let line, _)
    where otherID == nil && blocked.contains(line.authorID) && !shownBlocked.contains(line.seq)
      && !line.unsent:
      BlockedLine { shownBlocked.insert(line.seq) }
    case .line(let line, let runStart):
      // A blocked member's line shown at a tap stands alone between the
      // folded ones, with their face, the way to their profile.
      let startsRun = runStart || (otherID == nil && blocked.contains(line.authorID))
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
        let poll = pollLine(for: line)
        LineView(
          text: line.text, preview: line.preview, days: line.days, members: cardMembers,
          poll: poll, photo: line.photo,
          groupID: group.id, onOpenPhoto: { viewing = line.photo },
          onOpenProfile: {
            profileOf = ProfileOf(id: line.authorID, name: names[line.authorID] ?? "メンバー")
          },
          shifts: line.poll ? nil : line.days.first.map { GroupRoute.shifts(group, day: $0) },
          time: line.sentAtMs, edited: line.edited, mine: mine,
          writer: mine || !startsRun ? nil : names[line.authorID] ?? "",
          named: otherID == nil, first: startsRun, waiting: false, nameOf: nameOf,
          reactions: line.reactions,
          pinned: chat.state.pins.contains { $0.seq == line.seq }, ringed: ringed == line.seq,
          meID: meID, onReact: onReact, lifted: acting?.lineID == line.opID
        ) { frame, finger in
          openActions(
            MessageActionsRequest(
              lineID: line.opID, frame: frame, mine: mine,
              bubble: AnyView(
                LineContent(
                  text: line.text, preview: line.preview, days: line.days, members: cardMembers,
                  poll: poll,
                  photo: line.photo, groupID: group.id, mine: mine, first: startsRun,
                  waiting: false, nameOf: nameOf)),
              finger: finger, reactions: line.reactions, meID: meID, onReact: onReact,
              onMoreReactions: { reactingTo = line }, actions: actions(for: line, mine: mine)))
        }
      }
    case .waiting(let line, let startsRun):
      LineView(
        text: line.text, preview: line.preview, days: line.days, members: cardMembers,
        poll: line.poll
          ? PollLine(votes: [], decided: nil, names: names, meID: meID, canDecide: true) : nil,
        photo: line.photo, groupID: group.id,
        time: line.madeAtMs,
        edited: false, mine: true, writer: nil, named: false, first: startsRun, waiting: true,
        nameOf: nameOf, lifted: acting?.lineID == line.opID
      ) { frame, finger in
        // Still on its way: nothing but コピー yet, and days have nothing
        // to copy.
        guard line.days.isEmpty, line.photo == nil else { return }
        openActions(
          MessageActionsRequest(
            lineID: line.opID, frame: frame, mine: true,
            bubble: AnyView(
              MessageBubble(
                text: line.text, mine: true, first: startsRun, waiting: true, nameOf: nameOf)),
            finger: finger, actions: [copy(line.text)]))
      }
    }
  }

  // MARK: Composer

  /// 写真を送る: the photo picker, up to Chat.photosPerSend in the tray at
  /// once; past it the picker does not open.
  @ViewBuilder private var photoButton: some View {
    let room = Chat.photosPerSend - pickedPhotos.count
    if room > 0 {
      PhotosPicker(
        selection: $photoItems, maxSelectionCount: room, matching: .images,
        preferredItemEncoding: .compatible
      ) {
        Image(systemName: "photo")
          .font(.system(size: 20))
          .foregroundStyle(colors.textSecondary)
          .frame(width: 38, height: 38)
      }
      .accessibilityLabel("写真を送る")
      .onChange(of: photoItems) { _, items in
        guard !items.isEmpty else { return }
        photoItems = []
        Task { await readPhotos(items) }
      }
    } else {
      Button("写真を送る", systemImage: "photo") {
        say("写真は一度に\(Chat.photosPerSend)枚まで送れます")
      }
      .labelStyle(.iconOnly)
      .font(.system(size: 20))
      .foregroundStyle(colors.textQuaternary)
      .frame(width: 38, height: 38)
    }
  }

  /// Reads picked photos and shrinks them to send, into the tray.
  private func readPhotos(_ items: [PhotosPickerItem]) async {
    readingPhotos = true
    defer { readingPhotos = false }
    var unreadable = false
    for item in items {
      guard let data = try? await item.loadTransferable(type: Data.self),
        let shrunk = await Task.detached(operation: { ChatPhotos.shrink(data) }).value
      else {
        unreadable = true
        continue
      }
      let picked = PickedPhoto(
        shrunk: shrunk,
        thumbnail: UIImage(data: shrunk.jpeg)?.preparingThumbnail(of: CGSize(width: 128, height: 128)))
      if pickedPhotos.count < Chat.photosPerSend {
        withAnimation { pickedPhotos.append(picked) }
      }
    }
    if unreadable {
      say("開けない写真がありました")
    }
  }

  /// Sends the tray's photos, each as its own line, kept on the device to
  /// upload before its line goes.
  private func sendPhotos() {
    for picked in pickedPhotos {
      guard (try? ChatPhotos.keep(picked.shrunk.jpeg, as: picked.id, in: group.id)) != nil else {
        continue
      }
      var send = Pochical_V1_ChatSend()
      send.threadID = threadID
      send.photo.id = picked.id
      send.photo.width = UInt32(picked.shrunk.width)
      send.photo.height = UInt32(picked.shrunk.height)
      write(.send(send))
    }
    withAnimation { pickedPhotos = [] }
  }

  private var composer: some View {
    let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let unchanged = editing.map { $0.text == withMentions(draft, picked: picked) } ?? false
    let blocked =
      editing == nil
      ? (trimmed.isEmpty && pickedPhotos.isEmpty) || readingPhotos
      : trimmed.isEmpty || unchanged
    return VStack(spacing: 0) {
      mentionList
      if editing == nil, !pickedPhotos.isEmpty {
        PhotoTray(photos: $pickedPhotos)
      }
      if let composerPreview, !composerPreview.none, composerPreview.url != previewRemoved {
        ComposerPreviewBar(state: composerPreview) {
          withAnimation { previewRemoved = composerPreview.url }
        }
      }
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
        if editing == nil {
          photoButton
          Button("日にちを共有", systemImage: "calendar.badge.plus") { sharingDays = true }
            .labelStyle(.iconOnly)
            .font(.system(size: 20))
            .foregroundStyle(colors.textSecondary)
            .frame(width: 38, height: 38)
        }
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
          if let editing {
            if !text.isEmpty { save(editing, text: text) }
          } else {
            sendPhotos()
            if !text.isEmpty { send(text) }
          }
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
      }
    }
    // Once the lines are laid out, to the foot by the latest line's id:
    // the bottom anchor alone stops short of it once the rows have been
    // measured, and ここから新着 near the foot can then go only so far.
    try? await Task.sleep(for: .milliseconds(50))
    toLatest()
    if unreadFrom != nil {
      try? await Task.sleep(for: .milliseconds(50))
      position.scrollTo(id: ChatItem.unread.id, anchor: .top)
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

  /// Says the member stopped writing, once they said they were.
  private func stopTyping() {
    guard typingSentAt != .distantPast else { return }
    typingSentAt = .distantPast
    Task { await socket?.sendTyping(in: threadID, on: false) }
  }

  private func send(_ text: String) {
    Notifications.shared.askOnce()
    var send = Pochical_V1_ChatSend()
    send.threadID = threadID
    send.text = withMentions(text, picked: picked)
    if let preview = attachedPreview(for: text) {
      send.preview = preview.wire
    }
    write(.send(send))
    draft = ""
    picked = []
    previewRemoved = nil
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

  /// The page to send with `text`: its first link's, read and not taken
  /// off; none while it is still being asked for.
  private func attachedPreview(for text: String) -> LinePreview? {
    guard let link = previewLink(text), let state = composerPreview, state.url == link,
      link != previewRemoved
    else { return nil }
    return state.preview
  }

  /// Asks for the page of the words' first link once it has stayed the
  /// same a moment, as chatRules.linkPreviewSettleMs.
  private func readPreview(of link: String?) async {
    guard let link else {
      composerPreview = nil
      return
    }
    if composerPreview?.url == link { return }
    try? await Task.sleep(for: .milliseconds(Chat.linkPreviewSettleMs))
    guard !Task.isCancelled else { return }
    withAnimation { composerPreview = ComposerPreview(url: link) }
    let preview = try? await groupCalls.linkPreview(link)
    guard !Task.isCancelled, composerPreview?.url == link else { return }
    withAnimation { composerPreview = ComposerPreview(url: link, preview: preview, none: preview == nil) }
  }

  /// Shares days with everyone's shifts, as a line of their own.
  private func shareDays(_ days: [Day], poll: Bool) {
    var send = Pochical_V1_ChatSend()
    send.threadID = threadID
    send.days = days.map(\.key)
    send.poll = poll
    write(.send(send))
  }

  /// Saves a photo to the person's library, and says so.
  private func save(_ photo: LinePhoto) {
    Task {
      say(await savePhoto(photo, in: group.id, calls: groupCalls) ? "写真を保存しました" : "保存できませんでした")
    }
  }

  /// A report sent: blocking them is offered, unless they are already.
  private func reported(_ target: ReportTarget) {
    if blocked.contains(target.memberID) {
      say("通報しました")
    } else {
      blockQuestion = BlockQuestion(
        userID: target.memberID, name: target.name, block: true, afterReport: true)
    }
  }

  /// Blocks or unblocks someone, and says so.
  private func setBlocked(_ question: BlockQuestion) {
    Task {
      do {
        try await groupCalls.setBlocked(question.userID, question.block)
        say(question.block ? "\(question.name)をブロックしました" : "\(question.name)のブロックを解除しました")
      } catch {
        say("できませんでした。通信できるところでもう一度どうぞ")
      }
    }
  }

  private var isMuted: Bool {
    notifications.isMuted(threadID, in: group.id)
  }

  /// The other member's name, or the group's (/design's ChatTitle).
  private var title: String {
    otherID.flatMap { names[$0] } ?? group.name
  }

  /// How many are in the group's chat, or the group a one-to-one chat is in.
  private var subtitle: String {
    otherID == nil ? "\(chat.writers.count { !$0.left })人" : group.name
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
    say("\(dayName(day))に決めました")
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
    // The page stays while the first link does (spec/vectors/chat.json,
    // edited); else the new link's, if it has come.
    change.keepsPreview = keepsPreview(of: line.text, editedTo: change.text)
    if !change.keepsPreview, let preview = attachedPreview(for: text) {
      change.preview = preview.wire
    }
    write(.change(change))
    previewRemoved = nil
    stopEditing()
  }

  /// A line's menu: コピー, then for one's own 編集, and 送信取消 apart in
  /// the danger color (spec/chat.md, Editing and unsending).
  private func actions(for line: ChatLineRow, mine: Bool) -> [MessageAction] {
    let pinned = chat.state.pins.contains { $0.seq == line.seq }
    // Shared days, polls and photos have no words to copy or change.
    let words = line.days.isEmpty && line.photo == nil
    var actions = words ? [copy(line.text)] : []
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
      withAnimation { position.scrollTo(id: "line-\(line.opID)", anchor: .center) }
      ringed = target
      try? await Task.sleep(for: .milliseconds(500))
      withAnimation(.easeOut(duration: 0.7)) { ringed = nil }
    } else if !state.atStart, let first = state.lines.first?.seq {
      while !Task.isCancelled, await socket?.requestPage(of: threadID, before: first) != true {
        try? await Task.sleep(for: .seconds(1))
      }
    } else {
      jumpTarget = nil
    }
  }

  private func copy(_ text: String) -> MessageAction {
    MessageAction(title: "コピー", systemImage: "doc.on.doc") {
      UIPasteboard.general.string = plainText(text, nameOf: nameOf)
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
  case waiting(WaitingLine, startsRun: Bool)

  var id: String {
    switch self {
    case .day(let day): "day-\(day.key)"
    case .unread: "unread"
    case .line(let line, _): "line-\(line.opID)"
    // As the group's line will be, so it stays in place once taken.
    case .waiting(let line, _): "line-\(line.opID)"
    }
  }

  /// Whether more room goes before it: a run's first line, a day's title
  /// and ここから新着.
  var startsRun: Bool {
    switch self {
    case .day, .unread: true
    case .line(_, let startsRun), .waiting(_, let startsRun): startsRun
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
  /// Its first link's page.
  var preview: LinePreview?
  /// The days a line of shared days shares, drawn on a card.
  var days: [Day] = []
  /// Whose shifts its card shows.
  var members: [GroupMember] = []
  /// A poll's card, for days put to the vote.
  var poll: PollLine?
  /// The photo sent as the line, opened large by a tap.
  var photo: LinePhoto?
  var groupID = ""
  var onOpenPhoto: () -> Void = {}
  /// Opens the writer's profile, from their face.
  var onOpenProfile: () -> Void = {}
  /// The shift table on its first day, under its card.
  var shifts: GroupRoute?
  let time: Int64
  let edited: Bool
  let mine: Bool
  /// The writer's name at the start of a run of others' lines, for their
  /// face.
  let writer: String?
  /// Their name shows over the run too, as in a group chat.
  let named: Bool
  /// It starts a run of one writer's lines, its bubble's corner drawn in.
  let first: Bool
  let waiting: Bool
  /// A member's name, for the line's mentions.
  let nameOf: (String) -> String
  var reactions: [LineReaction] = []
  /// Pinned for everyone: a small pin by its time.
  var pinned = false
  /// Gone to from the pins: ringed for a moment.
  var ringed = false
  var meID: String?
  /// Puts the reader's reaction on, or takes it back.
  var onReact: (String) -> Void = { _ in }
  /// Its bubble is lifted over the chat, its place standing empty.
  var lifted = false
  /// Opens the line's reactions and menu, from where its bubble is, with
  /// the finger that opened them while it stays down.
  let onActions: (CGRect, HeldFinger?) -> Void
  /// Where the bubble is on the screen, for its menu.
  @State private var frame = CGRect.zero
  @State private var pressing = false
  /// The finger that opened the menu, followed until it lifts.
  @State private var held: HeldFinger?

  private static var avatar: CGFloat { 32 }

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      if !mine {
        Group {
          if let writer {
            Button { onOpenProfile() } label: {
              LetterAvatar(name: writer, size: Self.avatar)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(writer)のプロフィール")
          } else {
            Color.clear
          }
        }
        .frame(width: Self.avatar, height: writer == nil ? 0 : Self.avatar)
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
          LineContent(
            text: text, preview: preview, days: days, members: members, poll: poll, photo: photo,
            groupID: groupID, mine: mine, first: first, waiting: waiting, nameOf: nameOf
          )
          // A photo opens large at a tap; its menu is the long press's.
          .onTapGesture { if photo != nil, !waiting { onOpenPhoto() } }
          // Rung for a moment when gone to from the pins, as /design's
          // flash: a ring just outside the bubble, held, then fading.
          .background {
            ringShape
              .stroke(colors.accentBorder, lineWidth: 6)
              .opacity(ringed ? 1 : 0)
          }
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
            // and opens its reactions and menu once held; the finger then
            // picks one by lifting over it, as a system menu's does.
            .scaleEffect(pressing ? 0.96 : 1)
            .opacity(lifted ? 0 : 1)
            .animation(.easeOut(duration: 0.2), value: pressing)
            .onLongPressGesture(minimumDuration: HeldPress.duration) {
              UIImpactFeedbackGenerator(style: .medium).impactOccurred()
              pressing = false
              let finger = HeldFinger()
              held = finger
              onActions(frame, finger)
            } onPressingChanged: {
              pressing = $0
            }
            .gesture(
              HeldPress {
                held?.point = $0
              } onLift: {
                held?.point = $0
                held?.lifted = true
                held = nil
              })
            .accessibilityAction(named: "リアクションとメニュー") { onActions(frame, nil) }
          if !mine { meta }
        }
        if let shifts {
          // All the days, with everyone's shifts round them.
          NavigationLink(value: shifts) {
            Text("シフト表で見る")
              .font(.caption)
              .underline()
              .foregroundStyle(colors.accentDefault)
              .padding(.horizontal, 4)
          }
          .buttonStyle(.plain)
        }
        if !reactions.isEmpty {
          ReactionRow(reactions: reactions, meID: meID, nameOf: nameOf, onReact: onReact)
        }
      }
      .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
      .padding(mine ? .leading : .trailing, 40)
    }
    // The line reads as one; its reactions, a poll's 行ける and シフト表で見る
    // stay buttons of their own.
    .accessibilityElement(
      children: reactions.isEmpty && poll == nil && shifts == nil ? .combine : .contain)
  }

  /// The ring's shape: the bubble's, or the card's.
  private var ringShape: AnyShape {
    days.isEmpty && photo == nil
      ? AnyShape(BubbleShape(mine: mine, first: first))
      : AnyShape(RoundedRectangle(cornerRadius: Radius.lg))
  }

  /// 編集済み over the time, toward the bubble; a clock while it waits.
  private var meta: some View {
    VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
      if edited || pinned {
        HStack(spacing: 2) {
          if pinned {
            Image(systemName: "pin.fill")
              .imageScale(.small)
              .accessibilityLabel("ピン留め中")
          }
          if edited {
            Text("編集済み")
          }
        }
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
/// the accent, the first of a run with its corner by the writer drawn in,
/// dimmed while it waits to be sent.
/// The days from one through another.
private struct DaySpan: Hashable {
  let from: Day
  let through: Day
}

/// What a line is drawn as: its words in a bubble, or its days on a card.
struct LineContent: View {
  let text: String
  /// Its first link's page.
  var preview: LinePreview?
  let days: [Day]
  let members: [GroupMember]
  /// Its days are put to the vote, with what the card needs.
  var poll: PollLine?
  /// The photo sent as the line, from the group's photos.
  var photo: LinePhoto?
  var groupID = ""
  let mine: Bool
  let first: Bool
  let waiting: Bool
  let nameOf: (String) -> String

  var body: some View {
    if let photo {
      PhotoLine(photo: photo, groupID: groupID, waiting: waiting)
    } else if let poll {
      PollCard(
        days: days, votes: poll.votes, decided: poll.decided, members: members,
        names: poll.names, meID: poll.meID, canDecide: poll.canDecide, waiting: waiting,
        onVote: poll.onVote, onDecide: poll.onDecide)
    } else if days.isEmpty {
      MessageBubble(
        text: text, mine: mine, first: first, waiting: waiting, nameOf: nameOf, preview: preview)
    } else {
      DayCard(days: days, members: members)
        .opacity(waiting ? 0.6 : 1)
    }
  }
}

struct MessageBubble: View {
  @Environment(\.themeColors) private var colors
  let text: String
  let mine: Bool
  let first: Bool
  let waiting: Bool
  /// A member's name, for the line's mentions.
  let nameOf: (String) -> String
  /// Its first link's page, under its words.
  var preview: LinePreview?

  /// The invitation code of its first link, when that is one of
  /// Pochical's invitations.
  private var invitation: String? {
    firstLink(text).flatMap { URL(string: $0) }.flatMap(inviteCode(of:))
  }

  /// How wide a bubble with a page is, as /design's linked bubble.
  private static var linkedWidth: CGFloat { 240 }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(words)
        .font(.body)
        .lineSpacing(3)
        .foregroundStyle(mine ? colors.accentOnFill : colors.textPrimary)
        .tint(mine ? colors.accentOnFill : colors.accentDefault)
      // An invitation's card takes the place of the one page.
      if let invitation {
        InviteCard(code: invitation, mine: mine)
      } else if let preview {
        LinkPreviewCard(preview: preview, mine: mine)
      }
    }
    .frame(
      width: preview == nil && invitation == nil ? nil : Self.linkedWidth, alignment: .leading)
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
      .background(
        mine ? colors.accentFill : colors.fillTertiary,
        in: BubbleShape(mine: mine, first: first)
      )
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
        piece.font = .body.weight(.semibold)
        if !mine { piece.foregroundColor = colors.accentDefault }
      } else if let link = part.url.flatMap({ URL(string: $0, encodingInvalidCharacters: true) }) {
        piece.link = link
        piece.underlineStyle = .single
      }
      words += piece
    }
    return words
  }

}

/// A bubble's outline: round all over, but the first of a run, as LINE
/// and WhatsApp draw one: its top corner by the writer's side drawn in, by
/// the face and name the run starts with, so it says whose words follow.
struct BubbleShape: Shape {
  let mine: Bool
  let first: Bool

  nonisolated func path(in rect: CGRect) -> Path {
    let drawnIn = first ? Radius.sm : Radius.lg
    return UnevenRoundedRectangle(
      topLeadingRadius: mine ? Radius.lg : drawnIn, bottomLeadingRadius: Radius.lg,
      bottomTrailingRadius: Radius.lg, topTrailingRadius: mine ? drawnIn : Radius.lg,
      style: .continuous
    )
    .path(in: rect)
  }
}

/// Someone else whose profile is open.
private struct ProfileOf: Identifiable {
  let id: String
  let name: String
}

/// Reporting a line or a member, their profile, and blocking them asked
/// first (spec/chat.md, Reporting and blocking).
private struct ReportAndBlock: ViewModifier {
  let groupID: String
  let groupName: String
  let blocked: Set<String>
  @Binding var reporting: ReportTarget?
  @Binding var profileOf: ProfileOf?
  @Binding var blockQuestion: BlockQuestion?
  let onReported: (ReportTarget) -> Void
  let onSetBlocked: (BlockQuestion) -> Void
  /// What follows once a sheet has gone: one cannot come up while another
  /// is going.
  @State private var next: (() -> Void)?

  func body(content: Content) -> some View {
    content
      .sheet(item: $reporting, onDismiss: runNext) { target in
        ReportSheet(target: target, groupID: groupID) { next = { onReported(target) } }
      }
      .sheet(item: $profileOf, onDismiss: runNext) { person in
        MemberProfileSheet(
          name: person.name, groupName: groupName, blocked: blocked.contains(person.id),
          onReport: { next = { reporting = .member(id: person.id, name: person.name) } },
          onBlock: {
            next = {
              blockQuestion = BlockQuestion(userID: person.id, name: person.name, block: true)
            }
          },
          onUnblock: {
            next = {
              blockQuestion = BlockQuestion(userID: person.id, name: person.name, block: false)
            }
          })
      }
      .alert(
        blockQuestion?.title ?? "", isPresented: Binding(
          get: { blockQuestion != nil }, set: { if !$0 { blockQuestion = nil } }),
        presenting: blockQuestion
      ) { question in
        Button(question.afterReport ? "しない" : "キャンセル", role: .cancel) {}
        Button(question.block ? "ブロック" : "解除", role: question.block ? .destructive : nil) {
          onSetBlocked(question)
        }
      } message: { question in
        Text(question.message)
      }
  }

  private func runNext() {
    let action = next
    next = nil
    action?()
  }
}
