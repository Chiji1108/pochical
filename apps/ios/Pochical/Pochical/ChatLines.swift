import PochicalDesign
import PochicalKit
import SwiftUI

// A chat's lines as ChatScreen lays them out: the items in order, and
// each line's bubble, its words, links and mentions.

/// One thing in a chat's lines.
enum ChatItem: Identifiable {
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
  /// Its photo that could not be sent: its choices.
  case retry
  /// The reader's reaction put on, or taken back.
  case react(String)
  /// A poll's 行ける, on or off.
  case vote(Day, Bool)
  /// 日にちを決める.
  case decide
  /// Held: its reactions and menu, from where its bubble is, with the
  /// finger that opened them while it stays down, and the link held.
  case hold(frame: CGRect, finger: HeldFinger?, link: URL?)
}

/// A line of words: others' on the left with their face and, at the start
/// of a run, their name; one's own on the right in the accent, dimmed
/// while it waits to be sent. The time beside the bubble, 編集済み over it.
struct LineView: View {
  @Environment(\.themeColors) private var colors
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
  /// The writer's photo, one of the group's; empty for none.
  var writerPhoto = ""
  /// Their name shows over the run too, as in a group chat.
  let named: Bool
  /// It starts a run of one writer's lines, its bubble's corner drawn in.
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
  /// Gone to from the pins: ringed for a moment.
  var ringed = false
  var meID: String?
  /// Its bubble is lifted over the chat, its place standing empty.
  var lifted = false
  /// What is done on the line, for the chat to act on as it is when used:
  /// the line, a chat's lines held all at once, is made again only as
  /// what it shows changes, not as the chat changes around it (a line
  /// coming, the keyboard moving).
  let actions: Handler<(lineID: String, action: LineAction)>

  private static var avatar: CGFloat { 32 }

  /// A member's name in the group as it is now, for their mentions.
  private func nameOf(_ id: String) -> String {
    names[id] ?? "メンバー"
  }

  private func act(_ action: LineAction) {
    actions((lineID, action))
  }

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      if !mine {
        Group {
          if let writer {
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
            quote: quote, groupID: groupID, mine: mine, first: first,
            waiting: waiting && !failed, nameOf: nameOf, onOpenQuote: { act(.openQuote) },
            unfolded: unfolded, onUnfold: { act(.unfold) },
            onVote: { act(.vote($0, $1)) }, onDecide: { act(.decide) }
          )
          // A photo opens large at a tap; its menu is the long press's.
          .onTapGesture { if photo != nil, !waiting { act(.openPhoto) } }
          // Rung for a moment when gone to from the pins, as /design's
          // flash: a ring just outside the bubble, held, then fading.
          .background {
            ringShape
              .stroke(colors.accentBorder, lineWidth: 6)
              .opacity(ringed ? 1 : 0)
          }
            .heldForActions(lifted: lifted) { act(.hold(frame: $0, finger: $1, link: $2)) }
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
    days.isEmpty && photo == nil && !(quote == nil && preview == nil && largeEmoji(text) > 0)
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
        Button { act(.retry) } label: {
          Image(systemName: "exclamationmark.circle.fill")
            .font(.title3)
            .foregroundStyle(colors.dangerDefault)
        }
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

/// A line's words in its bubble: others' on the quiet fill, one's own in
/// the accent, the first of a run with its corner by the writer drawn in,
/// dimmed while it waits to be sent.
/// The days from one through another.
struct DaySpan: Hashable {
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
  /// The line it answers, over its words or photo; shared days and polls
  /// show none, as /design's cards.
  var quote: LineQuote?
  var groupID = ""
  let mine: Bool
  let first: Bool
  let waiting: Bool
  let nameOf: (String) -> String
  var onOpenQuote: () -> Void = {}
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
        PhotoLine(photo: photo, groupID: groupID, waiting: waiting)
          .padding([.horizontal, .bottom], 4)
      }
      .fixedSize()
      .background(
        mine ? colors.accentFill : colors.fillTertiary, in: BubbleShape(mine: mine, first: first))
    } else if let photo {
      PhotoLine(photo: photo, groupID: groupID, waiting: waiting)
    } else if let poll {
      PollCard(
        days: days, votes: poll.votes, decided: poll.decided, members: members,
        names: poll.names, meID: poll.meID, canDecide: poll.canDecide, waiting: waiting,
        onVote: onVote, onDecide: onDecide)
    } else if days.isEmpty {
      MessageBubble(
        text: text, mine: mine, first: first, waiting: waiting, nameOf: nameOf, preview: preview,
        quote: quote, groupID: groupID, onOpenQuote: onOpenQuote, unfolded: unfolded,
        onUnfold: onUnfold)
    } else {
      DayCard(days: days, members: members)
        .opacity(waiting ? 0.6 : 1)
    }
  }
}

struct MessageBubble: View {
  @Environment(\.themeColors) private var colors
  /// Where a held bubble notes its links, for a long press on one.
  @Environment(\.linkSpots) private var linkSpots
  let text: String
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
  /// Its words' height whole, and as shown: taller whole, they are cut.
  @State private var wholeHeight: CGFloat = 0
  @State private var shownHeight: CGFloat = 0
  /// Emoji drawn large grow with the reader's text size, as body does.
  @ScaledMetric(relativeTo: .body) private var emojiSize = CGFloat(Chat.largeEmojiSize)

  /// The invitation code of its first link, when that is one of
  /// Pochical's invitations.
  private var invitation: String? {
    firstLink(text).flatMap { URL(string: $0) }.flatMap(inviteCode(of:))
  }

  /// How wide a bubble with a page is, as /design's linked bubble.
  private static var linkedWidth: CGFloat { 240 }

  var body: some View {
    // Nothing but a few emoji: large, without a bubble (spec/chat.md,
    // Large emoji); a reply keeps its bubble, its quote inside it.
    if quote == nil, preview == nil, invitation == nil, largeEmoji(text) > 0 {
      Text(text)
        .font(.system(size: emojiSize))
        .opacity(waiting ? 0.6 : 1)
    } else {
      bubble
    }
  }

  private var bubble: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let quote {
        BubbleQuote(quote: quote, groupID: groupID, onOpen: onOpenQuote)
          .foregroundStyle(mine ? colors.accentOnFill : colors.textPrimary)
      }
      VStack(alignment: .leading, spacing: 4) {
        markedWords
          .font(.body)
          .lineSpacing(3)
          .lineLimit(unfolded ? nil : Chat.foldLines)
          .foregroundStyle(mine ? colors.accentOnFill : colors.textPrimary)
          .tint(mine ? colors.accentOnFill : colors.accentDefault)
          .modifier(FindsLinks(spots: linkSpots))
          .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { shownHeight = $0 }
          // The words whole at the same width, measured, not guessed from
          // their length (spec/chat.md, Long messages).
          .background(alignment: .top) {
            Text(words)
              .font(.body)
              .lineSpacing(3)
              .fixedSize(horizontal: false, vertical: true)
              .hidden()
              .onGeometryChange(for: CGFloat.self) { $0.size.height } action: {
                wholeHeight = $0
              }
          }
        if !unfolded, wholeHeight > shownHeight + 1 {
          Button("続きを読む", action: onUnfold)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(mine ? colors.accentOnFill : colors.accentDefault)
            .buttonStyle(.plain)
        }
      }
      // An invitation's card takes the place of the one page.
      if let invitation {
        InviteCard(code: invitation)
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
    pieces.reduce(into: AttributedString()) { $0 += $1.words }
  }

  /// The words with their links marked, for a long press to find.
  private var markedWords: Text {
    pieces.reduce(Text(verbatim: "")) { sofar, piece in
      let text = Text(piece.words)
      return Text("\(sofar)\(piece.link.map { text.customAttribute(LinkMark(url: $0)) } ?? text)")
    }
  }

  /// Each part of the words as drawn, and the page it links to.
  private var pieces: [(words: AttributedString, link: URL?)] {
    textParts(text).map { part in
      var piece = AttributedString(part.mention.map { "@\(nameOf($0))" } ?? part.text)
      if let mentioned = part.mention {
        piece.font = .body.weight(.semibold)
        piece.foregroundColor = mine ? colors.accentOnFill : colors.accentDefault
        // Opens their profile, as a link would (spec/chat.md, Mentions).
        piece.link = mentionLink(mentioned)
      } else if let link = part.url.flatMap({ URL(string: $0, encodingInvalidCharacters: true) }) {
        piece.link = link
        piece.underlineStyle = .single
        return (piece, link)
      }
      return (piece, nil)
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


/// A held bubble's words drawn noting where their links are, and where
/// they are on the screen.
private struct FindsLinks: ViewModifier {
  let spots: LinkSpots?

  func body(content: Content) -> some View {
    if let spots {
      content
        .textRenderer(LinkFinder(spots: spots))
        .modifier(HeldLinksOpenNothing(spots: spots))
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { spots.frame = $0 }
    } else {
      content
    }
  }
}
