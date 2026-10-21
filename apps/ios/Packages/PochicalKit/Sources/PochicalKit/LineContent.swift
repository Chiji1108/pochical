import Foundation
import PochicalProto
import SQLiteData

/// What a chat line is (spec/chat.md, What a line is): one thing to the
/// reader, so one kind of it.
public enum LineContent: Hashable, Sendable {
  case words(Words)
  /// The photos sent as the line, in the order sent: one, or several
  /// drawn as an album (spec/chat.md, Albums).
  case photos([LinePhoto])
  /// The days it shares with everyone's shifts, in order.
  case days([Day])
  case poll(Poll)
  /// A line from the app in 全体チャット (spec/chat.md, Notices).
  case notice(LineNotice)
  /// Taken back by its writer (送信取消): nothing of it is left.
  case unsent
  /// Sent in a one-to-one chat by someone the reader had blocked, or of a
  /// kind this app does not know: shown as nothing.
  case hidden

  public struct Words: Hashable, Sendable, Codable {
    public var text: String
    /// Changed after it was sent (編集済み).
    public var edited = false
    /// Its first link's page, under its words.
    public var preview: LinePreview?

    public init(text: String, edited: Bool = false, preview: LinePreview? = nil) {
      self.text = text
      self.edited = edited
      self.preview = preview
    }
  }

  /// Days put to the vote (spec/chat.md, Polls).
  public struct Poll: Hashable, Sendable, Codable {
    public var days: [Day]
    /// Who can come on each of its days, in the order they said so.
    public var votes: [DayVotes] = []
    /// The day it was settled on; none while open.
    public var decided: Day?

    public init(days: [Day], votes: [DayVotes] = [], decided: Day? = nil) {
      self.days = days
      self.votes = votes
      self.decided = decided
    }
  }

  public enum Kind: String, Codable, Sendable, QueryBindable {
    case words, photos, days, poll, notice, unsent, hidden
  }

  public var kind: Kind {
    switch self {
    case .words: .words
    case .photos: .photos
    case .days: .days
    case .poll: .poll
    case .notice: .notice
    case .unsent: .unsent
    case .hidden: .hidden
    }
  }

  /// The photos it carries, none for a line of anything else.
  public var photos: [LinePhoto] {
    if case .photos(let photos) = self { photos } else { [] }
  }

  /// Its words, none for a line of anything else.
  public var words: Words? {
    if case .words(let words) = self { words } else { nil }
  }

  /// The days it shares or puts to the vote, none for a line of anything
  /// else.
  public var days: [Day] {
    switch self {
    case .days(let days): days
    case .poll(let poll): poll.days
    case .words, .photos, .notice, .unsent, .hidden: []
    }
  }

  /// The line's content as the group sent it; none, or a kind or notice
  /// this app does not know, is nothing to show.
  init(_ wire: Pochical_V1_ChatContent) {
    switch wire.kind {
    case .words(let words):
      self = .words(
        Words(
          text: words.text, edited: words.edited,
          preview: words.hasPreview ? LinePreview(words.preview) : nil))
    case .photos(let album): self = .photos(album.photos.map(LinePhoto.init))
    case .days(let days): self = .days(days.days.compactMap(Day.init))
    case .poll(let poll):
      self = .poll(
        Poll(
          days: poll.days.compactMap(Day.init),
          votes: poll.votes.compactMap { votes in
            Day(votes.day).map { DayVotes(day: $0, userIDs: votes.userIds) }
          },
          decided: Day(poll.decided)))
    case .notice(let notice): self = LineNotice(notice).map(LineContent.notice) ?? .hidden
    case .unsent: self = .unsent
    case .hidden, nil: self = .hidden
    }
  }

  /// The line a send makes, as the group will hold it: its words not
  /// changed yet, its poll open; none, or a kind this app does not know,
  /// is nothing to show.
  init(_ wire: Pochical_V1_ChatSendContent) {
    switch wire.kind {
    case .words(let words):
      self = .words(
        Words(text: words.text, preview: words.hasPreview ? LinePreview(words.preview) : nil))
    case .photos(let album): self = .photos(album.photos.map(LinePhoto.init))
    case .days(let days): self = .days(days.days.compactMap(Day.init))
    case .poll(let poll): self = .poll(Poll(days: poll.days.compactMap(Day.init)))
    case nil: self = .hidden
    }
  }
}

/// Kept as JSON with its `kind`, the rest of a kind beside it.
extension LineContent: Codable {
  private enum Key: String, CodingKey {
    case kind, photos, days, notice
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: Key.self)
    switch try container.decode(Kind.self, forKey: .kind) {
    case .words: self = .words(try Words(from: decoder))
    case .photos: self = .photos(try container.decode([LinePhoto].self, forKey: .photos))
    case .days: self = .days(try container.decode([Day].self, forKey: .days))
    case .poll: self = .poll(try Poll(from: decoder))
    case .notice: self = .notice(try container.decode(LineNotice.self, forKey: .notice))
    case .unsent: self = .unsent
    case .hidden: self = .hidden
    }
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: Key.self)
    try container.encode(kind, forKey: .kind)
    switch self {
    case .words(let words): try words.encode(to: encoder)
    case .photos(let photos): try container.encode(photos, forKey: .photos)
    case .days(let days): try container.encode(days, forKey: .days)
    case .poll(let poll): try poll.encode(to: encoder)
    case .notice(let notice): try container.encode(notice, forKey: .notice)
    case .unsent, .hidden: break
    }
  }
}

extension ChatLineRow.TableColumns {
  /// The line's kind, read from its content.
  var kind: some QueryExpression<LineContent.Kind> {
    #sql("json_extract(\(content), '$.kind')")
  }
}
