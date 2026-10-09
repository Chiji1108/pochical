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
  @Environment(\.groupCalls) private var groupCalls
  @Environment(Settings.self) private var settings
  @Environment(\.look) private var look
  @State private var lines: [SupportLine] = []
  /// Lines being sent, shown faint until the server keeps them; one that
  /// could not go waits to be tried again.
  @State private var waiting: [Waiting] = []
  @State private var draft = ""
  @State private var composing = false
  /// The line being answered (返信), quoted over the composer.
  @State private var replying: SupportLine?
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
  /// Photos picked to send, waiting over the composer.
  @State private var pickedPhotos: [PickedPhoto] = []
  /// What the photo picker just handed over, read into `pickedPhotos`.
  @State private var photoItems: [PhotosPickerItem] = []
  @State private var readingPhotos = false
  /// The photo open large.
  @State private var viewing: LinePhoto?
  /// Said over the lines for a moment, as a toast.
  @State private var notice: String?
  @State private var notices = 0
  /// The sends so far, one after another, so the lines keep their order.
  @State private var sending: Task<Void, Never>?
  private let field = ComposerBox()

  struct Waiting: Identifiable, Hashable {
    let id: String
    var text = ""
    var photo: LinePhoto?
    var replyTo: String?
    var failed = false
  }

  /// Who answers here: Pochical's people, under the app's name.
  private static let supportName = "ポチカル"

  var body: some View {
    ScrollViewReader { reader in
      ScrollView {
        LazyVStack(spacing: 4) {
          intro
          ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
            let runs = { (other: SupportLine) in other.fromSupport == line.fromSupport && !other.unsent }
            let first = index == 0 || !runs(lines[index - 1]) || line.unsent
            let last = index == lines.count - 1 || !runs(lines[index + 1]) || line.unsent
            Group {
              if line.unsent {
                Text(unsentLine(Self.supportName, mine: !line.fromSupport))
                  .font(.caption)
                  .foregroundStyle(colors.textTertiary)
                  .frame(maxWidth: .infinity)
                  .padding(.vertical, 4)
              } else {
                row(line, first: first)
              }
            }
            .id(line.id)
            .padding(.top, first && index > 0 ? 8 : 0)
            if last && !line.unsent {
              Text(Self.timeText(line.sentAt))
                .font(.caption2)
                .foregroundStyle(colors.textTertiary)
                .frame(maxWidth: .infinity, alignment: line.fromSupport ? .leading : .trailing)
                .padding(.horizontal, line.fromSupport ? 52 : 16)
            }
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
    .safeAreaInset(edge: .bottom, spacing: 0) { composer }
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
      EmojiKeyboardSheet { react($0, on: line) }
    }
    .fullScreenCover(item: $viewing) { photo in
      PhotoViewer(photo: photo, groupID: ChatPhotos.support) { save(photo) }
    }
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
      Text("届くのは、ここに書いたことと写真、それにアプリと端末の情報だけです。\n\(Self.device)")
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
  private func row(_ line: SupportLine, first: Bool) -> some View {
    let mine = !line.fromSupport
    return HStack(alignment: .top, spacing: 8) {
      if mine {
        Spacer(minLength: 48)
      } else if first {
        AppIconChoice.current.image(size: 28)
      } else {
        Color.clear.frame(width: 28, height: 1)
      }
      VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
        bubble(line, first: first)
          .heldForActions(lifted: acting == line.id) { frame, finger in
            openActions(
              MessageActionsRequest(
                lineID: line.id, frame: frame, mine: mine,
                bubble: AnyView(bubble(line, first: first)), finger: finger,
                reactions: line.reactions, meID: SupportLine.me,
                onReact: { react($0, on: line) }, onMoreReactions: { reactingTo = line },
                actions: actions(for: line)))
          }
        if !line.reactions.isEmpty {
          ReactionRow(
            reactions: line.reactions, meID: SupportLine.me, nameOf: Self.nameOf, counted: true,
            onReact: { react($0, on: line) })
        }
      }
      if !mine {
        Spacer(minLength: 48)
      }
    }
    .padding(.horizontal, 16)
  }

  /// Its words in a bubble, or its photo, under the line it answers; a
  /// photo opens large at a tap.
  private func bubble(_ line: SupportLine, first: Bool) -> some View {
    LineContent(
      text: line.text, days: [], members: [], photo: line.photo,
      quote: line.replyTo.map(quote(of:)), groupID: ChatPhotos.support,
      mine: !line.fromSupport, first: first, waiting: false, nameOf: { _ in "" },
      onOpenQuote: { going = line.replyTo }, unfolded: unfolded.contains(line.id),
      onUnfold: { withAnimation { _ = unfolded.insert(line.id) } }
    )
    .onTapGesture { if let photo = line.photo { viewing = photo } }
  }

  /// A line on its way, faint; held, only コピー yet for words.
  private func waitingRow(_ line: Waiting) -> some View {
    let content = LineContent(
      text: line.text, days: [], members: [], photo: line.photo,
      quote: line.replyTo.map(quote(of:)), groupID: ChatPhotos.support, mine: true,
      first: false, waiting: !line.failed, nameOf: { _ in "" })
    return HStack(alignment: .top, spacing: 8) {
      Spacer(minLength: 48)
      content.heldForActions(lifted: acting == line.id) { frame, finger in
        guard line.photo == nil else { return }
        openActions(
          MessageActionsRequest(
            lineID: line.id, frame: frame, mine: true, bubble: AnyView(content), finger: finger,
            actions: [copy(line.text)]))
      }
    }
    .padding(.horizontal, 16)
  }

  /// A line's menu (/design's): 返信, then コピー for words or 保存 for a
  /// photo, and for one's own, 送信取消 apart in the danger color.
  private func actions(for line: SupportLine) -> [MessageAction] {
    var actions = [
      MessageAction(title: "返信", systemImage: "arrowshape.turn.up.left") {
        withAnimation { replying = line }
        field.focus()
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
      say(saved ? "写真を保存しました" : "保存できませんでした")
    }
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
    OverlayWindow.shared.show(
      MessageActionsOverlay(request: request) { action in
        acting = nil
        OverlayWindow.shared.hide(after: .milliseconds(50))
        action?()
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
    if replying?.id == line.id { replying = nil }
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

  private var composer: some View {
    let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    return VStack(spacing: 0) {
      if let replying {
        ReplyBar(quote: quote(of: replying.id), groupID: ChatPhotos.support) {
          withAnimation { self.replying = nil }
        }
      }
      if !pickedPhotos.isEmpty {
        PhotoTray(photos: $pickedPhotos)
      }
      HStack(alignment: .bottom, spacing: 8) {
        photoButton
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
          sendAll()
        } label: {
          Image(systemName: "arrow.up")
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(colors.accentOnFill)
            .frame(width: 38, height: 38)
            .background(colors.accentFill, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("送る")
        .opacity((trimmed.isEmpty && pickedPhotos.isEmpty && !composing) || readingPhotos ? 0.5 : 1)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
    }
    .background(colors.backgroundBase)
  }

  private func load() async {
    guard let chat = try? await groupCalls.supportChat() else { return }
    lines = chat.lines
    if chat.unread > 0 {
      try? await groupCalls.markSupportRead()
    }
  }

  /// The photo tool: the system's picker, chatRules.photosPerSend photos
  /// at most (ChatScreen's).
  @ViewBuilder private var photoButton: some View {
    let room = Chat.photosPerSend - pickedPhotos.count
    // Read here: the picker's label is drawn off the main actor.
    let iconColor = colors.textSecondary
    if room > 0 {
      PhotosPicker(
        selection: $photoItems, maxSelectionCount: room, matching: .images,
        preferredItemEncoding: .compatible
      ) {
        Image(systemName: "photo")
          .font(.system(size: 20))
          .foregroundStyle(iconColor)
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

  /// Sends the tray's photos, each its own line, then the words; the reply
  /// goes with the first.
  private func sendAll() {
    guard !readingPhotos else { return }
    let text = String(field.commit().prefix(TextLimits.chatMessage))
      .trimmingCharacters(in: .whitespacesAndNewlines)
    var replyTo = replying?.id
    var lines: [Waiting] = []
    for picked in pickedPhotos {
      guard (try? ChatPhotos.keep(picked.shrunk.jpeg, as: picked.id, in: ChatPhotos.support)) != nil
      else { continue }
      let photo = LinePhoto(id: picked.id, width: picked.shrunk.width, height: picked.shrunk.height)
      lines.append(Waiting(id: UUID().uuidString.lowercased(), photo: photo, replyTo: replyTo))
      replyTo = nil
    }
    if !text.isEmpty {
      lines.append(Waiting(id: UUID().uuidString.lowercased(), text: text, replyTo: replyTo))
    }
    guard !lines.isEmpty else { return }
    draft = ""
    replying = nil
    withAnimation { pickedPhotos = [] }
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
          line.text, id: line.id, device: Self.device, replyTo: line.replyTo, photo: line.photo)
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

  /// When a line was sent, as the app writes days: 10月8日 12:35.
  private static func timeText(_ date: Date) -> String {
    let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
    let day = Day(date, in: .current)
    return "\(day.monthDayText) \(parts.hour ?? 0):\(String(format: "%02d", parts.minute ?? 0))"
  }

  /// The app's version and the device, as they reach Pochical's people.
  private static var device: String {
    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    let system = UIDevice.current
    return "ポチカル \(version)・\(system.model) (\(system.systemName) \(system.systemVersion))"
  }
}
