import Foundation
import ImageIO
import PochicalDesign
import UniformTypeIdentifiers

/// A photo sent as a chat line (spec/chat.md, Photos): its id in the
/// group's photos, and its size, so the line keeps its place before the
/// photo arrives.
public struct LinePhoto: Hashable, Sendable, Codable, Identifiable {
  public let id: String
  public let width: Int
  public let height: Int

  public init(id: String, width: Int, height: Int) {
    self.id = id
    self.width = width
    self.height = height
  }
}

/// A photo shrunk to send: a JPEG no larger than `Chat.photoMaxEdge` on
/// its longer side, without the original's metadata (its location among
/// them).
public struct ShrunkPhoto: Hashable, Sendable {
  public let jpeg: Data
  public let width: Int
  public let height: Int
}

/// The chats' photos on the device: shrinking one to send, keeping the
/// sender's own until uploaded, uploading it, and fetching the group's as
/// they show.
public enum ChatPhotos {
  /// Shrinks a picked photo to send, turned upright, its longer side at
  /// most `maxEdge`, as JPEG at a quality that keeps it within
  /// `Chat.photoMaxBytes`; nil for what is not a photo the device can read.
  public static func shrink(_ data: Data, maxEdge: Int = Chat.photoMaxEdge) -> ShrunkPhoto? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let image = CGImageSourceCreateThumbnailAtIndex(
        source, 0,
        [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: maxEdge,
        ] as CFDictionary)
    else { return nil }
    for quality in [0.8, 0.6, 0.4] {
      let out = NSMutableData()
      guard
        let destination = CGImageDestinationCreateWithData(
          out, UTType.jpeg.identifier as CFString, 1, nil)
      else { return nil }
      // Only the pixels: no EXIF, GPS or other metadata goes along.
      CGImageDestinationAddImage(
        destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
      guard CGImageDestinationFinalize(destination) else { return nil }
      if out.length <= Chat.photoMaxBytes {
        return ShrunkPhoto(jpeg: out as Data, width: image.width, height: image.height)
      }
    }
    return nil
  }

  // MARK: Files

  /// Where a group's photo is kept on the device once seen or sent.
  public static func cached(_ photoID: String, in groupID: String) -> URL {
    directory(.cachesDirectory, "ChatPhotos/\(groupID)").appending(path: "\(photoID).jpg")
  }

  /// Where the member's own photo waits until uploaded, out of the caches
  /// the system may empty.
  static func pending(_ photoID: String, in groupID: String) -> URL {
    directory(.applicationSupportDirectory, "PendingPhotos/\(groupID)")
      .appending(path: "\(photoID).jpg")
  }

  /// Keeps the member's own photo to send: until uploaded, and to show.
  public static func keep(_ jpeg: Data, as photoID: String, in groupID: String) throws {
    try jpeg.write(to: pending(photoID, in: groupID), options: .atomic)
    try jpeg.write(to: cached(photoID, in: groupID), options: .atomic)
  }

  /// Keeps a photo picked to send later among the device's caches, so one
  /// never sent leaves nothing for long.
  static func hold(_ jpeg: Data, as photoID: String, in groupID: String) throws {
    try jpeg.write(to: cached(photoID, in: groupID), options: .atomic)
  }

  /// Takes a photo off the device, as when its line is taken back.
  public static func forget(_ photoID: String, in groupID: String) {
    try? FileManager.default.removeItem(at: cached(photoID, in: groupID))
    try? FileManager.default.removeItem(at: pending(photoID, in: groupID))
  }

  /// Every photo kept on the device, to send or to show, gone.
  static func eraseAll() {
    for (base, path) in [
      (FileManager.SearchPathDirectory.applicationSupportDirectory, "PendingPhotos"),
      (.cachesDirectory, "ChatPhotos"),
    ] {
      let url = FileManager.default.urls(for: base, in: .userDomainMask)[0].appending(path: path)
      try? FileManager.default.removeItem(at: url)
    }
  }

  /// The photo's bytes held on the device, if any.
  public static func held(_ photoID: String, in groupID: String) -> Data? {
    (try? Data(contentsOf: cached(photoID, in: groupID)))
      ?? (try? Data(contentsOf: pending(photoID, in: groupID)))
  }

  private static func directory(_ base: FileManager.SearchPathDirectory, _ path: String) -> URL {
    let url = FileManager.default.urls(for: base, in: .userDomainMask)[0].appending(path: path)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  // MARK: The server

  /// Why a photo could not be uploaded.
  enum UploadError: Error {
    /// The photo is no longer on the device; its line cannot go.
    case gone
    /// The server answered with this status.
    case refused(Int)
  }

  /// Uploads the member's own photo to the group's photos, once; a retry
  /// stores it again.
  static func upload(
    _ photoID: String, in groupID: String, account: Account, server: URL = Server.url,
    send: Account.Send = { try await URLSession.shared.data(for: $0) }
  ) async throws {
    guard let jpeg = try? Data(contentsOf: pending(photoID, in: groupID)) else {
      // Sent before, from another socket, or never kept.
      if FileManager.default.fileExists(atPath: cached(photoID, in: groupID).path()) {
        return
      }
      throw UploadError.gone
    }
    try await put(jpeg, as: photoID, in: groupID, account: account, server: server, send: send)
    try? FileManager.default.removeItem(at: pending(photoID, in: groupID))
  }

  /// Uploads a photo held to send later (`hold`); `gone` once the device
  /// has let it go.
  static func uploadHeld(_ photoID: String, in groupID: String, account: Account) async throws {
    guard let jpeg = try? Data(contentsOf: cached(photoID, in: groupID)) else {
      throw UploadError.gone
    }
    try await put(jpeg, as: photoID, in: groupID, account: account, server: Server.url) {
      try await URLSession.shared.data(for: $0)
    }
  }

  private static func put(
    _ jpeg: Data, as photoID: String, in groupID: String, account: Account, server: URL,
    send: Account.Send
  ) async throws {
    var request = URLRequest(url: photoURL(photoID, in: groupID, server: server))
    request.httpMethod = "PUT"
    request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(try await account.token())", forHTTPHeaderField: "Authorization")
    request.httpBody = jpeg
    let (_, response) = try await send(request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 204 else { throw UploadError.refused(status) }
  }

  /// The group's photo, from the device or else the server, kept once
  /// fetched.
  public static func fetch(
    _ photoID: String, in groupID: String, account: Account, server: URL = Server.url
  ) async throws -> Data {
    if let held = held(photoID, in: groupID) {
      return held
    }
    var request = URLRequest(url: photoURL(photoID, in: groupID, server: server))
    request.setValue("Bearer \(try await account.token())", forHTTPHeaderField: "Authorization")
    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else { throw UploadError.refused(status) }
    try? data.write(to: cached(photoID, in: groupID), options: .atomic)
    return data
  }

  /// A link preview's picture, from the device or else the server, kept
  /// once fetched.
  static func fetchPreviewImage(
    _ imageID: String, account: Account, server: URL = Server.url
  ) async throws -> Data {
    let kept = directory(.cachesDirectory, "LinkPreviews").appending(path: imageID)
    if let held = try? Data(contentsOf: kept) {
      return held
    }
    var request = URLRequest(url: server.appending(path: "v1/previews/\(imageID)"))
    request.setValue("Bearer \(try await account.token())", forHTTPHeaderField: "Authorization")
    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else { throw UploadError.refused(status) }
    try? data.write(to: kept, options: .atomic)
    return data
  }

  /// Where photos in the chat with Pochical's people are kept, in place of
  /// a group's id: on the device beside the groups', and on the server
  /// under the user's own support photos. A group's id is never this.
  public static let support = "support"

  /// Where the user's own photos are kept, in place of a group's id: their
  /// usual photo, on the server for them alone (spec/sync-protocol.md,
  /// Profile). A group's id is never this.
  public static let mine = "me"

  /// Where the faces on an invitation's join screen are kept, in place of
  /// a group's id: read by the code's holder before joining.
  public static func invitation(_ code: String) -> String {
    "invites/\(code)"
  }

  /// Keeps a photo of the user's and sends it up at once, to the group's
  /// photos or their own (`mine`), for a profile to name it after.
  public static func send(
    _ jpeg: Data, as photoID: String, in groupID: String, account: Account
  ) async throws {
    try keep(jpeg, as: photoID, in: groupID)
    try await upload(photoID, in: groupID, account: account)
  }

  private static func photoURL(_ photoID: String, in groupID: String, server: URL) -> URL {
    switch groupID {
    case support: server.appending(path: "v1/support/photos/\(photoID)")
    case mine: server.appending(path: "v1/me/photos/\(photoID)")
    case let shelf where shelf.hasPrefix("invites/"):
      server.appending(path: "v1/\(shelf)/photos/\(photoID)")
    default: server.appending(path: "v1/groups/\(groupID)/photos/\(photoID)")
    }
  }
}
