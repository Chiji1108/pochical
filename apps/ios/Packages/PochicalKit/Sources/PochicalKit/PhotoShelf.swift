import Foundation

/// Where photos are kept (写真の置き場), on the server and on the device,
/// each shelf apart from the others: a group's, the support chat's, the
/// user's own, or an invitation's faces, read by the code's holder before
/// joining.
public enum PhotoShelf: Hashable, Sendable {
  case group(String)
  case support
  /// The user's own: their usual photo, on the server for them alone
  /// (spec/sync-protocol.md, Profile), and a group's mark picked, before
  /// the group takes a copy.
  case mine
  case invitation(code: String)

  /// The shelf of a place's chats, by the id the device keeps them under
  /// (`ChatPlace.id`).
  public init(place placeID: String) {
    self = placeID == ChatPlace.supportID ? .support : .group(placeID)
  }

  /// The shelf's name on the device, apart from every other's: its folder,
  /// and its photos' keys in the image cache. A group's id is never one of
  /// the others'.
  public var key: String {
    switch self {
    case .group(let groupID): groupID
    case .support: ChatPlace.supportID
    case .mine: "me"
    case .invitation(let code): "invites/\(code)"
    }
  }

  /// Where `photoID` is on the server.
  func url(of photoID: String, server: URL) -> URL {
    switch self {
    case .group(let groupID): server.appending(path: "v1/groups/\(groupID)/photos/\(photoID)")
    case .support: server.appending(path: "v1/support/photos/\(photoID)")
    case .mine: server.appending(path: "v1/me/photos/\(photoID)")
    case .invitation(let code): server.appending(path: "v1/invites/\(code)/photos/\(photoID)")
    }
  }
}

extension ChatPlace {
  /// Where the place's chats keep their photos.
  public var shelf: PhotoShelf {
    switch self {
    case .group(let group): .group(group.id)
    case .support: .support
    }
  }
}
