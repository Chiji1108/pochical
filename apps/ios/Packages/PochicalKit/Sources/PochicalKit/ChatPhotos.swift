import Foundation
import ImageIO
import PochicalDesign
import PochicalProto
import UniformTypeIdentifiers

/// A photo sent as a chat line (spec/chat.md, Photos): its id in the
/// group's photos, and its size and ThumbHash, so the line keeps its place
/// before the photo arrives, a blur of it there meanwhile.
public struct LinePhoto: Hashable, Sendable, Codable, Identifiable {
  public let id: String
  public let width: Int
  public let height: Int
  /// None for a photo sent without one, which shows its grey instead.
  public let thumbHash: Data?

  public init(id: String, width: Int, height: Int, thumbHash: Data? = nil) {
    self.id = id
    self.width = width
    self.height = height
    self.thumbHash = thumbHash
  }

  /// The photo as the wire carries it.
  init(_ wire: Pochical_V1_ChatPhoto) {
    self.init(
      id: wire.id, width: Int(wire.width), height: Int(wire.height),
      thumbHash: wire.thumbHash.isEmpty ? nil : wire.thumbHash)
  }

  /// The photo to send.
  public var wire: Pochical_V1_ChatPhoto {
    var wire = Pochical_V1_ChatPhoto()
    wire.id = id
    wire.width = UInt32(width)
    wire.height = UInt32(height)
    wire.thumbHash = thumbHash ?? Data()
    return wire
  }
}

/// A photo shrunk to send: a JPEG no larger than `Chat.photoMaxEdge` on
/// its longer side, without the original's metadata (its location among
/// them), and its ThumbHash.
public struct ShrunkPhoto: Hashable, Sendable {
  public let jpeg: Data
  public let width: Int
  public let height: Int
  public let thumbHash: Data?

  /// The photo as its line sends it, by the id it is kept under.
  public func line(_ id: String) -> LinePhoto {
    LinePhoto(id: id, width: width, height: height, thumbHash: thumbHash)
  }
}

/// The chats' photos on the device: shrinking one to send, keeping the
/// sender's own until uploaded, uploading it, and fetching the group's as
/// they show.
public enum ChatPhotos {
  /// Shrinks a picked photo to send, turned upright, its longer side at
  /// most `maxEdge`, as JPEG at a quality that keeps it within
  /// `Chat.photoMaxBytes`; nil for what is not a photo the device can read.
  public static func shrink(_ data: Data, maxEdge: Int = Chat.photoMaxEdge) -> ShrunkPhoto? {
    guard let image = upright(data, maxEdge: maxEdge), let jpeg = jpeg(of: image) else {
      return nil
    }
    return ShrunkPhoto(
      jpeg: jpeg, width: image.width, height: image.height, thumbHash: ThumbHash.of(image))
  }

  /// The photo's small version to send beside it, its longer side at
  /// `Chat.photoSmallEdge`, for the chat's lines and quotes to fetch in its
  /// place; nil when the photo is no larger than that already.
  public static func small(_ jpeg: Data) -> Data? {
    guard let source = CGImageSourceCreateWithData(jpeg as CFData, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int,
      max(width, height) > Chat.photoSmallEdge
    else { return nil }
    return upright(jpeg, maxEdge: Chat.photoSmallEdge).flatMap { Self.jpeg(of: $0) }
  }

  /// A photo's bytes read turned upright, its longer side at most
  /// `maxEdge`, straight at that size rather than decoded whole and
  /// shrunk; nil for what is not a photo the device can read. Every photo
  /// shrunk on the device is read so: to send, its small version, and the
  /// chat's thumbnails.
  public static func upright(_ data: Data, maxEdge: Int) -> CGImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    return CGImageSourceCreateThumbnailAtIndex(
      source, 0,
      [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: maxEdge,
      ] as CFDictionary)
  }

  /// An image as JPEG at a quality that keeps it within
  /// `Chat.photoMaxBytes`, with only its pixels: no EXIF, GPS or other
  /// metadata goes along.
  private static func jpeg(of image: CGImage) -> Data? {
    for quality in [0.8, 0.6, 0.4] {
      let out = NSMutableData()
      guard
        let destination = CGImageDestinationCreateWithData(
          out, UTType.jpeg.identifier as CFString, 1, nil)
      else { return nil }
      CGImageDestinationAddImage(
        destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
      guard CGImageDestinationFinalize(destination) else { return nil }
      if out.length <= Chat.photoMaxBytes {
        return out as Data
      }
    }
    return nil
  }

  // MARK: Files

  /// Where a group's photo is kept on the device once seen or sent: among
  /// the App Group's caches, so the widgets show the faces too.
  static func cached(_ photoID: String, in groupID: String) -> URL {
    caches("ChatPhotos/\(groupID)").appending(path: "\(photoID).jpg")
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

  /// Told as a photo is taken off the device, with its `photoID` and
  /// `groupID` in the user info, for the app's image cache to let go of it
  /// too.
  public static let forgotten = Notification.Name("ChatPhotos.forgotten")
  /// Told as every photo is taken off the device.
  public static let erased = Notification.Name("ChatPhotos.erased")

  /// Takes a photo off the device, as when its line is taken back.
  public static func forget(_ photoID: String, in groupID: String) {
    try? FileManager.default.removeItem(at: cached(photoID, in: groupID))
    try? FileManager.default.removeItem(at: pending(photoID, in: groupID))
    NotificationCenter.default.post(
      name: forgotten, object: nil, userInfo: ["photoID": photoID, "groupID": groupID])
  }

  /// Every photo kept on the device, to send or to show, and links'
  /// pictures, gone.
  static func eraseAll() {
    try? FileManager.default.removeItem(
      at: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appending(path: "PendingPhotos"))
    try? FileManager.default.removeItem(at: caches("ChatPhotos"))
    try? FileManager.default.removeItem(at: previews)
    NotificationCenter.default.post(name: erased, object: nil)
  }

  /// The photo's bytes held on the device, if any.
  public static func held(_ photoID: String, in groupID: String) -> Data? {
    heldFile(photoID, in: groupID).flatMap { try? Data(contentsOf: $0) }
  }

  /// Where the photo is held on the device, if it is: the member's own,
  /// sent or waiting to go, and the faces kept for the widgets.
  public static func heldFile(_ photoID: String, in groupID: String) -> URL? {
    [cached(photoID, in: groupID), pending(photoID, in: groupID)].first {
      FileManager.default.fileExists(atPath: $0.path())
    }
  }

  /// A folder among the App Group's caches, the app's own without one.
  private static func caches(_ path: String) -> URL {
    let shared = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    guard let shared else { return directory(.cachesDirectory, path) }
    let url = shared.appending(path: "Library/Caches/\(path)")
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
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
  /// stores it again. A chat's photo goes with its small version, first,
  /// so the lines find it as soon as they are sent; the user's own photos
  /// (`mine`) are small already. How far it has gone is told in
  /// `PhotoUploads`, where the chat line `opID` it goes with may be
  /// stopped: then it throws as cancelled. Once the line's photos are all
  /// up, the caller asks `PhotoUploads.send` whether the line still goes.
  /// `send` stands in for the network, telling nothing of how far.
  static func upload(
    _ photoID: String, of opID: String? = nil, in groupID: String,
    as credentials: Credentials, server: URL = Server.url, send: Account.Send? = nil
  ) async throws {
    // Uploaded before, from another socket, it goes up again from the copy
    // kept to show: the group lets a photo no line carries go once its
    // uploader has uploaded nothing for a while, so a line sent again,
    // or long after, finds it there.
    guard
      let jpeg = (try? Data(contentsOf: pending(photoID, in: groupID)))
        ?? (try? Data(contentsOf: cached(photoID, in: groupID)))
    else { throw UploadError.gone }
    let small = groupID == mine ? nil : small(jpeg)
    // Told as one, the small version's bytes first.
    let total = Double((small?.count ?? 0) + jpeg.count)
    let attempt = UUID()
    let going = Task {
      if let small {
        try await put(
          small, as: photoID, in: groupID, small: true, as: credentials, server: server,
          send: send
        ) { sent in
          Task { @MainActor in
            PhotoUploads.shared.moved(photoID, try: attempt, to: Double(sent) / total)
          }
        }
      }
      let before = small?.count ?? 0
      try await put(
        jpeg, as: photoID, in: groupID, as: credentials, server: server, send: send
      ) {
        sent in
        Task { @MainActor in
          PhotoUploads.shared.moved(
            photoID, try: attempt, to: Double(before + Int(sent)) / total)
        }
      }
    }
    await PhotoUploads.shared.began(photoID, of: opID, try: attempt) { going.cancel() }
    do {
      try await withTaskCancellationHandler {
        try await going.value
      } onCancel: {
        going.cancel()
      }
      await PhotoUploads.shared.finished(photoID, of: opID)
    } catch {
      await PhotoUploads.shared.ended(photoID, of: opID)
      throw error
    }
    try? FileManager.default.removeItem(at: pending(photoID, in: groupID))
  }

  /// Uploads a photo held to send later (`hold`); `gone` once the device
  /// has let it go.
  static func uploadHeld(_ photoID: String, in groupID: String, as credentials: Credentials)
    async throws
  {
    guard let jpeg = try? Data(contentsOf: cached(photoID, in: groupID)) else {
      throw UploadError.gone
    }
    try await put(
      jpeg, as: photoID, in: groupID, as: credentials, server: Server.url, send: nil)
  }

  /// Puts a photo's bytes on the server, through `send` when given, else
  /// telling `onSent` how many bytes have gone.
  private static func put(
    _ jpeg: Data, as photoID: String, in groupID: String, small: Bool = false,
    as credentials: Credentials, server: URL, send: Account.Send?,
    onSent: @escaping @Sendable (Int64) -> Void = { _ in }
  ) async throws {
    var request = URLRequest(url: photoURL(photoID, in: groupID, small: small, server: server))
    request.httpMethod = "PUT"
    request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization")
    let response: URLResponse
    if let send {
      request.httpBody = jpeg
      (_, response) = try await send(request)
    } else {
      (_, response) = try await credentials.content.upload(
        for: request, from: jpeg, delegate: UploadProgress(onSent: onSent))
    }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 204 else { throw UploadError.refused(status) }
  }

  /// The group's photo, from the device or else the server. `small` asks
  /// for its small version, as the chat's lines and quotes show it: the
  /// photo itself when the device holds it, and when it has none. Kept
  /// once fetched (`keep`) for the faces the widgets show; the chat's
  /// photos are kept by the app's image cache instead, within its limit.
  /// One that comes after the account changed is dropped, kept nowhere.
  static func fetch(
    _ photoID: String, in groupID: String, small: Bool = false, keep: Bool = true,
    as credentials: Credentials, server: URL = Server.url
  ) async throws -> Data {
    if let held = held(photoID, in: groupID) {
      return held
    }
    var request = URLRequest(url: photoURL(photoID, in: groupID, small: small, server: server))
    request.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization")
    let (data, response) = try await credentials.content.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else { throw UploadError.refused(status) }
    return try credentials.whileCurrent {
      if keep, !small {
        try? data.write(to: cached(photoID, in: groupID), options: .atomic)
      }
      return data
    }
  }

  /// A link preview's picture, from the device or else the server, kept
  /// once fetched, as `fetch` keeps a photo.
  static func fetchPreviewImage(
    _ imageID: String, as credentials: Credentials, server: URL = Server.url
  ) async throws -> Data {
    let kept = previews.appending(path: imageID)
    if let held = try? Data(contentsOf: kept) {
      return held
    }
    var request = URLRequest(url: server.appending(path: "v1/previews/\(imageID)"))
    request.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization")
    let (data, response) = try await credentials.content.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else { throw UploadError.refused(status) }
    return try credentials.whileCurrent {
      try? data.write(to: kept, options: .atomic)
      return data
    }
  }

  /// Where links' pictures are kept.
  private static var previews: URL {
    directory(.cachesDirectory, "LinkPreviews")
  }

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
  static func send(
    _ jpeg: Data, as photoID: String, in groupID: String, as credentials: Credentials
  ) async throws {
    try keep(jpeg, as: photoID, in: groupID)
    try await upload(photoID, in: groupID, as: credentials)
  }

  private static func photoURL(
    _ photoID: String, in groupID: String, small: Bool = false, server: URL
  ) -> URL {
    let url = photoURL(photoID, in: groupID, server: server)
    return small ? url.appending(queryItems: [URLQueryItem(name: "size", value: "small")]) : url
  }

  private static func photoURL(_ photoID: String, in groupID: String, server: URL) -> URL {
    switch groupID {
    case ChatPlace.supportID: server.appending(path: "v1/support/photos/\(photoID)")
    case mine: server.appending(path: "v1/me/photos/\(photoID)")
    case let shelf where shelf.hasPrefix("invites/"):
      server.appending(path: "v1/\(shelf)/photos/\(photoID)")
    default: server.appending(path: "v1/groups/\(groupID)/photos/\(photoID)")
    }
  }
}
