import PochicalDesign
import PochicalKit
import SwiftUI

// A chat's lines as ChatScreen lays them out: the items in order, and
// each line's bubble, its words, links and mentions.

/// One thing in a chat's lines.
enum ChatItem: Identifiable, Hashable {
  case day(Day)
  case unread
  case line(ChatLineRow, startsRun: Bool)
  case waiting(WaitingLine, startsRun: Bool)

  var id: String {
    switch self {
    case .day(let day): ChatItemID.day(day)
    case .unread: ChatItemID.unread
    case .line(let line, _): ChatItemID.line(line.opID)
    // As the group's line will be, so it stays in place once taken.
    case .waiting(let line, _): ChatItemID.line(line.opID)
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

/// The ids of a chat's items, as its lines lay them out: a line's, by its
/// opID, is what the lines read and seen are counted by.
enum ChatItemID {
  /// The top item while earlier lines are to come, which asks for them.
  static let earlier = "earlier"
  /// The place's head, over its first line.
  static let head = "head"
  static let unread = "unread"
  private static let linePrefix = "line-"
  private static let typingPrefix = "typing-"

  static func day(_ day: Day) -> String { "day-\(day.key)" }

  static func line(_ opID: String) -> String { linePrefix + opID }

  static func isLine(_ id: String) -> Bool { id.hasPrefix(linePrefix) }

  /// Someone writing now, under the latest line.
  static func typing(_ userID: String) -> String { typingPrefix + userID }

  /// Who is writing, for someone writing's item; nil for any other.
  static func typer(of id: String) -> String? {
    id.hasPrefix(typingPrefix) ? String(id.dropFirst(typingPrefix.count)) : nil
  }
}

/// What a chat's lines show for a moment, beyond what they are: the line
/// ringed as it is gone to, and the line whose bubble is lifted over the
/// chat while its menu is open.
@MainActor @Observable final class LineMarks {
  var ringed: Int64?
  var lifted: String?
}

/// What is done on a line of words, which the chat acts on.
enum LineAction {
  /// 続きを読む.
  case unfold
  /// Its photo opened large.
  case openPhoto
  /// Gone to the line it answers.
  case openQuote
  /// The writer's profile, from their face.
  case openProfile
  /// A line not sent, もう一度送る from its !.
  case sendAgain
  /// A line not sent, 削除 from its !.
  case deleteUnsent
  /// Its photo stopped going up, with × on it: the line is not sent.
  case stopSending
  /// The reader's reaction put on, or taken back.
  case react(String)
  /// A poll's 行ける, on or off.
  case vote(Day, Bool)
  /// 日にちを決める.
  case decide
  /// Held: its reactions and menu, from where its bubble is, with the
  /// finger that opened them while it stays down, and the link held.
  case hold(spot: LineSpot, finger: HeldFinger?, link: URL?)
  /// An item of its menu by name, from VoiceOver, without the menu.
  case menu(String)
}

/// A line of words: others' on the left with their face and, at the start
/// of a run, their name; one's own on the right in the accent, dimmed
/// while it waits to be sent. The time beside the bubble, 編集済み over it.
struct LineView: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.openGroupRoute) private var openGroupRoute
  /// The line's opID, which its actions name it by.
  let lineID: String
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
  /// The line it answers, inside its bubble.
  var quote: LineQuote?
  /// Its words opened past chatRules.foldLines lines.
  var unfolded = false
  var groupID = ""
  /// The shift table on its first day, under its card.
  var shifts: GroupRoute?
  let time: Int64
  /// Left to the next line of the run sent in the same minute.
  var showsTime = true
  let edited: Bool
  let mine: Bool
  /// The writer's name at the start of a run of others' lines, for their
  /// face.
  let writer: String?
  /// Who wrote it, which VoiceOver says with every line, not only the
  /// run's first; none for one's own.
  var author: String?
  /// Its menu's items by name, which VoiceOver offers as the line's own
  /// actions too.
  var menu: [String] = []
  /// The writer's photo, one of the group's; empty for none.
  var writerPhoto = ""
  /// The writer's face is the app's icon, with no profile behind it: an
  /// answer of Pochical's people's.
  var appFace = false
  /// Their name shows over the run too, as in a group chat.
  let named: Bool
  /// It starts a run of one writer's lines, its bubble's tail by the writer.
  let first: Bool
  let waiting: Bool
  /// Its photo could not be sent: marked, its choices a tap away.
  var failed = false
  /// The group's names as it shows them now, for the line's mentions.
  let names: [String: String]
  var reactions: [LineReaction] = []
  /// A chat of two: its reactions counted, not shown by face.
  var countedReactions = false
  /// Pinned for everyone: a small pin by its time.
  var pinned = false
  /// What it shows for a moment: ringed when gone to from the pins, its
  /// bubble lifted over the chat while its menu is open, its place standing
  /// empty. Read by the line itself, which is drawn apart from the chat.
  var marks: LineMarks?
  /// Its place in the chat, by which it is ringed; none while on its way.
  var seq: Int64?
  var meID: String?
  /// What is done on the line, for the chat to act on as it is when used:
  /// the line, a chat's lines held all at once, is made again only as
  /// what it shows changes, not as the chat changes around it (a line
  /// coming, the keyboard moving).
  let actions: Handler<(lineID: String, action: LineAction)>
  @Environment(\.openURL) private var openURL
  /// What its words take to draw, kept while its row looks the same.
  @Environment(\.keptDrawing) private var kept
  /// Opens its reactions and menu for VoiceOver, from its bubble.
  @State private var opener = MenuOpener()

  private static var avatar: CGFloat { 32 }

  /// A member's name in the group as it is now, for their mentions.
  private func nameOf(_ id: String) -> String {
    memberName(id, in: names)
  }

  /// What its words take to draw: kept by the chat's lines for this line
  /// alone, for these words and names. A cell's views of the line it had
  /// before are drawn once more in the next line's environment as they go,
  /// which they leave alone; one of the same line drawn before its names
  /// changed makes its own.
  private var drawing: LineDrawing {
    guard let kept, kept.id == ChatItemID.line(lineID) else {
      return LineDrawing(text: text, names: names)
    }
    if let drawing = kept.drawing, drawing.text == text, drawing.names == names { return drawing }
    let drawing = LineDrawing(text: text, names: names)
    kept.drawing = drawing
    return drawing
  }

  private func act(_ action: LineAction) {
    actions((lineID, action))
  }

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      if !mine {
        Group {
          if let writer, appFace {
            AppIconChoice.current.image(size: Self.avatar)
              .accessibilityLabel(writer)
          } else if let writer {
            Button { act(.openProfile) } label: {
              MemberAvatar(name: writer, photoID: writerPhoto, groupID: groupID, size: Self.avatar)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(writer)のプロフィール")
          } else {
            Color.clear
          }
        }
        .frame(width: Self.avatar, height: writer == nil ? 0 : Self.avatar)
        // Said with the line, whose actions open the profile.
        .accessibilityHidden(true)
      }
      VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
        if let writer, named {
          Text(writer)
            .font(.caption2)
            .foregroundStyle(colors.textTertiary)
            .padding(.leading, 4)
            .accessibilityHidden(true)
        }
        HStack(alignment: .bottom, spacing: 8) {
          if mine { voicedMeta }
          actedBubble
          // Rung for a moment when gone to from the pins, as /design's
          // flash: a ring just outside the bubble, held, then fading.
          .background {
            ringShape
              .stroke(colors.accentBorder, lineWidth: 6)
              .opacity(seq != nil && marks?.ringed == seq ? 1 : 0)
          }
          // A photo opens large at a tap; its menu is the long press's.
          .heldForActions(lifted: marks?.lifted == lineID, opener: opener) {
            if photo != nil, !waiting { act(.openPhoto) }
          } onActions: {
            act(.hold(spot: $0, finger: $1, link: $2))
          }
          if !mine { voicedMeta }
        }
        if let shifts {
          // All the days, with everyone's shifts round them; pushed by the
          // groups' own stack, which a line's cell is hosted apart from.
          Button { openGroupRoute(shifts) } label: {
            Text("シフト表で見る")
              .font(.caption)
              .underline()
              .foregroundStyle(colors.accentDefault)
              .padding(.horizontal, 4)
          }
          .buttonStyle(.plain)
        }
        if failed {
          Text("送れませんでした")
            .font(.caption2)
            .foregroundStyle(colors.dangerDefault)
            .accessibilityHidden(true)
        }
        if !reactions.isEmpty {
          ReactionRow(
            reactions: reactions, meID: meID, nameOf: nameOf, counted: countedReactions,
            onReact: { act(.react($0)) })
        }
      }
      // Room for the tail of a run's first bubble by the face; every line
      // keeps it, so a run's lines line up. By the screen's edge the tail
      // reaches into the margin, as LINE's and Messages' do.
      .padding(.leading, mine ? 0 : BubbleShape.tailReach)
      .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
      // The room kept on the other side, less at the accessibility text
      // sizes, where the words need the width more, as Messages gives it.
      .padding(mine ? .leading : .trailing, typeSize.isAccessibilitySize ? 16 : 40)
    }
    // The line reads as one, everything done on it its actions; a card of
    // days or a poll keeps its own parts, the line said first by its time.
    .accessibilityElement(children: .contain)
    .modifier(voice(!carded))
  }

  /// What the line is drawn as, alone: its bubble lifted over the chat
  /// while its menu is open, where nothing on it is done.
  var bubble: LineContent {
    LineContent(
      text: text, preview: preview, days: days, members: members, poll: poll, photo: photo,
      quote: quote, groupID: groupID, mine: mine, first: first, waiting: waiting && !failed,
      nameOf: nameOf, unfolded: unfolded)
  }

  /// The bubble in the chat, its drawing kept and its parts acting.
  private var actedBubble: LineContent {
    var bubble = bubble
    bubble.drawing = drawing
    bubble.onOpenQuote = { act(.openQuote) }
    bubble.onStopSending = { act(.stopSending) }
    bubble.onUnfold = { act(.unfold) }
    bubble.onVote = { act(.vote($0, $1)) }
    bubble.onDecide = { act(.decide) }
    return bubble
  }

  /// Days or a poll on a card, whose days and 行ける VoiceOver goes
  /// through one by one.
  private var carded: Bool { !days.isEmpty }

  /// The time and state, the line as VoiceOver says it on a card's line.
  private var voicedMeta: some View {
    meta.modifier(voice(carded)).accessibilitySortPriority(1)
  }

  /// VoiceOver's line, where `here`.
  private func voice(_ here: Bool) -> OptionalVoice {
    guard here else { return OptionalVoice(voice: nil) }
    let people =
      countedReactions || reactions.isEmpty ? nil : reactionPeople(reactions, nameOf: nameOf)
    let opensPhoto = photo != nil && !waiting
    return OptionalVoice(
      voice: LineVoice(
        label: voiceLabel, people: people, isImage: photo != nil,
        activate: opensPhoto ? { act(.openPhoto) } : { opener.open?() },
        actions: voiceActions))
  }

  /// Who wrote it, what, when, and how it stands, as VoiceOver reads it.
  private var voiceLabel: String {
    var parts = [mine ? "自分" : author ?? writer ?? "メンバー"]
    if let quote {
      parts.append(quote.writer.map { "\($0)「\(quote.words)」への返信" } ?? "\(quote.words)への返信")
    }
    if let photo {
      parts.append(photoWords(photo))
    } else {
      if days.isEmpty, poll == nil {
        // Its words alone, kept with what the names make of them.
        let drawing = drawing
        let words = drawing.said ?? plainText(text, nameOf: nameOf)
        drawing.said = words
        parts.append(words)
      } else {
        parts.append(
          lineWords(text, days: days, poll: poll != nil, decided: poll?.decided, nameOf: nameOf))
      }
      if let preview, !preview.title.isEmpty {
        parts.append("リンク「\(preview.title)」")
      }
    }
    parts.append(ChatTime.clock(time))
    if pinned { parts.append("ピン留め中") }
    if edited { parts.append("編集済み") }
    if failed {
      parts.append("送れませんでした")
    } else if waiting {
      parts.append("送信中")
    }
    if !reactions.isEmpty {
      parts.append(reactionWords(reactions, meID: meID))
    }
    return parts.joined(separator: "、")
  }

  /// All that is done on the line by a gesture or a part of it, as
  /// VoiceOver's actions: what to do with it not sent first, then its menu
  /// as the long press opens it (返信 first, as the swipe does), and the
  /// rest of its parts.
  private var voiceActions: [VoiceAction] {
    var actions: [VoiceAction] = []
    if failed {
      actions.append(VoiceAction(title: "もう一度送る") { act(.sendAgain) })
      actions.append(VoiceAction(title: "削除") { act(.deleteUnsent) })
    } else if waiting, let photo, PhotoUploads.shared.stoppable(photo.id) {
      actions.append(VoiceAction(title: "送信をやめる") { act(.stopSending) })
    }
    if photo != nil, !waiting {
      actions.append(VoiceAction(title: "写真を開く") { act(.openPhoto) })
    }
    for title in menu {
      actions.append(VoiceAction(title: title) { act(.menu(title)) })
    }
    if !waiting {
      actions.append(VoiceAction(title: "リアクション") { opener.open?() })
      for reaction in reactions {
        let on = reaction.userIDs.contains(meID ?? "")
        actions.append(
          VoiceAction(title: on ? "\(reaction.emoji)を外す" : "\(reaction.emoji)を付ける") {
            act(.react(reaction.emoji))
          })
      }
    }
    if quote != nil {
      actions.append(VoiceAction(title: "返信元を表示") { act(.openQuote) })
    }
    for part in drawing.parts {
      if let link = part.url.flatMap({ URL(string: $0, encodingInvalidCharacters: true) }) {
        actions.append(
          VoiceAction(title: "リンクを開く \(link.host() ?? part.text)", target: link.absoluteString) {
            openURL(link)
          })
      } else if let id = part.mention, id != meID, let link = mentionLink(id) {
        actions.append(VoiceAction(title: "\(nameOf(id))のプロフィール") { openURL(link) })
      }
    }
    if !mine, !appFace {
      actions.append(
        VoiceAction(title: "\(author ?? writer ?? "メンバー")のプロフィール") { act(.openProfile) })
    }
    if let shifts {
      actions.append(VoiceAction(title: "シフト表で見る") { openGroupRoute(shifts) })
    }
    // Each once: a link written twice, a mention of the writer.
    var seen: Set<String> = []
    return actions.filter { seen.insert($0.id).inserted }
  }

  /// The ring's shape: the bubble's (a photo answering a line sits in
  /// one), or the card's.
  private var ringShape: AnyShape {
    days.isEmpty && (photo == nil || quote != nil)
      && !(photo == nil && quote == nil && preview == nil && drawing.largeEmoji > 0)
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
      if failed {
        // A menu rather than an action sheet, whose choice acts only once
        // it has gone: the ! and 送れませんでした go as it closes.
        Menu {
          Section(photo == nil ? "送れなかったメッセージ" : "送れなかった写真") {
            Button("もう一度送る", systemImage: "arrow.clockwise") { act(.sendAgain) }
            Button("削除", systemImage: "trash", role: .destructive) { act(.deleteUnsent) }
          }
        } label: {
          Image(systemName: "exclamationmark.circle.fill")
            .font(.title3)
            .foregroundStyle(colors.dangerDefault)
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .accessibilityLabel("送れませんでした")
        .accessibilityHint("押すと再送か削除")
      } else if waiting {
        // In the time's room, so the bubble stays as wide once sent.
        Text(ChatTime.clock(time))
          .hidden()
          .overlay(alignment: mine ? .trailing : .leading) {
            Image(systemName: "clock")
              .accessibilityLabel("送信中")
          }
      } else if showsTime {
        Text(ChatTime.clock(time))
      } else {
        // Left to the next line, its room is kept, so the bubble is as
        // wide either way; its width only, so 編集済み stays by the
        // bubble's foot.
        Text(ChatTime.clock(time)).hidden().frame(height: 0)
      }
    }
    .font(.caption2)
    .foregroundStyle(colors.textQuaternary)
    .padding(.bottom, 2)
    .fixedSize()
  }
}

/// A line still on its way, dimmed as laid on the chat's ground: in its
/// own outline the ground goes under it, so it shows the same over its
/// menu's dimming, and its copy lifted there, drawn over it for a moment
/// as the menu comes and goes, shows no brighter than one.
private struct DimmedWhileWaiting<Outline: View>: ViewModifier {
  @Environment(\.themeColors) private var colors
  let waiting: Bool
  @ViewBuilder let outline: Outline

  func body(content: Content) -> some View {
    content
      .opacity(waiting ? 0.6 : 1)
      .background {
        if waiting {
          colors.backgroundBase.mask { outline }
        }
      }
  }
}

extension View {
  /// Dimmed while it waits to be sent, the chat's ground in `shape` under
  /// it (DimmedWhileWaiting).
  func dimmedWhileWaiting(_ waiting: Bool, in shape: some Shape) -> some View {
    modifier(DimmedWhileWaiting(waiting: waiting) { shape })
  }

  /// Dimmed while it waits to be sent, the chat's ground under it in the
  /// outline of `outline`, for what has no shape of its own, like emoji.
  func dimmedWhileWaiting(_ waiting: Bool, outline: () -> some View) -> some View {
    modifier(DimmedWhileWaiting(waiting: waiting, outline: outline))
  }
}

/// The days from one through another.
struct DaySpan: Hashable {
  let from: Day
  let through: Day
}

/// What a line is drawn as: its words in a bubble, or its days on a card.
struct LineContent: View {
  let text: String
  /// What its words take to draw, when kept.
  var drawing: LineDrawing?
  /// Its first link's page.
  var preview: LinePreview?
  let days: [Day]
  let members: [GroupMember]
  /// Its days are put to the vote, with what the card needs.
  var poll: PollLine?
  /// The photo sent as the line, from the group's photos.
  var photo: LinePhoto?
  /// The line it answers, over its words or photo; shared days and polls
  /// show none, as /design's cards.
  var quote: LineQuote?
  var groupID = ""
  let mine: Bool
  let first: Bool
  let waiting: Bool
  let nameOf: (String) -> String
  var onOpenQuote: () -> Void = {}
  /// Stops its photo going up while it waits; none where it cannot be.
  var onStopSending: (() -> Void)?
  /// Its words opened past chatRules.foldLines lines.
  var unfolded = false
  var onUnfold: () -> Void = {}
  var onVote: (Day, Bool) -> Void = { _, _ in }
  var onDecide: () -> Void = {}
  @Environment(\.themeColors) private var colors

  var body: some View {
    if let photo, let quote {
      // A photo answering a line sits in a bubble under its quote.
      VStack(alignment: .leading, spacing: 8) {
        BubbleQuote(quote: quote, groupID: groupID, onOpen: onOpenQuote)
          .padding(.horizontal, 12)
          .padding(.top, 8)
          .foregroundStyle(mine ? colors.accentOnFill : colors.textPrimary)
        PhotoLine(photo: photo, groupID: groupID, waiting: waiting, onStop: onStopSending)
          .padding([.horizontal, .bottom], 4)
      }
      .fixedSize()
      .background(
        mine ? colors.accentFill : colors.fillTertiary, in: BubbleShape(mine: mine, first: first))
    } else if let photo {
      PhotoLine(photo: photo, groupID: groupID, waiting: waiting, onStop: onStopSending)
    } else if let poll {
      PollCard(
        days: days, votes: poll.votes, decided: poll.decided, members: members,
        names: poll.names, meID: poll.meID, canDecide: poll.canDecide, waiting: waiting,
        onVote: onVote, onDecide: onDecide)
    } else if days.isEmpty {
      MessageBubble(
        text: text, drawing: drawing, mine: mine, first: first, waiting: waiting, nameOf: nameOf,
        preview: preview,
        quote: quote, groupID: groupID, onOpenQuote: onOpenQuote, unfolded: unfolded,
        onUnfold: onUnfold)
    } else {
      DayCard(days: days, members: members)
        .dimmedWhileWaiting(waiting, in: RoundedRectangle(cornerRadius: Radius.lg))
    }
  }
}

/// A line's words in its bubble: others' on the quiet fill, one's own in
/// the accent, the first of a run with its tail by the writer, dimmed
/// while it waits to be sent.
struct MessageBubble: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dynamicTypeSize) private var typeSize
  /// Where a held bubble notes its links, for a long press on one.
  @Environment(\.linkSpots) private var linkSpots
  let text: String
  /// What its words take to draw, when kept; made as drawn otherwise.
  var drawing: LineDrawing?
  let mine: Bool
  let first: Bool
  let waiting: Bool
  /// A member's name, for the line's mentions.
  let nameOf: (String) -> String
  /// Its first link's page, under its words.
  var preview: LinePreview?
  /// The line it answers, over its words.
  var quote: LineQuote?
  var groupID = ""
  var onOpenQuote: () -> Void = {}
  /// Its words opened past chatRules.foldLines lines.
  var unfolded = false
  var onUnfold: () -> Void = {}
  /// Emoji drawn large grow with the reader's text size, as body does.
  @ScaledMetric(relativeTo: .body) private var emojiSize = CGFloat(Chat.largeEmojiSize)

  /// How wide a bubble with a page is, as /design's linked bubble.
  private static var linkedWidth: CGFloat { 240 }

  var body: some View {
    let drawing = drawing.flatMap { $0.text == text ? $0 : nil } ?? LineDrawing(text: text)
    // Nothing but a few emoji: large, without a bubble (spec/chat.md,
    // Large emoji); a reply keeps its bubble, its quote inside it.
    if quote == nil, preview == nil, drawing.invitation == nil, drawing.largeEmoji > 0 {
      Text(text)
        .font(.system(size: emojiSize))
        .dimmedWhileWaiting(waiting) { Text(text).font(.system(size: emojiSize)) }
    } else {
      bubble(drawing)
    }
  }

  private func bubble(_ drawing: LineDrawing) -> some View {
    let invitation = drawing.invitation
    let pieces = pieces(drawing)
    return VStack(alignment: .leading, spacing: 8) {
      if let quote {
        BubbleQuote(quote: quote, groupID: groupID, onOpen: onOpenQuote)
          .foregroundStyle(mine ? colors.accentOnFill : colors.textPrimary)
      }
      if unfolded {
        shownWords(pieces)
      } else {
        // Whether the words run past chatRules.foldLines is measured in
        // the same layout that draws them, so a long line has its final
        // height the first time it is laid out (spec/chat.md, Long
        // messages).
        FoldsWords(drawing: drawing) {
          Text(words(pieces)).styledAsWords.lineLimit(Chat.foldLines).hidden()
          ViewThatFits(in: .vertical) {
            shownWords(pieces)
            foldedWords(pieces)
          }
        }
      }
      // An invitation's card takes the place of the one page.
      if let invitation {
        InviteCard(code: invitation)
      } else if let preview {
        LinkPreviewCard(preview: preview, mine: mine)
      }
    }
    // At the accessibility text sizes as wide as the line has room for,
    // its page's words too large for the width.
    .frame(
      width: preview == nil && invitation == nil || typeSize.isAccessibilitySize
        ? nil : Self.linkedWidth, alignment: .leading)
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .background(
      mine ? colors.accentFill : colors.fillTertiary,
      in: BubbleShape(mine: mine, first: first)
    )
    .dimmedWhileWaiting(waiting, in: BubbleShape(mine: mine, first: first))
  }

  /// The words cut at chatRules.foldLines lines, with 続きを読む.
  private func foldedWords(_ pieces: [LinePiece]) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      shownWords(pieces).lineLimit(Chat.foldLines)
      Button("続きを読む", action: onUnfold)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(mine ? colors.accentOnFill : colors.accentDefault)
        .buttonStyle(.plain)
    }
    .fixedSize(horizontal: false, vertical: true)
  }

  /// The words as drawn in the bubble, their links marked.
  private func shownWords(_ pieces: [LinePiece]) -> some View {
    markedWords(pieces)
      .styledAsWords
      .foregroundStyle(mine ? colors.accentOnFill : colors.textPrimary)
      .tint(mine ? colors.accentOnFill : colors.accentDefault)
      .modifier(FindsLinks(spots: linkSpots))
  }

  /// The line's words, its mentions as @ and the name in the name's
  /// weight and its links underlined, both in the accent in others' lines
  /// and in the bubble's color in one's own (spec/chat.md, In a message).
  private func words(_ pieces: [LinePiece]) -> AttributedString {
    pieces.reduce(into: AttributedString()) { $0 += $1.words }
  }

  /// The words with their links marked, for a long press to find.
  private func markedWords(_ pieces: [LinePiece]) -> Text {
    pieces.reduce(Text(verbatim: "")) { sofar, piece in
      let text = Text(piece.words)
      return Text("\(sofar)\(piece.link.map { text.customAttribute(LinkMark(url: $0)) } ?? text)")
    }
  }

  /// Each part of the words as drawn, and the page it links to: styled
  /// once for the line as its row looks, kept in `drawing`.
  private func pieces(_ drawing: LineDrawing) -> [LinePiece] {
    if let kept = drawing.pieces, kept.mine == mine { return kept.pieces }
    let pieces = drawing.parts.map { part -> LinePiece in
      var piece = AttributedString(part.mention.map { "@\(nameOf($0))" } ?? part.text)
      if let mentioned = part.mention {
        piece.font = .body.weight(.semibold)
        piece.foregroundColor = mine ? colors.accentOnFill : colors.accentDefault
        // Opens their profile, as a link would (spec/chat.md, Mentions).
        piece.link = mentionLink(mentioned)
      } else if let link = part.url.flatMap({ URL(string: $0, encodingInvalidCharacters: true) }) {
        piece.link = link
        piece.underlineStyle = .single
        return LinePiece(words: piece, link: link)
      }
      return LinePiece(words: piece, link: nil)
    }
    drawing.pieces = (mine, pieces)
    return pieces
  }
}

extension Text {
  /// A message's words' type, the same for those drawn and those measured.
  fileprivate var styledAsWords: some View {
    font(.body).lineSpacing(3)
  }
}

/// A part of a message's words as drawn, and the page it links to.
struct LinePiece {
  let words: AttributedString
  let link: URL?
}

/// What a chat line's words take to draw, made once and kept while its
/// row looks the same, as Signal and Telegram keep theirs: its parts, its
/// words styled, and what they measure cut at 続きを読む and whole. Each
/// is made as first asked for. The chat's lines keep one for each line,
/// for its look, in ChatLinesModel; drawn elsewhere, a line makes its own
/// as it is drawn.
@MainActor final class LineDrawing {
  let text: String
  /// The members' names its mentions were drawn with.
  let names: [String: String]
  /// Its words, links and mentions.
  private(set) lazy var parts = textParts(text)
  /// The invitation code of its first link, when that is one of
  /// Pochical's invitations.
  private(set) lazy var invitation: String? = parts.lazy.compactMap(\.url).first
    .flatMap { URL(string: $0) }.flatMap(inviteCode(of:))
  /// How many emoji it is, when it is nothing else (spec/chat.md, Large
  /// emoji).
  private(set) lazy var largeEmoji = PochicalKit.largeEmoji(text)
  /// Its words styled, for one's own line or another's.
  var pieces: (mine: Bool, pieces: [LinePiece])?
  /// What its words measure at each width offered them (FoldsWords).
  var measured: [CGFloat?: Measured] = [:]
  /// What VoiceOver says of its words.
  var said: String?

  init(text: String, names: [String: String] = [:]) {
    self.text = text
    self.names = names
  }

  /// The height a message's words take cut at chatRules.foldLines lines,
  /// and the size of the words, whole or cut with 続きを読む.
  struct Measured {
    let cut: CGFloat
    let size: CGSize
  }
}

/// Where the chat's lines keep the item `id`'s drawing, for its row's look.
@MainActor final class KeptDrawing {
  let id: String
  let look: AnyHashable
  var drawing: LineDrawing?

  init(id: String, look: AnyHashable) {
    self.id = id
    self.look = look
  }
}

/// A message's words cut at chatRules.foldLines lines with 続きを読む, or
/// whole, decided while they are laid out: its first view is the words cut
/// (hidden, measured only), its second a ViewThatFits of the words whole
/// and the words cut with 続きを読む, offered the height of the cut words,
/// so the whole words fit there only when nothing is cut. Measuring in a
/// later update instead grew each long line by 続きを読む a frame after it
/// first showed, moving the lines. What it measures is kept in `drawing`
/// for each width, for the next time the line is measured or drawn.
private struct FoldsWords: Layout {
  let drawing: LineDrawing

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    measure(proposal.width, subviews).size
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    // Offered the width they were measured at, which they take no more of.
    let width = proposal.width ?? bounds.width
    let cut = measure(width, subviews).cut
    subviews[0].place(at: bounds.origin, proposal: ProposedViewSize(width: width, height: nil))
    subviews[1].place(at: bounds.origin, proposal: ProposedViewSize(width: width, height: cut))
  }

  // Placed where the lines put them, the words need no guides of their
  // own; the default asks the words for theirs, measuring them again.
  func explicitAlignment(
    of guide: HorizontalAlignment, in bounds: CGRect, proposal: ProposedViewSize,
    subviews: Subviews, cache: inout ()
  ) -> CGFloat? {
    nil
  }

  func explicitAlignment(
    of guide: VerticalAlignment, in bounds: CGRect, proposal: ProposedViewSize,
    subviews: Subviews, cache: inout ()
  ) -> CGFloat? {
    nil
  }

  /// The height the cut words take at `width`, and the size of the words
  /// offered that height: measured once for each width.
  private func measure(_ width: CGFloat?, _ subviews: Subviews) -> LineDrawing.Measured {
    // SwiftUI lays out on the main thread.
    MainActor.assumeIsolated {
      if let known = drawing.measured[width] { return known }
      let cut = subviews[0].sizeThatFits(ProposedViewSize(width: width, height: nil)).height
      let size = subviews[1].sizeThatFits(ProposedViewSize(width: width, height: cut))
      let measured = LineDrawing.Measured(cut: cut, size: size)
      drawing.measured[width] = measured
      return measured
    }
  }
}

/// A mention's link in a message's words, which the chat opens as the
/// member's profile rather than as a page.
private func mentionLink(_ userID: String) -> URL? {
  var parts = URLComponents()
  parts.scheme = mentionScheme
  parts.path = userID
  return parts.url
}

/// The member a mention's link names.
func mentioned(by url: URL) -> String? {
  url.scheme == mentionScheme ? url.path : nil
}

private let mentionScheme = "pochical-mention"

/// A bubble's outline: round all over at `Radius.lg`, but the first of a
/// run, as LINE draws one: from a notch in its top corner by the writer's
/// side a horn rises to a tip level with the top edge, past the bubble's
/// frame by `tailReach`, and curves back in to the side, by the face and
/// name the run starts with, so it says whose words follow. One outline,
/// as /design's bubblePath draws it (spec/chat.md, In a message).
struct BubbleShape: Shape {
  let mine: Bool
  let first: Bool

  /// How far past the bubble's frame its tail reaches, which the lines
  /// keep room for by the face.
  static var tailReach: CGFloat { 10 }

  nonisolated func path(in rect: CGRect) -> Path {
    let w = rect.width
    let h = rect.height
    let r = min(Radius.lg, w / 2, h / 2)
    var path = Path()
    // Drawn as one's own, its tail at the top trailing corner; others'
    // are mirrored.
    path.move(to: CGPoint(x: r, y: 0))
    path.addLine(to: CGPoint(x: w - r, y: 0))
    if first {
      // Down the corner's arc to the notch, three quarters of the way in.
      let notch = CGPoint(x: w - 0.25 * r, y: r - (r * r - 0.5625 * r * r).squareRoot())
      path.addRelativeArc(
        center: CGPoint(x: w - r, y: r), radius: r, startAngle: .degrees(-90),
        delta: .radians(atan2(notch.y - r, 0.75 * r)) + .degrees(90))
      let tip = CGPoint(x: w + 0.6 * r, y: 0)
      path.addCurve(
        to: tip, control1: CGPoint(x: notch.x + 0.2 * r, y: notch.y - 0.25 * r),
        control2: CGPoint(x: tip.x - 0.35 * r, y: 0.04 * r))
      path.addCurve(
        to: CGPoint(x: w, y: min(1.5 * r, h - r)),
        control1: CGPoint(x: tip.x - 0.3 * r, y: 0.12 * r), control2: CGPoint(x: w, y: 0.55 * r))
    } else {
      path.addArc(
        center: CGPoint(x: w - r, y: r), radius: r, startAngle: .degrees(-90),
        endAngle: .degrees(0), clockwise: false)
    }
    path.addArc(
      center: CGPoint(x: w - r, y: h - r), radius: r, startAngle: .degrees(0),
      endAngle: .degrees(90), clockwise: false)
    path.addArc(
      center: CGPoint(x: r, y: h - r), radius: r, startAngle: .degrees(90),
      endAngle: .degrees(180), clockwise: false)
    path.addArc(
      center: CGPoint(x: r, y: r), radius: r, startAngle: .degrees(180),
      endAngle: .degrees(270), clockwise: false)
    path.closeSubpath()
    let mirror = mine ? .identity : CGAffineTransform(a: -1, b: 0, c: 0, d: 1, tx: w, ty: 0)
    return path.applying(mirror.concatenating(.init(translationX: rect.minX, y: rect.minY)))
  }
}

/// A held bubble's words drawn noting where their links are, and where
/// they are on the screen.
private struct FindsLinks: ViewModifier {
  /// Measured where the held finger is told: in a chat line's cell.
  @Environment(\.lineSpace) private var lineSpace
  let spots: LinkSpots?

  func body(content: Content) -> some View {
    if let spots {
      let inLine = lineSpace != nil
      content
        .textRenderer(LinkFinder(spots: spots))
        .modifier(HeldLinksOpenNothing(spots: spots))
        .onGeometryChange(for: CGRect.self) {
          inLine ? $0.frame(in: .named(LineSpace.name)) : $0.frame(in: .global)
        } action: {
          spots.frame = $0
        }
    } else {
      content
    }
  }
}
