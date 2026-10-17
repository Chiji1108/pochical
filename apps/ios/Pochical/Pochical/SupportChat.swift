import Nuke
import PhotosUI
import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import UIKit

/// 設定's way into the chat with the people who make Pochical (/design's
/// SupportRow), drawn as a chat in the chats' list is: the app's icon, who
/// it is with and the latest line, or the draft left in it, and the
/// answers not read yet.
struct SupportRow: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  /// The chat's lines, nil until they come.
  @State private var lines: [SupportLine]?
  @State private var unread = 0
  @FetchOne(SupportDraft.all) private var held: SupportDraft?

  private var latest: SupportLine? { lines?.last }

  var body: some View {
    NavigationLink {
      SupportChatScreen()
    } label: {
      HStack(spacing: 12) {
        AppIconChoice.current.image(size: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text("作っている人とチャット").foregroundStyle(colors.textPrimary)
          preview
            .font(.footnote)
            .foregroundStyle(colors.textTertiary)
            .lineLimit(1)
        }
        Spacer(minLength: 8)
        // The latest line's time over the answers not read, as a chat's
        // row in the hub has them (/design's ChatListRow).
        if latest != nil || unread > 0 {
          VStack(alignment: .trailing, spacing: 4) {
            if let latest {
              Text(ChatTime.listed(Int64(latest.sentAt.timeIntervalSince1970 * 1000)))
                .font(.caption2)
                .foregroundStyle(colors.textQuaternary)
            }
            if unread > 0 {
              Text("\(unread)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(colors.accentOnFill)
                .padding(.horizontal, 7)
                .frame(minWidth: 20, minHeight: 20)
                .background(colors.accentFill, in: Capsule())
                .accessibilityLabel("未読\(unread)件")
            }
          }
        }
      }
    }
    // Read again each time the settings show it, as coming back from the
    // chat has read its answers, and as an answer comes.
    .onAppear { Task { await refresh() } }
    .onReceive(NotificationCenter.default.publisher(for: SupportLine.answered)) { _ in
      Task { await refresh() }
    }
  }

  /// What was being written, kept as the chat was left, in place of the
  /// latest line: 下書き： in the danger color, as a chat in the chats'
  /// list says it (spec/chat.md, Drafts).
  private var preview: Text {
    if let draft = held?.kept(lines: lines) {
      return Text("\(Text("下書き：").foregroundStyle(colors.dangerDefault))\(draft.text)")
    }
    return Text(latest.map(SupportChatScreen.summary) ?? "ほしい機能や不具合のこと、気軽にどうぞ")
  }

  private func refresh() async {
    guard let chat = try? await groupCalls.supportChat() else { return }
    lines = chat.lines
    unread = chat.unread
  }
}

/// The chat with the people who make Pochical (/design's SupportChatPage):
/// a small wish or trouble is easier written in a chat than a mail, and
/// the answer comes back in the same place. Drawn, scrolled and held as
/// the group chats are, on their lines (ChatLinesView): reactions, 返信,
/// コピー and, on one's own lines, 送信取消; not what only a group needs,
/// and no 編集, as an answer may already be written to the words. Its head
/// says plainly who reads it and what reaches them. The server gives its
/// whole history at once, so no earlier lines are asked for.
struct SupportChatScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.openURL) private var openURL
  @Environment(\.groupCalls) private var groupCalls
  @Environment(Settings.self) private var settings
  @Environment(\.look) private var look
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.displayScale) private var displayScale
  @Dependency(\.defaultDatabase) private var database
  @State private var lines: [SupportLine] = []
  /// The lines have come from the server once.
  @State private var loaded = false
  /// The lines have been asked for once, come or not.
  @State private var opened = false
  /// The draft the chat opened with was put back in the composer; its
  /// quote waits for the lines to come.
  @State private var tookDraft = false
  /// Lines being sent, shown faint until the server keeps them; one that
  /// could not go waits by its ! to be sent again or deleted.
  @State private var waiting: [Waiting] = []
  /// What is being written, read by the composer alone (ChatScreen's).
  @State private var draft = ChatDraft()
  /// The line whose 送信取消 waits to be confirmed.
  @State private var unsending: SupportLine?
  /// The line given an emoji from the keyboard (+).
  @State private var reactingTo: SupportLine?
  /// The line whose reactions and menu are open.
  @State private var acting: String?
  /// The line whose bubble is lifted over the chat while its menu is open.
  @State private var marks = LineMarks()
  /// Lines whose long words are opened.
  @State private var unfolded: Set<String> = []
  /// The photos open large.
  @State private var viewing: PhotoViewing?
  /// Said over the lines for a moment, as a toast.
  @State private var notice: String?
  /// Saves and copies done, each felt as it is (spec/haptics.md).
  @State private var done = 0
  @State private var notices = 0
  /// The sends so far, one after another, so the lines keep their order.
  @State private var sending: Task<Void, Never>?
  /// Moves the lines, at the moments the chat does (ChatScreen's).
  @State private var scroller = ChatLinesProxy()
  /// What scrolling changes, read by the ↓ and the floating day.
  @State private var scroll = ChatScroll()
  /// The chat keeps to its latest line, as a group chat does: until the
  /// person scrolls up, and again once they scroll back down, send, or
  /// tap ↓.
  @State private var following = true
  /// What is done on a line, for every line of the chat.
  @State private var lineActions = Handler<(lineID: String, action: LineAction)>()
  /// Fetches ahead the photos of the lines near those in sight.
  @State private var photoPrefetch = PhotoPrefetch()

  struct Waiting: Identifiable, Hashable {
    let id: String
    var text = ""
    var photo: LinePhoto?
    var replyTo: String?
    /// The page of its words' first link, as read while writing.
    var preview: LinePreview?
    /// Taken off with ×, so the server does not read it either.
    var withoutPreview = false
    var failed = false
    var madeAt = Date.now
  }

  /// Who answers here: Pochical's people, under the app's name.
  private static let supportName = "ポチカル"
  /// Who put an emoji on, as a reaction's pill and its list name them.
  private static let names = [SupportLine.me: "自分", SupportLine.support: supportName]

  var body: some View {
    let listed = items
    let byID = Dictionary(listed.map { ($0.id, $0) }) { first, _ in first }
    // Laid out once the lines have come, all at once at the latest; before
    // that only the lines sent meanwhile, should one be.
    let laidOut = loaded || !waiting.isEmpty || !lines.isEmpty
    ChatLinesView(
      rows: laidOut ? rows(listed) : [],
      row: { id in AnyView(row(byID[id], parted: id != listed.first?.id)) },
      composer: AnyView(
        // The group chats' composer, without what only a group has: days
        // to share, names to mention, and who is writing.
        ChatComposer(
          draft: draft, groupID: ChatPhotos.support, quoteOf: quote(of:), onSubmit: sendAll,
          say: say)),
      latest: AnyView(
        LatestButton(scroll: scroll, unread: 0) {
          following = true
          scroller.toLatest(animated: true)
        }),
      ground: colors.backgroundBase, scroll: scroll, proxy: scroller, following: $following,
      shown: laidOut, holds: acting != nil, dayOver: { dayOver($0, in: listed) },
      replySwipe: { replySwipe(byID[$0]) },
      onReply: { id in
        if case .line(let line, _, _) = byID[id] { reply(to: line) }
      },
      // Short, it starts at the top under its head, as /design's.
      fewAtTop: true,
      onNear: { prefetchPhotos(of: $0.compactMap { byID[$0] }) }
    )
    // The composer rides the keyboard on its own guide, under the lines.
    .ignoresSafeArea(.container, edges: .bottom)
    .ignoresSafeArea(.keyboard)
    .background(colors.backgroundBase)
    // The head alone while the lines have not come (offline).
    .overlay(alignment: .top) {
      if opened, !laidOut {
        intro.padding(.top, 12)
      }
    }
    .overlay(alignment: .top) {
      FloatingDay(scroll: scroll, covered: notice != nil)
    }
    .overlay(alignment: .top) {
      if let notice {
        NoticeCapsule(words: notice)
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .navigationTitle(Self.supportName)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.hidden, for: .tabBar)
    .task { await load() }
    // An answer, a reaction or a line taken back by Pochical's people
    // shows as made, as a group chat's do.
    .onReceive(NotificationCenter.default.publisher(for: SupportLine.answered)) { _ in
      Task { await load() }
    }
    // One's own line just sent shows at the foot, wherever the lines were.
    .onChange(of: waiting.last?.id) { _, sent in
      guard sent != nil else { return }
      following = true
      Task { @MainActor in scroller.toLatest(animated: !reduceMotion) }
    }
    .onAppear {
      Notifications.shared.supportOpen = true
      if !tookDraft {
        tookDraft = true
        takeDraft()
      }
    }
    .onDisappear {
      Notifications.shared.supportOpen = false
      photoPrefetch.stop()
      closeActions()
      keepDraft()
    }
    // As the app leaves the screen, what is written is kept, as a group
    // chat keeps it then.
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { keepDraft() }
    }
    .sheet(item: $reactingTo) { line in
      EmojiKeyboardSheet(title: "リアクション") { react($0, on: line) }
    }
    .photoViewer($viewing, groupID: ChatPhotos.support) { photo in
      await savePhoto(photo, in: ChatPhotos.support, calls: groupCalls)
    }
    .sensoryFeedback(.success, trigger: done)
    .alert(
      "送信を取り消しますか？",
      isPresented: Binding { unsending != nil } set: { if !$0 { unsending = nil } }
    ) {
      Button("キャンセル", role: .cancel) {}
      Button("取り消す", role: .destructive) {
        if let line = unsending { unsend(line) }
      }
    } message: {
      Text("\(Self.supportName)を作っている人のチャットからも消えます。")
    }
    .handles(lineActions) { act($0.action, on: $0.lineID) }
  }

  // MARK: Lines

  /// What the lines show, in order: the head, each day's title, and the
  /// lines with whether each starts a run, the kept ones with whether
  /// they show their time.
  private var items: [SupportItem] {
    var items: [SupportItem] = [.intro]
    var lastDay: Day?
    /// Puts the day's title before the day's first line, saying whether
    /// it was put.
    func newDay(_ date: Date) -> Bool {
      let day = Day(date, in: .current)
      guard day != lastDay else { return false }
      items.append(.day(day))
      lastDay = day
      return true
    }
    for (index, line) in lines.enumerated() {
      let before = index > 0 ? lines[index - 1] : nil
      let after = index + 1 < lines.count ? lines[index + 1] : nil
      let first = newDay(line.sentAt) || !Self.goesOn(line, after: before)
      // One time for a run's lines sent in the same minute, by the last of
      // them (spec/chat.md, In a message).
      let showsTime =
        after.map { !Self.goesOn($0, after: line) || Self.clock($0) != Self.clock(line) } ?? true
      items.append(.line(line, first: first, showsTime: showsTime))
    }
    var mineBefore = lines.last.map { !$0.fromSupport && !$0.unsent } ?? false
    for line in waiting {
      let first = newDay(line.madeAt) || !mineBefore || line.replyTo != nil
      items.append(.waiting(line, first: first))
      mineBefore = true
    }
    return items
  }

  /// The lines' items, each with all its row draws, so a line is drawn
  /// again, and measured, only as that changes.
  private func rows(_ items: [SupportItem]) -> [LinesRow] {
    items.map { item in
      var quote: LineQuote?
      var opened = false
      switch item {
      case .line(let line, _, _):
        quote = line.replyTo.map(self.quote(of:))
        opened = unfolded.contains(line.id)
      case .waiting(let line, _):
        quote = line.replyTo.map(self.quote(of:))
      case .intro, .day:
        break
      }
      return LinesRow(
        id: item.id, look: AnyHashable(SupportRowLook(item: item, quote: quote, unfolded: opened)))
    }
  }

  /// The item as the chat's lines draw it: lines close within a run,
  /// parted where the writer changes and under each day's title.
  @ViewBuilder private func row(_ item: SupportItem?, parted: Bool) -> some View {
    if let item {
      Group {
        switch item {
        case .intro:
          intro
        case .day(let day):
          DayChip(day: day)
        case .line(let line, _, _) where line.unsent:
          Text(unsentLine(Self.supportName, mine: !line.fromSupport))
            .font(.caption)
            .foregroundStyle(colors.textTertiary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        case .line(let line, let first, let showsTime):
          let mine = !line.fromSupport
          LineView(
            lineID: line.id, text: line.text, preview: line.preview, photo: line.photo,
            quote: line.replyTo.map(quote(of:)), unfolded: unfolded.contains(line.id),
            groupID: ChatPhotos.support, time: Self.ms(line.sentAt), showsTime: showsTime,
            edited: false, mine: mine, writer: mine || !first ? nil : Self.supportName,
            appFace: true, named: false, first: first, waiting: false, names: Self.names,
            reactions: line.reactions, countedReactions: true, marks: marks, meID: SupportLine.me,
            actions: lineActions)
        case .waiting(let line, let first):
          LineView(
            lineID: line.id, text: line.text, preview: line.preview, photo: line.photo,
            quote: line.replyTo.map(quote(of:)), groupID: ChatPhotos.support,
            time: Self.ms(line.madeAt), edited: false, mine: true, writer: nil, named: false,
            first: first, waiting: true, failed: line.failed, names: Self.names, marks: marks,
            actions: lineActions)
        }
      }
      .padding(.top, item.startsRun && parted ? CGFloat(Chat.runGap - Chat.lineGap) : 0)
    }
  }

  /// The day whose lines are at the top, from the first item in sight:
  /// none while that is the day's own title or the head.
  private func dayOver(_ top: String, in items: [SupportItem]) -> Day? {
    guard let at = items.firstIndex(where: { $0.id == top }) else { return nil }
    for item in items[...at].reversed() {
      if case .day(let day) = item {
        return item.id == top ? nil : day
      }
    }
    return nil
  }

  /// Who this reaches, and everything that does.
  private var intro: some View {
    VStack(spacing: 8) {
      AppIconChoice.current.image(size: 56)
      Text("ポチカルを作っている人に届きます")
        .font(.headline)
        .foregroundStyle(colors.textPrimary)
      Text("使いにくいところ、ほしい機能、不具合のこと。ちょっとしたことでも、気軽に書いてください。返事は数日のうちに、ここに届きます。")
        .font(.subheadline)
        .foregroundStyle(colors.textSecondary)
      Text("書いたことと一緒に、アプリと端末の情報が届きます。\n\(Self.device)")
        .font(.caption)
        .foregroundStyle(colors.textTertiary)
    }
    .multilineTextAlignment(.center)
    .frame(maxWidth: 300)
    .padding(.vertical, 16)
  }

  // MARK: Doing

  /// Acts on the line `id` as the chat is now.
  private func act(_ action: LineAction, on id: String) {
    switch items.first(where: { $0.id == "line-\(id)" }) {
    case .line(let line, let first, _): act(action, on: line, first: first)
    case .waiting(let line, let first): act(action, onWaiting: line, first: first)
    default: break
    }
  }

  private func act(_ action: LineAction, on line: SupportLine, first: Bool) {
    switch action {
    case .unfold:
      // Opened where it is, its words going on down from there.
      following = false
      scroller.growDown("line-\(line.id)")
      withAnimation { _ = unfolded.insert(line.id) }
    case .openPhoto:
      if let photo = line.photo {
        viewing = PhotoViewing(photo, among: lines.filter { !$0.unsent }.compactMap(\.photo))
      }
    case .openQuote:
      // A tapped quote goes to the line it is of.
      guard let to = line.replyTo, lines.contains(where: { $0.id == to }) else { return }
      following = false
      scroller.show("line-\(to)", at: .center, animated: true)
    case .react(let emoji):
      react(emoji, on: line)
    case .hold(let spot, let finger, let link):
      let mine = !line.fromSupport
      let bubble = AnyView(
        LineContent(
          text: line.text, preview: line.preview, days: [], members: [], photo: line.photo,
          quote: line.replyTo.map(quote(of:)), groupID: ChatPhotos.support, mine: mine,
          first: first, waiting: false, nameOf: { _ in "" },
          // As it is drawn in the chat, opened at 続きを読む or not.
          unfolded: unfolded.contains(line.id)))
      // A link held has its own menu, without the reactions.
      if let link {
        openActions(
          MessageActionsRequest(
            lineID: line.id, spot: spot, mine: mine, bubble: bubble, finger: finger,
            actions: linkActions(link, open: { openURL(link) }, copied: { sayDone("コピーしました") })))
      } else {
        openActions(
          MessageActionsRequest(
            lineID: line.id, spot: spot, mine: mine, bubble: bubble, finger: finger,
            reactions: line.reactions, meID: SupportLine.me,
            onReact: { react($0, on: line) }, onMoreReactions: { reactingTo = line },
            actions: actions(for: line)))
      }
    case .openProfile, .retry, .stopSending, .vote, .decide:
      break
    }
  }

  private func act(_ action: LineAction, onWaiting line: Waiting, first: Bool) {
    switch action {
    case .retry(let source):
      source?.askNotSent(
        photo: line.photo != nil, sendAgain: { send(line) }, delete: { delete(line) },
        closed: {})
    case .stopSending:
      stopSending(line)
    case .hold(let spot, let finger, _):
      // On its way, only コピー yet for words.
      guard line.photo == nil else { return }
      openActions(
        MessageActionsRequest(
          lineID: line.id, spot: spot, mine: true,
          bubble: AnyView(
            LineContent(
              text: line.text, preview: line.preview, days: [], members: [],
              quote: line.replyTo.map(quote(of:)), groupID: ChatPhotos.support, mine: true,
              first: first, waiting: !line.failed, nameOf: { _ in "" })),
          finger: finger, actions: [copy(line.text)]))
    default:
      break
    }
  }

  /// How a line is dragged to reply to it, as its menu's 返信: any line
  /// kept and not taken back.
  private func replySwipe(_ item: SupportItem?) -> ReplySwipe? {
    guard case .line(let line, _, _) = item, !line.unsent else { return nil }
    return line.fromSupport ? .rightward : .leftward
  }

  /// Answers a line (返信): quoted over the composer until sent or ×.
  private func reply(to line: SupportLine) {
    withAnimation { draft.replyTo = line.id }
    draft.field.focus()
  }

  /// A line's menu (/design's): 返信, then コピー for words or 保存 for a
  /// photo, and for one's own, 送信取消 apart in the danger color.
  private func actions(for line: SupportLine) -> [MessageAction] {
    var actions = [
      MessageAction(title: "返信", systemImage: "arrowshape.turn.up.left") { reply(to: line) }
    ]
    if let photo = line.photo {
      actions.append(
        MessageAction(title: "保存", systemImage: "square.and.arrow.down") { save(photo) })
    } else {
      actions.append(copy(line.text))
    }
    if !line.fromSupport {
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
      UIPasteboard.general.string = text
      sayDone("コピーしました")
    }
  }

  /// The line a reply answers, as its quote shows it: as the chat holds
  /// it, else said to be earlier.
  private func quote(of id: String) -> LineQuote {
    guard let line = lines.first(where: { $0.id == id }) else {
      return LineQuote(seq: 0, words: "以前のメッセージ")
    }
    let writer = line.fromSupport ? Self.supportName : "自分"
    if line.unsent {
      return LineQuote(seq: 0, writer: writer, words: "取り消されたメッセージ")
    }
    return LineQuote(
      seq: 0, writer: writer,
      words: lineWords(line.text, days: [], photo: line.photo != nil, nameOf: { _ in "" }),
      photo: line.photo)
  }

  /// The last line, as 設定's row shows it.
  static func summary(_ line: SupportLine) -> String {
    if line.unsent { return unsentLine(supportName, mine: !line.fromSupport) }
    return lineWords(line.text, days: [], photo: line.photo != nil, nameOf: { _ in "" })
  }

  private func save(_ photo: LinePhoto) {
    Task {
      let saved = await savePhoto(photo, in: ChatPhotos.support, calls: groupCalls)
      if saved {
        sayDone("写真を保存しました")
      } else {
        say("保存できませんでした")
      }
    }
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

  /// Opens a line's reactions and menu over everything (ChatScreen's).
  private func openActions(_ request: MessageActionsRequest) {
    acting = request.lineID
    marks.lifted = request.lineID
    OverlayWindow.shared.show(
      MessageActionsOverlay(request: request) { closeActions() }
        .environment(\.themeColors, colors)
        .environment(settings)
        .environment(\.look, look))
  }

  /// Gives the line back its bubble, then takes the overlay away once the
  /// chat has drawn it (ChatScreen's).
  private func closeActions() {
    acting = nil
    marks.lifted = nil
    OverlayWindow.shared.hide(after: .milliseconds(50))
  }

  /// Puts the user's `emoji` on the line, or takes it back if it was
  /// theirs already, shown as the server keeps it.
  private func react(_ emoji: String, on line: SupportLine) {
    let current = lines.first { $0.id == line.id } ?? line
    let on = !current.reactions.contains { $0.emoji == emoji && $0.userIDs.contains(SupportLine.me) }
    Task {
      guard let kept = try? await groupCalls.reactSupport(emoji, on: on, line: line.id) else { return }
      replace(kept)
    }
  }

  private func unsend(_ line: SupportLine) {
    if draft.replyTo == line.id { draft.replyTo = nil }
    Task {
      guard let kept = try? await groupCalls.unsendSupport(line.id) else { return }
      if let photo = line.photo { ChatPhotos.forget(photo.id, in: ChatPhotos.support) }
      replace(kept)
    }
  }

  private func replace(_ line: SupportLine) {
    if let index = lines.firstIndex(where: { $0.id == line.id }) {
      lines[index] = line
    }
  }

  private func load() async {
    defer { opened = true }
    guard let chat = try? await groupCalls.supportChat() else { return }
    lines = chat.lines
    // The draft opened with, as the lines are now: a reply to a line
    // taken back since keeps its words without the quote.
    if !loaded, let replyTo = draft.replyTo,
      SupportDraft(text: draft.text, replyTo: replyTo).kept(lines: lines)?.replyTo == nil
    {
      draft.replyTo = nil
    }
    loaded = true
    if chat.unread > 0 {
      try? await groupCalls.markSupportRead()
    }
  }

  // MARK: Drafts

  /// Puts the draft the chat was left with back in the composer
  /// (spec/chat.md, The chat with Pochical's people).
  private func takeDraft() {
    guard let held = try? database.read({ try SupportDraft.held(db: $0) }) else { return }
    draft.text = held.text
    draft.replyTo = held.replyTo
  }

  /// Keeps what is being written, as the chat is left and as the app
  /// leaves the screen, with the lines once they have come.
  private func keepDraft() {
    let kept = SupportDraft(text: draft.text, replyTo: draft.replyTo)
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    try? database.write { db in
      try SupportDraft.keep(kept, lines: loaded ? lines : nil, now: now, db: db)
    }
  }

  // MARK: Sending

  /// Sends the tray's photos, each its own line, then the words; the reply
  /// goes with the first.
  private func sendAll() {
    guard !draft.readingPhotos else { return }
    let text = String(draft.field.commit().prefix(TextLimits.chatMessage))
      .trimmingCharacters(in: .whitespacesAndNewlines)
    var replyTo = draft.replyTo
    var lines: [Waiting] = []
    for picked in draft.photos {
      guard (try? ChatPhotos.keep(picked.shrunk.jpeg, as: picked.id, in: ChatPhotos.support)) != nil
      else { continue }
      let photo = picked.shrunk.line(picked.id)
      lines.append(Waiting(id: UUID().uuidString.lowercased(), photo: photo, replyTo: replyTo))
      replyTo = nil
    }
    if !text.isEmpty {
      let removed = draft.previewRemoved
      lines.append(
        Waiting(
          id: UUID().uuidString.lowercased(), text: text, replyTo: replyTo,
          preview: draft.attachedPreview(for: text),
          withoutPreview: removed != nil && previewLink(text) == removed))
    }
    guard !lines.isEmpty else { return }
    draft.text = ""
    draft.replyTo = nil
    draft.previewRemoved = nil
    withAnimation { draft.photos = [] }
    for line in lines { send(line) }
  }

  /// Sends a line, faint until kept, after the ones before it; a photo is
  /// uploaded first. One not sent, sent again, goes after the rest as if
  /// written now, with the same id, so it is kept once.
  private func send(_ line: Waiting) {
    var line = line
    line.failed = false
    line.madeAt = .now
    waiting.removeAll { $0.id == line.id }
    waiting.append(line)
    let before = sending
    sending = Task {
      await before?.value
      // Stopped with × while it waited its turn.
      guard waiting.first(where: { $0.id == line.id })?.failed == false else { return }
      do {
        if let photo = line.photo {
          try await groupCalls.uploadSupportPhoto(photo.id)
          // Stopped with × as its upload ended; past here × does nothing,
          // so the line is sent as it shows.
          let going = PhotoUploads.shared.sending(photo.id) {
            waiting.first(where: { $0.id == line.id })?.failed == false
          }
          guard going else { return }
        }
        let kept = try await groupCalls.sendSupport(
          line.text, id: line.id, device: Self.device, replyTo: line.replyTo, photo: line.photo,
          preview: line.preview, withoutPreview: line.withoutPreview)
        waiting.removeAll { $0.id == line.id }
        lines.append(kept)
        if let photo = line.photo { PhotoUploads.shared.forget(photo.id) }
      } catch {
        // Not when stopped with ×, which marked it already.
        if let index = waiting.firstIndex(where: { $0.id == line.id }), !waiting[index].failed {
          ReviewPrompt.troubled = true
          waiting[index].failed = true
        }
      }
    }
  }

  /// Stops a line's photo going up, as the group chats' × does: the line
  /// is not sent, to send again or delete.
  /// Nothing once its photo is up and the line is being sent.
  private func stopSending(_ line: Waiting) {
    if let photo = line.photo, !PhotoUploads.shared.stop(photo.id) { return }
    if let index = waiting.firstIndex(where: { $0.id == line.id }) {
      waiting[index].failed = true
    }
  }

  /// Fetches ahead the photos of the items near those in sight, as the
  /// group chats do.
  private func prefetchPhotos(of near: [SupportItem]) {
    let photos = near.compactMap { item -> LinePhoto? in
      switch item {
      case .line(let line, _, _): line.unsent ? nil : line.photo
      case .waiting(let line, _): line.photo
      case .intro, .day: nil
      }
    }
    photoPrefetch.near(photos, in: ChatPhotos.support, scale: displayScale, calls: groupCalls)
  }

  /// Deletes a line not sent, and the photo kept on the device for it.
  private func delete(_ line: Waiting) {
    waiting.removeAll { $0.id == line.id }
    if let photo = line.photo {
      PhotoUploads.shared.forget(photo.id)
      ChatPhotos.forget(photo.id, in: ChatPhotos.support)
    }
  }

  private static func ms(_ date: Date) -> Int64 {
    Int64(date.timeIntervalSince1970 * 1000)
  }

  private static func clock(_ line: SupportLine) -> String {
    ChatTime.clock(ms(line.sentAt))
  }

  /// `line` goes on the run of `before`: the same writer, neither taken
  /// back, and no reply starting a run of its own.
  private static func goesOn(_ line: SupportLine, after before: SupportLine?) -> Bool {
    guard let before else { return false }
    return before.fromSupport == line.fromSupport && !before.unsent && !line.unsent
      && line.replyTo == nil
  }

  /// The app's version and the device, as they reach Pochical's people.
  private static var device: String {
    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    let system = UIDevice.current
    return "ポチカル \(version)・\(system.model)・\(system.systemName) \(system.systemVersion)"
  }
}

/// One thing in the support chat's lines.
private enum SupportItem: Hashable {
  /// The head: who the chat reaches, and what does.
  case intro
  case day(Day)
  case line(SupportLine, first: Bool, showsTime: Bool)
  case waiting(SupportChatScreen.Waiting, first: Bool)

  var id: String {
    switch self {
    case .intro: "intro"
    case .day(let day): "day-\(day.key)"
    case .line(let line, _, _): "line-\(line.id)"
    // As the server's line will be, so it stays in place once kept.
    case .waiting(let line, _): "line-\(line.id)"
    }
  }

  /// More room goes before it: a run's first line and a day's title.
  var startsRun: Bool {
    switch self {
    case .intro: false
    case .day: true
    case .line(_, let first, _), .waiting(_, let first): first
    }
  }
}

/// All a support line's row draws.
private struct SupportRowLook: Hashable {
  let item: SupportItem
  let quote: LineQuote?
  let unfolded: Bool
}
