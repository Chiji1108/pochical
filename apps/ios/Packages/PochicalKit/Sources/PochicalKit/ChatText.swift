import Foundation
import PochicalDesign

// A chat message's words as spec/chat.md has them: its links, and the
// members it mentions (spec/vectors/chat-text.json). Ids and the
// characters a URL is written in are ASCII, as `\w` is in JavaScript, so
// every platform cuts a message alike.

/// One piece of a message: words, a link, or a mention kept as `<@id>`.
public struct TextPart: Hashable, Sendable, Decodable {
  public let text: String
  /// The address, when the piece is a link.
  public let url: String?
  /// The member's id, when the piece is a mention.
  public let mention: String?

  public init(text: String, url: String? = nil, mention: String? = nil) {
    self.text = text
    self.url = url
    self.mention = mention
  }
}

/// A link (http:// or https://, any case, over the characters a URL is
/// written in) or a mention. Made for each use: a regex is not Sendable.
private var linkOrMention: Regex<(Substring, id: Substring?, link: Substring?)> {
  /<@(?<id>[A-Za-z0-9_-]+)>|(?<link>(?i:https?):\/\/[A-Za-z0-9_\-.~:\/?#\[\]@!$&'()*+,;=%]+)/
}

/// What closes a sentence rather than the address when it comes last.
private let trailing: Set<Character> = [".", ",", "!", "?", ":", ";", "'", "*"]

/// The address without what closes the sentence around it: a full stop,
/// a comma, or a bracket opened before the address.
private func trimLink(_ found: Substring) -> Substring {
  var link = found
  func dropTrailing() {
    while let last = link.last, trailing.contains(last) { link = link.dropLast() }
  }
  dropTrailing()
  for (open, close) in [("(", ")"), ("[", "]")] as [(Character, Character)] {
    while link.last == close, link.count(where: { $0 == close }) > link.count(where: { $0 == open }) {
      link = link.dropLast()
      dropTrailing()
    }
  }
  return link
}

/// Whether the link has a host: `https://` alone is not one.
private func hasHost(_ link: Substring) -> Bool {
  guard let scheme = link.range(of: "://") else { return false }
  let authority = link[scheme.upperBound...].prefix { !"/?#".contains($0) }
  let host = authority.split(separator: "@", omittingEmptySubsequences: false).last ?? ""
  return !host.isEmpty
}

/// The message cut into its words, links and mentions, in order. A
/// mention's text is its token; `plainText` and the chat show the name.
public func textParts(_ text: String) -> [TextPart] {
  var parts: [TextPart] = []
  var at = text.startIndex
  for match in text.matches(of: linkOrMention) {
    let part: TextPart
    let start = match.range.lowerBound
    if let id = match.output.id {
      part = TextPart(text: String(match.output.0), mention: String(id))
    } else if let found = match.output.link {
      let link = trimLink(found)
      guard hasHost(link) else { continue }
      part = TextPart(text: String(link), url: String(link))
    } else {
      continue
    }
    if start > at {
      parts.append(TextPart(text: String(text[at..<start])))
    }
    parts.append(part)
    at = text.index(start, offsetBy: part.text.count)
  }
  if at < text.endIndex {
    parts.append(TextPart(text: String(text[at...])))
  }
  return parts
}

/// The members a message mentions, by their id, in order.
public func mentions(in text: String) -> [String] {
  textParts(text).compactMap(\.mention)
}

/// The message as words alone, each mention as @ and the member's name:
/// for コピー, a chat's last line in the list, a quote and a notification.
public func plainText(_ text: String, nameOf: (String) -> String) -> String {
  textParts(text).map { part in part.mention.map { "@\(nameOf($0))" } ?? part.text }.joined()
}

/// A member picked from the composer's list of names.
public struct PickedMember: Hashable, Sendable, Decodable {
  public let id: String
  public let name: String

  public init(id: String, name: String) {
    self.id = id
    self.name = name
  }
}

/// A message as sent: each member picked while writing, whose @name is
/// still in it followed by a space or the end, kept as their mention.
/// Picking writes @name and a space, and only that counts: Japanese runs
/// on without spaces, so @あや in @あやか is not あや.
public func withMentions(_ text: String, picked: [PickedMember]) -> String {
  var sent = text
  for member in picked {
    let written = "@\(member.name)"
    var result = ""
    var rest = sent[...]
    while let found = rest.range(of: written) {
      let after = found.upperBound
      let whole = after == rest.endIndex || rest[after].isWhitespace
      result += rest[..<found.lowerBound]
      result += whole ? "<@\(member.id)>" : String(rest[found])
      rest = rest[after...]
    }
    sent = result + rest
  }
  return sent
}

/// The @ being written, or the full-width ＠ a Japanese keyboard types.
private func isAt(_ character: Character) -> Bool {
  character == "@" || character == "＠"
}

/// What follows an @ at the end of the message being written, the names
/// to list for it; nil without one. A space ends it.
public func mentionQuery(_ draft: String) -> String? {
  guard let at = draft.lastIndex(where: isAt) else { return nil }
  let query = draft[draft.index(after: at)...]
  return query.contains(where: \.isWhitespace) ? nil : String(query)
}

/// The draft with the @ being written at its end turned into the
/// member's @name and a space.
public func pickingMention(_ draft: String, name: String) -> String {
  guard mentionQuery(draft) != nil, let at = draft.lastIndex(where: isAt) else { return draft }
  return String(draft[..<at]) + "@\(name) "
}

/// Whether the text is exactly one emoji, as the pickers and the system
/// keyboards give one: one character that starts as a pictograph or a
/// flag, or a keycap (1️⃣, #️⃣), which starts with its plain digit or sign
/// (spec/text-limits.md; spec/vectors/text.json, isEmoji).
public func isEmoji(_ text: String) -> Bool {
  guard text.count == 1, let first = text.unicodeScalars.first else { return false }
  // A keycap starts with its plain digit or sign, which alone is no emoji.
  let keycapBase = "#*0123456789".unicodeScalars.contains(first)
  if keycapBase {
    return text.unicodeScalars.contains("\u{20E3}")
  }
  // A pictograph or a flag's regional indicator; Swift names no
  // Extended_Pictographic, and the Emoji property covers the same first
  // characters once the keycaps' bases are set apart.
  return first.properties.isEmoji
}

/// How many emoji a message of nothing but 1 to `Chat.largeEmojiMax`
/// emoji has, each one as `isEmoji` has it, shown large without a bubble;
/// 0 for any other message (spec/chat.md, Large emoji;
/// spec/vectors/chat-text.json, largeEmoji).
public func largeEmoji(_ text: String) -> Int {
  let characters = text.map(String.init)
  guard (1...Chat.largeEmojiMax).contains(characters.count), characters.allSatisfy(isEmoji)
  else { return 0 }
  return characters.count
}
