import PhotosUI
import PochicalDesign
import PochicalKit
import PochicalProto
import SwiftUI

/// What is being written in a chat's composer, and what goes with it. Its
/// own object rather than the chat screen's state, so that a letter typed
/// makes only the composer again, not every line of the chat.
@Observable
final class ChatDraft {
  var text = ""
  /// The line being answered (返信), by its seq, quoted over the composer
  /// as the chat has it now; or the line of one's own being changed in it.
  var target: DraftTarget<ChatLineRow>?
  var editing: ChatLineRow? { target?.editing }
  var replyTo: Int64? { target?.replyTo }
  /// Days to go with the next message (共有する日), sent first.
  var attachedDays: [Day]?
  /// Members picked from the list of names while writing, to be sent as
  /// mentions while their @name stays.
  var picked: [PickedMember] = []
  /// Photos picked for the next send, waiting above the composer.
  var photos: [PickedPhoto] = []
  /// How many photos picked or pasted are still being read and shrunk,
  /// each taking its room in the tray until it is in.
  var comingPhotos = 0
  /// Picked photos are being read and shrunk: nothing is sent meanwhile.
  var readingPhotos: Bool { comingPhotos > 0 }
  /// How many more photos the tray has room for, up to Chat.photosPerSend.
  var photoRoom: Int { Chat.photosPerSend - photos.count - comingPhotos }
  /// The page of the words' first link, while writing.
  var preview: ComposerPreview?
  /// A link whose page was taken off with ×, until sent or changed.
  var previewRemoved: String?
  /// A word is being converted in the composer.
  var composing = false
  @ObservationIgnored let field = ComposerBox()
  /// When the member's own typing was last sent.
  @ObservationIgnored var typingSentAt = Date.distantPast

  /// What is written as a draft keeps it, its mentions as <@id>.
  var kept: KeptDraft {
    KeptDraft(text: withMentions(text, picked: picked), target: target?.map(\.seq))
  }

  /// The page to send with `text`: its first link's, read and not taken
  /// off; none while it is still being asked for.
  func attachedPreview(for text: String) -> LinePreview? {
    guard let link = previewLink(text), let state = preview, state.url == link,
      link != previewRemoved
    else { return nil }
    return state.preview
  }

  /// Says the member is writing: at most every typingSendMs while the field
  /// holds words.
  func typed(in threadID: String, socket: SyncClient) {
    let now = Date.now
    guard now.timeIntervalSince(typingSentAt) * 1000 >= Double(Chat.typingSendMs) else { return }
    typingSentAt = now
    Task { await socket.sendTyping(in: threadID, on: true) }
  }

  /// Says the member stopped writing, once they said they were.
  func stopTyping(in threadID: String, socket: SyncClient) {
    guard typingSentAt != .distantPast else { return }
    typingSentAt = .distantPast
    Task { await socket.sendTyping(in: threadID, on: false) }
  }
}

/// A chat's composer (/design's), a group's and the support chat's, as
/// Messages draws one: a round of glass with ＋ for what may be sent
/// besides words (the photo tool alone in the support chat), and a glass
/// capsule holding what the message answers or changes and what goes with
/// it (a link's page, photos) over the field, the send button at its end;
/// in a group's chat the names to mention over it as an @ is written.
struct ChatComposer: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.groupSockets) private var groupSockets
  @Bindable var draft: ChatDraft
  /// Where the chat's photos are kept: the group's, or the support chat's.
  let groupID: String
  /// The chat others are told the member is writing in; none for the
  /// support chat, which has no one watching.
  var threadID: String?
  /// Who may be mentioned: those in the group's chat now but the writer;
  /// none in a one-to-one chat or the support chat.
  var mentionable: [GroupMemberRow] = []
  var nameOf: (String) -> String = { _ in "" }
  /// The line being answered as its quote shows it, read each time from
  /// the chat as it is: taken back or its writer blocked, it says so.
  let quoteOf: (Int64) -> LineQuote
  let onSubmit: () -> Void
  var onStopEditing: () -> Void = {}
  /// Keeps the draft as it is now (spec/chat.md, Drafts).
  let keepDraft: () -> Void
  /// 日にちを共有, in a group's chat.
  var onShareDays: (() -> Void)?
  let say: (String) -> Void
  /// The photo picker is open.
  @State private var choosingPhotos = false
  /// What the photo picker just handed over, read into the tray.
  @State private var photoItems: [PhotosPickerItem] = []
  /// The row's height: the ＋'s round, the capsule at least as tall.
  /// Growing with the reader's text size, as the field does, but only so
  /// far (chatRules.controlsMostScale): at the accessibility sizes the
  /// field needs the row's width more, as Messages keeps its buttons.
  @ScaledMetric(relativeTo: .body) private var scaledButton: CGFloat = 38
  /// The ＋'s and send's symbols, growing as the buttons do.
  @ScaledMetric(relativeTo: .body) private var scaledIcon: CGFloat = 20
  @ScaledMetric(relativeTo: .body) private var scaledSendIcon: CGFloat = 14
  private var buttonSize: CGFloat { min(scaledButton, 38 * Self.mostScale) }
  private var iconSize: CGFloat { min(scaledIcon, 20 * Self.mostScale) }
  private var sendIconSize: CGFloat { min(scaledSendIcon, 14 * Self.mostScale) }
  /// Send's round, inside the capsule's end.
  private var sendSize: CGFloat { buttonSize - 2 * Self.sendInset }
  private static let sendInset: CGFloat = 4
  private static let mostScale = CGFloat(Chat.controlsMostScale)

  var body: some View {
    let editing = draft.editing
    let mentioning = mentioned
    VStack(spacing: 8) {
      mentionList(mentioning)
      GlassEffectContainer(spacing: 8) {
        HStack(alignment: .bottom, spacing: 8) {
          // A message being changed keeps what it carries: only its words
          // change.
          if editing == nil {
            tools
          }
          capsule
        }
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    // Whatever changes its shape, from wherever (a tap on ×, 返信 from a
    // line's menu, a link's page coming, the words wrapping), it changes by
    // one animation, the one the chat's room makes room for it by
    // (ChatStage).
    .animation(Chat.composerMotion, value: shape(mentioning: mentioning.count))
    .photosPicker(
      isPresented: $choosingPhotos, selection: $photoItems,
      maxSelectionCount: max(draft.photoRoom, 1), matching: .images,
      preferredItemEncoding: .compatible
    )
    .onChange(of: photoItems) { _, items in
      guard !items.isEmpty else { return }
      photoItems = []
      read(items.map(PhotoSource.picked))
    }
    // The member's own typing: at most every typingSendMs while the field
    // holds words, and a stop once it empties.
    .onChange(of: draft.text) { _, words in
      guard let threadID else { return }
      if words.isEmpty {
        draft.stopTyping(in: threadID, socket: groupSockets.client(groupID))
      } else {
        draft.typed(in: threadID, socket: groupSockets.client(groupID))
      }
    }
    .task(id: previewLink(draft.text)) { await readPreview(of: previewLink(draft.text)) }
    // The draft is kept as it changes, once the writing pauses
    // (chatRules.draftSettleMs); an emptied
    // composer at once, so words sent are never a draft again.
    .task(id: draft.kept) {
      if !draft.text.isEmpty {
        do { try await Task.sleep(for: .milliseconds(Chat.draftSettleMs)) } catch { return }
      }
      keepDraft()
    }
  }

  /// The capsule: what the message is, then what goes with it, the photos
  /// last nearest the field, as /design's; the field and send under them.
  private var capsule: some View {
    let trimmed = draft.text.trimmingCharacters(in: .whitespacesAndNewlines)
    let editing = draft.editing
    let unchanged = editing.map { $0.text == withMentions(draft.text, picked: draft.picked) } ?? false
    let blocked =
      editing == nil
      ? (trimmed.isEmpty && draft.photos.isEmpty && draft.attachedDays == nil) || draft.readingPhotos
      : trimmed.isEmpty || unchanged
    let shape = RoundedRectangle(cornerRadius: buttonSize / 2, style: .continuous)
    return VStack(spacing: 0) {
      if let editing {
        ComposerBar(
          title: "メッセージを編集", words: plainText(editing.text, nameOf: nameOf),
          stop: "編集をやめる", onStop: onStopEditing)
      }
      if let replyTo = draft.replyTo {
        ReplyBar(quote: quoteOf(replyTo), groupID: groupID) {
          draft.target = nil
        }
      }
      if editing == nil, let attachedDays = draft.attachedDays {
        ComposerBar(
          title: "共有する日", words: daysSummary(attachedDays), stop: "共有をやめる"
        ) {
          draft.attachedDays = nil
        }
      }
      if let preview = draft.preview, !preview.none, preview.url != draft.previewRemoved {
        ComposerPreviewBar(state: preview) {
          draft.previewRemoved = preview.url
        }
      }
      if editing == nil, !draft.photos.isEmpty {
        PhotoTray(photos: $draft.photos)
      }
      HStack(alignment: .bottom, spacing: 4) {
        ComposerField(
          placeholder: "メッセージ", text: $draft.text, limit: TextLimits.chatMessage,
          composing: $draft.composing, box: draft.field,
          // A message being changed keeps what it carries, as the tools go.
          onPasteImages: editing == nil ? { pastePhotos($0) } : nil)
        .overlay(alignment: .leading) {
          if draft.text.isEmpty {
            Text("メッセージ")
              .foregroundStyle(colors.textQuaternary)
              .allowsHitTesting(false)
              .accessibilityHidden(true)
          }
        }
        .padding(.leading, 16)
        .padding(.vertical, 8)
        .frame(minHeight: buttonSize)
        Button(action: onSubmit) {
          Image(systemName: editing == nil ? "arrow.up" : "checkmark")
            .font(.system(size: sendIconSize, weight: .bold))
            .foregroundStyle(colors.accentOnFill)
            .frame(width: sendSize, height: sendSize)
            .background(blocked ? colors.fillPrimary : colors.accentFill, in: Circle())
            .padding(Self.sendInset)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(blocked)
        .accessibilityLabel(editing == nil ? "送る" : "編集を保存")
        .animation(.easeOut(duration: 0.15), value: trimmed.isEmpty)
      }
      if TextLimits.chatMessage - draft.text.count <= TextFields.countWhenLeft {
        Text("\(draft.text.count)/\(TextLimits.chatMessage)")
          .font(.footnote.monospacedDigit())
          .foregroundStyle(
            draft.composing && draft.text.count > TextLimits.chatMessage
              ? colors.dangerDefault : colors.textTertiary
          )
          .frame(maxWidth: .infinity, alignment: .trailing)
          .padding(.horizontal, 16)
          .padding(.bottom, 6)
          .accessibilityLabel("\(TextLimits.chatMessage)文字中\(draft.text.count)文字")
      }
    }
    // What comes in over the field (photos, a reply, a link's page) drawn
    // only inside the capsule as it grows, not over the chat ahead of it.
    .clipShape(shape)
    .glassEffect(.regular, in: shape)
  }

  /// ＋, opening what may be sent besides words, as Messages' does: 日にち
  /// を共有 nearest it, then 写真. With the photo tool alone, as the support
  /// chat has, the round is the photo tool itself.
  @ViewBuilder private var tools: some View {
    if let onShareDays {
      Menu {
        Button("日にちを共有", systemImage: "calendar.badge.plus", action: onShareDays)
        Button("写真", systemImage: "photo", action: choosePhotos)
      } label: {
        toolIcon("plus")
      }
      .accessibilityLabel("写真や日にちを送る")
      .glassEffect(.regular.interactive(), in: .circle)
    } else {
      // Quiet once the tray is full, as the picker would not open.
      Button(action: choosePhotos) {
        toolIcon("photo", quiet: draft.photoRoom <= 0)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("写真を送る")
      .glassEffect(.regular.interactive(), in: .circle)
    }
  }

  private func toolIcon(_ systemImage: String, quiet: Bool = false) -> some View {
    Image(systemName: systemImage)
      .font(.system(size: iconSize, weight: .medium))
      .foregroundStyle(quiet ? colors.textQuaternary : colors.textPrimary)
      .frame(width: buttonSize, height: buttonSize)
      .contentShape(.circle)
  }

  /// 写真を送る: the photo picker, up to Chat.photosPerSend in the tray at
  /// once; past it the picker does not open.
  private func choosePhotos() {
    if draft.photoRoom > 0 {
      choosingPhotos = true
    } else {
      say(Self.photosFull)
    }
  }

  /// The others to mention while an @ is being written at the end of the
  /// message: those in it now whose name has what follows the @.
  private var mentioned: [GroupMemberRow] {
    mentionQuery(draft.text).map { query in
      mentionable.filter { query.isEmpty || $0.displayName.contains(query) }
    } ?? []
  }

  /// What the composer's height is made of now.
  private func shape(mentioning: Int) -> ComposerShape {
    let editing = draft.editing != nil
    let preview = draft.preview.flatMap { $0.none || $0.url == draft.previewRemoved ? nil : $0 }
    return ComposerShape(
      editing: editing,
      replying: draft.replyTo != nil,
      sharing: !editing && draft.attachedDays != nil,
      preview: preview,
      photos: editing ? 0 : draft.photos.count,
      mentioning: mentioning,
      fieldHeight: draft.field.height(for: draft.text),
      counted: TextLimits.chatMessage - draft.text.count <= TextFields.countWhenLeft)
  }

  /// The others to mention, over the composer.
  @ViewBuilder private func mentionList(_ others: [GroupMemberRow]) -> some View {
    if !others.isEmpty {
      ScrollView {
        VStack(spacing: 0) {
          ForEach(others, id: \.userID) { member in
            Button {
              // The ＠ a Japanese keyboard is still converting is
              // confirmed first, so the field takes the name.
              draft.text = pickingMention(draft.field.commit(), name: member.displayName)
              draft.picked.removeAll { $0.id == member.userID }
              draft.picked.append(PickedMember(id: member.userID, name: member.displayName))
            } label: {
              HStack(spacing: 12) {
                MemberAvatar(
                  name: member.displayName, photoID: member.photoID, groupID: groupID, size: 28)
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
      .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
      .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Radius.xl))
      .accessibilityLabel("メンションする人")
    }
  }

  /// What the photo button and a paste say past the tray's room.
  private static let photosFull = "写真は一度に\(Chat.photosPerSend)枚まで送れます"

  /// Images pasted into the field go in the tray as picked photos do, as
  /// many as it has room for, saying so past it as the picker's button does.
  private func pastePhotos(_ images: [NSItemProvider]) {
    let room = draft.photoRoom
    if images.count > room {
      say(Self.photosFull)
    }
    guard room > 0 else { return }
    read(images.prefix(room).map(PhotoSource.pasted))
  }

  /// Reads photos, picked or pasted, into the tray. Counted at once: until
  /// the last is in, nothing is sent and the tray has no room for them.
  private func read(_ sources: [PhotoSource]) {
    draft.comingPhotos += sources.count
    Task { await readPhotos(sources) }
  }

  /// Reads photos counted coming, and shrinks them to send, into the tray.
  private func readPhotos(_ sources: [PhotoSource]) async {
    var unreadable = false
    for source in sources {
      defer { draft.comingPhotos -= 1 }
      guard let data = await source.data(),
        let shrunk = await Task.detached(operation: { ChatPhotos.shrink(data) }).value
      else {
        unreadable = true
        continue
      }
      // Decoded and shrunk off the main thread, as the photo is: at 2048
      // pixels, on it, each would hold the screen still a moment.
      let thumbnail = await UIImage(data: shrunk.jpeg)?.byPreparingThumbnail(
        ofSize: CGSize(width: 128, height: 128))
      if draft.photos.count < Chat.photosPerSend {
        draft.photos.append(PickedPhoto(shrunk: shrunk, thumbnail: thumbnail))
      }
    }
    if unreadable {
      say("開けない写真がありました")
    }
  }

  /// Asks for the page of the words' first link once it has stayed the
  /// same a moment, as chatRules.linkPreviewSettleMs.
  private func readPreview(of link: String?) async {
    guard let link else {
      draft.preview = nil
      return
    }
    if draft.preview?.url == link { return }
    try? await Task.sleep(for: .milliseconds(Chat.linkPreviewSettleMs))
    guard !Task.isCancelled else { return }
    draft.preview = ComposerPreview(url: link)
    let preview = try? await groupCalls.linkPreview(link)
    guard !Task.isCancelled, draft.preview?.url == link else { return }
    draft.preview = ComposerPreview(url: link, preview: preview, none: preview == nil)
  }
}

/// What a chat's composer's height is made of: what it carries over the
/// field, the names to mention over it, and the field's height. As it
/// changes, the composer changes shape by one animation.
private struct ComposerShape: Equatable {
  let editing: Bool
  let replying: Bool
  let sharing: Bool
  let preview: ComposerPreview?
  let photos: Int
  let mentioning: Int
  let fieldHeight: CGFloat
  let counted: Bool
}

extension Chat {
  /// How a chat's composer changes shape, and the lines and ↓ make room
  /// for it: one spring, SwiftUI's within the composer (composerMotion)
  /// and UIKit's for its frame and the lines (ChatStage), so they move as
  /// one. UIKit's own spring rather than SwiftUI's animation handed to
  /// UIKit: that one sets the frame itself each frame, over the keyboard
  /// moving the same frame meanwhile (返信 brings the quote and the
  /// keyboard together), and the composer stayed behind the keyboard until
  /// it ended; UIKit's springs add up with the keyboard's.
  static let composerSpring = (duration: 0.5, bounce: 0.0)
  static let composerMotion = Animation.spring(
    duration: composerSpring.duration, bounce: composerSpring.bounce)
}

/// Where a photo for the tray comes from: the photo picker, or pasted.
private enum PhotoSource {
  case picked(PhotosPickerItem)
  case pasted(NSItemProvider)

  /// The photo's data as it was picked or copied (PNG, JPEG, HEIC…), for
  /// ChatPhotos.shrink to read.
  func data() async -> Data? {
    switch self {
    case .picked(let item):
      return try? await item.loadTransferable(type: Data.self)
    case .pasted(let image):
      guard let type = image.registeredContentTypes.first(where: { $0.conforms(to: .image) })
      else { return nil }
      return await withCheckedContinuation { done in
        _ = image.loadDataRepresentation(for: type) { data, _ in done.resume(returning: data) }
      }
    }
  }
}
