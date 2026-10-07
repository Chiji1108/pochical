import Foundation
import PochicalProto

/// A link's page as a line carries it (spec/chat.md, Previews): made while
/// the message is written and sent with it, so every reader sees the same.
public struct LinePreview: Hashable, Sendable, Codable {
  public let url: String
  public let title: String
  public let site: String
  /// The page's picture as the server keeps it; empty for none.
  public let imageID: String
  public let imageWidth: Int
  public let imageHeight: Int

  public init(_ preview: Pochical_V1_LinkPreview) {
    url = preview.url
    title = preview.title
    site = preview.site
    imageID = preview.imageID
    imageWidth = Int(preview.imageWidth)
    imageHeight = Int(preview.imageHeight)
  }

  /// As the wire carries it.
  public var wire: Pochical_V1_LinkPreview {
    var preview = Pochical_V1_LinkPreview()
    preview.url = url
    preview.title = title
    preview.site = site
    preview.imageID = imageID
    preview.imageWidth = UInt32(imageWidth)
    preview.imageHeight = UInt32(imageHeight)
    return preview
  }
}

/// The link a message's preview is for: its first.
public func firstLink(_ text: String) -> String? {
  textParts(text).lazy.compactMap(\.url).first
}

/// Whether new words keep the line's page: while their first link is the
/// line's (spec/vectors/chat.json, edited).
public func keepsPreview(of text: String, editedTo edit: String) -> Bool {
  firstLink(text) == firstLink(edit)
}

/// The link a page is asked for while writing: the words' first, unless it
/// is one of Pochical's invitations, which has a card of its own.
public func previewLink(_ text: String) -> String? {
  guard let link = firstLink(text), let url = URL(string: link), inviteCode(of: url) == nil
  else { return nil }
  return link
}
