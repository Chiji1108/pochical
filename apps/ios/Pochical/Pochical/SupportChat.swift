import PhotosUI
import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

/// 設定's way into the chat with the people who make Pochical (/design's
/// SupportRow), drawn as a chat in the chats' list is: the app's icon, who
/// it is with and the latest line, and the answers not read yet.
struct SupportRow: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @State private var latest: SupportLine?
  @State private var unread = 0

  var body: some View {
    NavigationLink {
      SupportChatScreen()
    } label: {
      HStack(spacing: 12) {
        AppIconChoice.current.image(size: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text("作っている人とチャット").foregroundStyle(colors.textPrimary)
          Text(latest.map(SupportChatScreen.summary) ?? "ほしい機能や不具合のこと、気軽にどうぞ")
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

  private func refresh() async {
    guard let chat = try? await groupCalls.supportChat() else { return }
    latest = chat.lines.last
    unread = chat.unread
  }
}

/// The chat with the people who make Pochical (/design's SupportChatPage):
/// a small wish or trouble is easier written in a chat than a mail, and
/// the answer comes back in the same place. Drawn and held as the group
/// chats are: reactions, 返信, コピー and, on one's own lines, 送信取消; not
/// what only a group needs, and no 編集, as an answer may already be
/// written to the words. Its head says plainly who reads it and what
/// reaches them.
struct SupportChatScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.openURL) private var openURL
  @Environment(\.groupCalls) private var groupCalls
  @Environment(Settings.self) private var settings
  @Environment(\.look) private var look
  @State private var lines: [SupportLine] = []
  /// Lines being sent, shown faint until the server keeps them; one that
  /// could not go waits to be tried again.
  @State private var waiting: [Waiting] = []
  /// What is being written, read by the composer alone (ChatScreen's).
  @State private var draft = ChatDraft()
  /// The line whose 送信取消 waits to be confirmed.
  @State private var unsending: SupportLine?
  /// The line given an emoji from the keyboard (+).
  @State private var reactingTo: SupportLine?
  /// The line whose reactions and menu are open, its bubble lifted.
  @State private var acting: String?
  /// Lines whose long words are opened.
  @State private var unfolded: Set<String> = []
  /// The line a tapped quote goes to.
  @State private var going: String?
  /// The photo open large.
  @State private var viewing: LinePhoto?
  /// Said over the lines for a moment, as a toast.
  @State private var notice: String?
  /// Saves and copies done, each felt as it is (spec/haptics.md).
  @State private var done = 0
  @State private var notices = 0
  /// The sends so far, one after another, so the lines keep their order.
  @State private var sending: Task<Void, Never>?

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
  }

  /// Who answers here: Pochical's people, under the app's name.
  private static let supportName = "ポチカル"

  var body: some View {
    ScrollViewReader { reader in
      ScrollView {
        LazyVStack(spacing: CGFloat(Chat.lineGap)) {
          intro
          ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
            let before = index > 0 ? lines[index - 1] : nil
            let after = index + 1 < lines.count ? lines[index + 1] : nil
            let newDay = before.map { Self.day(of: $0) != Self.day(of: line) } ?? true
            // The day over its first line, as in the group chats.
            if newDay {
              DayChip(day: Self.day(of: line))
            }
            let first = newDay || !Self.goesOn(line, after: before)
            // One time for a run's lines sent in the same minute, by the
            // last of them (spec/chat.md, In a message).
            let showsTime =
              after.map { !Self.goesOn($0, after: line) || Self.clock($0) != Self.clock(line) }
              ?? true
            Group {
              if line.unsent {
                Text(unsentLine(Self.supportName, mine: !line.fromSupport))
                  .font(.caption)
                  .foregroundStyle(colors.textTertiary)
                  .frame(maxWidth: .infinity)
                  .padding(.vertical, 4)
              } else {
                row(line, first: first, showsTime: showsTime)
              }
            }
            .id(line.id)
            // Parted where a run starts, under the day too, as the group
            // chats' lines are.
            .padding(.top, first ? CGFloat(Chat.runGap - Chat.lineGap) : 0)
          }
          ForEach(waiting) { line in
            waitingRow(line)
            if line.failed {
              Button("送れませんでした。もう一度送る") { send(line) }
                .font(.caption)
                .foregroundStyle(colors.dangerDefault)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.horizontal, 16)
            }
          }
          Color.clear.frame(height: 1).id("end")
        }
        .padding(.vertical, 8)
      }
      .defaultScrollAnchor(.bottom)
      // Short, it starts at the top under its intro, as /design's.
      .defaultScrollAnchor(.top, for: .alignment)
      .onChange(of: lines.count + waiting.count) { _, _ in
        withAnimation { reader.scrollTo("end", anchor: .bottom) }
      }
      // A quote tapped goes to the line it is of.
      .onChange(of: going) { _, id in
        guard let id else { return }
        withAnimation { reader.scrollTo(id, anchor: .center) }
        going = nil
      }
    }
    .background(colors.backgroundBase)
    // The group chats' composer, without what only a group has: days to
    // share, names to mention, and who is writing.
    .safeAreaInset(edge: .bottom, spacing: 0) {
      ChatComposer(
        draft: draft, groupID: ChatPhotos.support, quoteOf: quote(of:), onSubmit: sendAll,
        say: say)
    }
    .navigationTitle(Self.supportName)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.hidden, for: .tabBar)
    .task { await load() }
    .refreshable { await load() }
    // An answer, a reaction or a line taken back by Pochical's people
    // shows as made, as a group chat's do.
    .onReceive(NotificationCenter.default.publisher(for: SupportLine.answered)) { _ in
      Task { await load() }
    }
    .onAppear { Notifications.shared.supportOpen = true }
    .onDisappear { Notifications.shared.supportOpen = false }
    .sheet(item: $reactingTo) { line in
      EmojiKeyboardSheet(title: "リアクション") { react($0, on: line) }
    }
    .fullScreenCover(item: $viewing) { photo in
      PhotoViewer(photo: photo, groupID: ChatPhotos.support) {
        await savePhoto(photo, in: ChatPhotos.support, calls: groupCalls)
      }
    }
    .sensoryFeedback(.success, trigger: done)
    .overlay(alignment: .top) {
      if let notice {
        NoticeCapsule(words: notice)
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
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

  /// A line kept, Pochical's people's under the app's icon at the start of
  /// a run, as a member's face starts theirs; held, its reactions and
  /// menu; its emoji under it.
  private func row(_ line: SupportLine, first: Bool, showsTime: Bool) -> some View {
    let mine = !line.fromSupport
    // Beside the bubble toward the middle, as the group chats' time; left
    // to the next line, its room is kept, so the bubble is as wide either
    // way.
    let time = Text(Self.clock(line))
      .opacity(showsTime ? 1 : 0)
      .accessibilityHidden(!showsTime)
      .font(.caption2)
      .foregroundStyle(colors.textQuaternary)
      .padding(.bottom, 2)
      .fixedSize()
    return HStack(alignment: .top, spacing: 8) {
      if mine {
        Spacer(minLength: 48)
      } else if first {
        AppIconChoice.current.image(size: 28)
      } else {
        Color.clear.frame(width: 28, height: 1)
      }
      VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
        HStack(alignment: .bottom, spacing: 8) {
          if mine { time }
          bubble(line, first: first)
            // A photo opens large at a tap.
            .heldForActions(lifted: acting == line.id) {
              if let photo = line.photo { viewing = photo }
            } onActions: { spot, finger, link in
              // A link held has its own menu, without the reactions.
              if let link {
                openActions(
                  MessageActionsRequest(
                    lineID: line.id, spot: spot, mine: mine,
                    bubble: AnyView(bubble(line, first: first)), finger: finger,
                    actions: linkActions(link, open: { openURL(link) }, copied: { sayDone("コピーしました") })))
              } else {
                openActions(
                  MessageActionsRequest(
                    lineID: line.id, spot: spot, mine: mine,
                    bubble: AnyView(bubble(line, first: first)), finger: finger,
                    reactions: line.reactions, meID: SupportLine.me,
                    onReact: { react($0, on: line) }, onMoreReactions: { reactingTo = line },
                    actions: actions(for: line)))
              }
            }
          if !mine { time }
        }
        if !line.reactions.isEmpty {
          ReactionRow(
            reactions: line.reactions, meID: SupportLine.me, nameOf: Self.nameOf, counted: true,
            onReact: { react($0, on: line) })
        }
      }
      // Room for the tail of a run's first bubble, as the group chats'.
      .padding(mine ? .trailing : .leading, BubbleShape.tailReach)
      if !mine {
        Spacer(minLength: 48)
      }
    }
    .padding(.horizontal, 16)
  }

  /// Its words in a bubble, or its photo, under the line it answers.
  private func bubble(_ line: SupportLine, first: Bool) -> some View {
    LineContent(
      text: line.text, preview: line.preview, days: [], members: [], photo: line.photo,
      quote: line.replyTo.map(quote(of:)), groupID: ChatPhotos.support,
      mine: !line.fromSupport, first: first, waiting: false, nameOf: { _ in "" },
      onOpenQuote: { going = line.replyTo }, unfolded: unfolded.contains(line.id),
      onUnfold: { withAnimation { _ = unfolded.insert(line.id) } }
    )
  }

  /// A line on its way, faint; held, only コピー yet for words.
  private func waitingRow(_ line: Waiting) -> some View {
    let content = LineContent(
      text: line.text, preview: line.preview, days: [], members: [], photo: line.photo,
      quote: line.replyTo.map(quote(of:)), groupID: ChatPhotos.support, mine: true,
      first: false, waiting: !line.failed, nameOf: { _ in "" })
    // A clock in the time's room, as the group chats', so the bubble stays
    // as wide once sent.
    let time = Text(ChatTime.clock(Int64(Date.now.timeIntervalSince1970 * 1000)))
      .hidden()
      .overlay(alignment: .trailing) {
        if !line.failed {
          Image(systemName: "clock")
            .accessibilityLabel("送信中")
        }
      }
      .font(.caption2)
      .foregroundStyle(colors.textQuaternary)
      .padding(.bottom, 2)
      .fixedSize()
    return HStack(alignment: .top, spacing: 8) {
      Spacer(minLength: 48)
      HStack(alignment: .bottom, spacing: 8) {
        time
        content.heldForActions(lifted: acting == line.id) { spot, finger, _ in
          guard line.photo == nil else { return }
          openActions(
            MessageActionsRequest(
              lineID: line.id, spot: spot, mine: true, bubble: AnyView(content), finger: finger,
              actions: [copy(line.text)]))
        }
      }
      .padding(.trailing, BubbleShape.tailReach)
    }
    .padding(.horizontal, 16)
  }

  /// A line's menu (/design's): 返信, then コピー for words or 保存 for a
  /// photo, and for one's own, 送信取消 apart in the danger color.
  private func actions(for line: SupportLine) -> [MessageAction] {
    var actions = [
      MessageAction(title: "返信", systemImage: "arrowshape.turn.up.left") {
        withAnimation { draft.replyTo = line.id }
        draft.field.focus()
      }
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

  /// Who put an emoji on, as its pill names them.
  private static func nameOf(_ id: String) -> String {
    id == SupportLine.support ? supportName : "自分"
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

  /// Opens a line's reactions and menu over everything (ChatScreen's).
  private func openActions(_ request: MessageActionsRequest) {
    acting = request.lineID
    OverlayWindow.shared.show(
      MessageActionsOverlay(request: request) {
        acting = nil
        OverlayWindow.shared.hide(after: .milliseconds(50))
      }
      .environment(\.themeColors, colors)
      .environment(settings)
      .environment(\.look, look))
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
    guard let chat = try? await groupCalls.supportChat() else { return }
    lines = chat.lines
    if chat.unread > 0 {
      try? await groupCalls.markSupportRead()
    }
  }

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
  /// uploaded first. One that could not go stays to be tried again with
  /// the same id, so it is kept once.
  private func send(_ line: Waiting) {
    if let index = waiting.firstIndex(where: { $0.id == line.id }) {
      waiting[index].failed = false
    } else {
      waiting.append(line)
    }
    let before = sending
    sending = Task {
      await before?.value
      do {
        if let photo = line.photo {
          try await groupCalls.uploadSupportPhoto(photo.id)
        }
        let kept = try await groupCalls.sendSupport(
          line.text, id: line.id, device: Self.device, replyTo: line.replyTo, photo: line.photo,
          preview: line.preview, withoutPreview: line.withoutPreview)
        waiting.removeAll { $0.id == line.id }
        lines.append(kept)
      } catch {
        ReviewPrompt.troubled = true
        if let index = waiting.firstIndex(where: { $0.id == line.id }) {
          waiting[index].failed = true
        }
      }
    }
  }

  /// The day a line was sent, for the day over its first line.
  private static func day(of line: SupportLine) -> Day {
    Day(line.sentAt, in: .current)
  }

  private static func clock(_ line: SupportLine) -> String {
    ChatTime.clock(Int64(line.sentAt.timeIntervalSince1970 * 1000))
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
