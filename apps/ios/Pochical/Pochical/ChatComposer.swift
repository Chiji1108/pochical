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
  /// The line of one's own being changed in the composer.
  var editing: ChatLineRow?
  /// The line being answered (返信), by its id in its chat, quoted over
  /// the composer as the chat has it now.
  var replyTo: String?
  /// Days to go with the next message (共有する日), sent first.
  var attachedDays: [Day]?
  /// Members picked from the list of names while writing, to be sent as
  /// mentions while their @name stays.
  var picked: [PickedMember] = []
  /// Photos picked for the next send, waiting above the composer.
  var photos: [PickedPhoto] = []
  /// Picked photos are being read and shrunk.
  var readingPhotos = false
  /// The page of the words' first link, while writing.
  var preview: ComposerPreview?
  /// A link whose page was taken off with ×, until sent or changed.
  var previewRemoved: String?
  /// The composer's field is in use, its tools folded into a › (/design's
  /// composer, as LINE's).
  var writing = false
  /// The tools opened from the › until the next letter.
  var toolsOpen = false
  /// A word is being converted in the composer.
  var composing = false
  @ObservationIgnored let field = ComposerBox()
  /// When the member's own typing was last sent.
  @ObservationIgnored var typingSentAt = Date.distantPast

  /// The composer's tools folded into a ›: from the field being tapped, and
  /// while words wait in it, until › opens them.
  var toolsFolded: Bool { (writing || !text.isEmpty) && !toolsOpen }

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
  func typed(in threadID: String, socket: SyncClient?) {
    let now = Date.now
    guard now.timeIntervalSince(typingSentAt) * 1000 >= Double(Chat.typingSendMs) else { return }
    typingSentAt = now
    Task { await socket?.sendTyping(in: threadID, on: true) }
  }

  /// Says the member stopped writing, once they said they were.
  func stopTyping(in threadID: String, socket: SyncClient?) {
    guard typingSentAt != .distantPast else { return }
    typingSentAt = .distantPast
    Task { await socket?.sendTyping(in: threadID, on: false) }
  }
}

/// A chat's composer (/design's), a group's and the support chat's: what
/// the message answers or changes and what goes with it (a link's page,
/// photos) over the field,
/// the tools folded into a › while writing, the send button, and in a
/// group's chat the names to mention as an @ is written.
struct ChatComposer: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.groupSocket) private var socket
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
  let quoteOf: (String) -> LineQuote
  let onSubmit: () -> Void
  var onStopEditing: () -> Void = {}
  /// 日にちを共有, in a group's chat.
  var onShareDays: (() -> Void)?
  let say: (String) -> Void
  /// What the photo picker just handed over, read into the tray.
  @State private var photoItems: [PhotosPickerItem] = []
  /// The row's height: each of its buttons, the field at least as tall;
  /// folded, the tools narrow to one.
  private static let buttonSize: CGFloat = 38

  var body: some View {
    let trimmed = draft.text.trimmingCharacters(in: .whitespacesAndNewlines)
    let editing = draft.editing
    let unchanged = editing.map { $0.text == withMentions(draft.text, picked: draft.picked) } ?? false
    // With the photo tool alone, as the support chat has, it stays in
    // sight: only a group's two tools fold into the › (spec/chat.md).
    let folded = onShareDays != nil && draft.toolsFolded
    let blocked =
      editing == nil
      ? (trimmed.isEmpty && draft.photos.isEmpty && draft.attachedDays == nil) || draft.readingPhotos
      : trimmed.isEmpty || unchanged
    VStack(spacing: 0) {
      mentionList
      // What the message is, then what goes with it, the photos last
      // nearest the field, as /design's.
      if let editing {
        ComposerBar(
          title: "メッセージを編集", words: plainText(editing.text, nameOf: nameOf),
          stop: "編集をやめる", onStop: onStopEditing)
      }
      if editing == nil, let replyTo = draft.replyTo {
        ReplyBar(quote: quoteOf(replyTo), groupID: groupID) {
          withAnimation { draft.replyTo = nil }
        }
      }
      if editing == nil, let attachedDays = draft.attachedDays {
        ComposerBar(
          title: "共有する日", words: daysSummary(attachedDays), stop: "共有をやめる"
        ) {
          withAnimation { draft.attachedDays = nil }
        }
      }
      if let preview = draft.preview, !preview.none, preview.url != draft.previewRemoved {
        ComposerPreviewBar(state: preview) {
          withAnimation { draft.previewRemoved = preview.url }
        }
      }
      if editing == nil, !draft.photos.isEmpty {
        PhotoTray(photos: $draft.photos)
      }
      HStack(alignment: .bottom, spacing: 8) {
        // Folded, the tools give the field their room. Both stay in place,
        // only faded and narrowed, so they ride up with the keyboard as the
        // field does: one put in as it rises would start where it ends.
        if editing == nil {
          ZStack(alignment: .leading) {
            HStack(spacing: 8) {
              photoButton
              if let onShareDays {
                Button("日にちを共有", systemImage: "calendar.badge.plus", action: onShareDays)
                  .labelStyle(.iconOnly)
                  .font(.system(size: 20))
                  .foregroundStyle(colors.textSecondary)
                  .frame(width: Self.buttonSize, height: Self.buttonSize)
              }
            }
            .opacity(folded ? 0 : 1)
            .offset(x: folded ? -Self.buttonSize : 0)
            .disabled(folded)
            .accessibilityHidden(folded)
            Button("写真と日にちのボタンを表示", systemImage: "chevron.right") { draft.toolsOpen = true }
              .labelStyle(.iconOnly)
              .font(.system(size: 20, weight: .medium))
              .foregroundStyle(colors.textSecondary)
              .frame(width: Self.buttonSize, height: Self.buttonSize)
              .opacity(folded ? 1 : 0)
              .scaleEffect(folded ? 1 : 0.6)
              .disabled(!folded)
              .accessibilityHidden(!folded)
          }
          .frame(width: folded ? Self.buttonSize : nil, alignment: .leading)
          .clipped()
        }
        ComposerField(
          placeholder: "メッセージ", text: $draft.text, limit: TextLimits.chatMessage,
          composing: $draft.composing, box: draft.field
        ) { inUse in
          draft.writing = inUse
          draft.toolsOpen = false
        }
        .overlay(alignment: .leading) {
          if draft.text.isEmpty {
            Text("メッセージ")
              .foregroundStyle(colors.textQuaternary)
              .allowsHitTesting(false)
              .accessibilityHidden(true)
          }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(minHeight: Self.buttonSize)
        .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.xl))
        Button(action: onSubmit) {
          Image(systemName: editing == nil ? "arrow.up" : "checkmark")
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(colors.accentOnFill)
            .frame(width: Self.buttonSize, height: Self.buttonSize)
            .background(blocked ? colors.fillPrimary : colors.accentFill, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(blocked)
        .accessibilityLabel(editing == nil ? "送る" : "編集を保存")
        .animation(.easeOut(duration: 0.15), value: trimmed.isEmpty)
      }
      .animation(.snappy(duration: 0.25), value: folded)
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      if TextLimits.chatMessage - draft.text.count <= TextFields.countWhenLeft {
        Text("\(draft.text.count)/\(TextLimits.chatMessage)")
          .font(.footnote.monospacedDigit())
          .foregroundStyle(
            draft.composing && draft.text.count > TextLimits.chatMessage
              ? colors.dangerDefault : colors.textTertiary
          )
          .frame(maxWidth: .infinity, alignment: .trailing)
          .padding(.horizontal, 20)
          .padding(.bottom, 4)
          .accessibilityLabel("\(TextLimits.chatMessage)文字中\(draft.text.count)文字")
      }
    }
    // What comes in over the field (photos, a reply, a link's page) drawn
    // only under the line as it rises, not over the chat ahead of it.
    .clipped()
    // The composer rises with the keyboard as one: whatever comes or
    // changes in it as the keyboard rises, a quote being answered or the
    // tools folding, would otherwise be drawn where the composer ends up.
    .geometryGroup()
    .background(colors.backgroundBase)
    .overlay(alignment: .top) {
      Rectangle().fill(colors.separator).frame(height: 1)
    }
    // The member's own typing: at most every typingSendMs while the field
    // holds words, and a stop once it empties.
    .onChange(of: draft.text) { _, words in
      draft.toolsOpen = false
      guard let threadID else { return }
      if words.isEmpty {
        draft.stopTyping(in: threadID, socket: socket)
      } else {
        draft.typed(in: threadID, socket: socket)
      }
    }
    .task(id: previewLink(draft.text)) { await readPreview(of: previewLink(draft.text)) }
  }

  /// 写真を送る: the photo picker, up to Chat.photosPerSend in the tray at
  /// once; past it the picker does not open.
  @ViewBuilder private var photoButton: some View {
    let room = Chat.photosPerSend - draft.photos.count
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
          .frame(width: Self.buttonSize, height: Self.buttonSize)
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
      .frame(width: Self.buttonSize, height: Self.buttonSize)
    }
  }

  /// The others to mention, over the composer, while an @ is being
  /// written at the end of the message: those in it now whose name has
  /// what follows the @.
  @ViewBuilder private var mentionList: some View {
    let others =
      mentionQuery(draft.text).map { query in
        mentionable.filter { query.isEmpty || $0.displayName.contains(query) }
      } ?? []
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
      .accessibilityLabel("メンションする人")
      .overlay(alignment: .top) {
        Rectangle().fill(colors.separator).frame(height: 1)
      }
    }
  }

  /// Reads picked photos and shrinks them to send, into the tray.
  private func readPhotos(_ items: [PhotosPickerItem]) async {
    draft.readingPhotos = true
    defer { draft.readingPhotos = false }
    var unreadable = false
    for item in items {
      guard let data = try? await item.loadTransferable(type: Data.self),
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
        withAnimation { draft.photos.append(PickedPhoto(shrunk: shrunk, thumbnail: thumbnail)) }
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
    withAnimation { draft.preview = ComposerPreview(url: link) }
    let preview = try? await groupCalls.linkPreview(link)
    guard !Task.isCancelled, draft.preview?.url == link else { return }
    withAnimation {
      draft.preview = ComposerPreview(url: link, preview: preview, none: preview == nil)
    }
  }
}
