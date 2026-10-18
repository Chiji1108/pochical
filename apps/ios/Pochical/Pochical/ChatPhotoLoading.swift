import Nuke
import PochicalDesign
import PochicalKit
import UIKit

/// How the chat's photos come (spec/chat.md, Photos), by Nuke, as Signal
/// and Telegram load theirs: fetched once however many lines, quotes and
/// the photo opened large ask at once, read straight at the size they show,
/// kept drawn in memory and as fetched on the disk, each within its limit,
/// the least lately seen let go first.
enum ChatPhotoLoading {
  /// The photos drawn at their size, `Chat.photoMemoryBytes` at most, and
  /// the blurs their ThumbHashes draw.
  static let memory = ImageCache(costLimit: Chat.photoMemoryBytes)

  static let pipeline: ImagePipeline = {
    var configuration = ImagePipeline.Configuration()
    configuration.imageCache = memory
    // Among the app's own caches, which the system may empty: all fetched
    // again as they show.
    let disk = try? DataCache(name: "app.pochical.chat-photos")
    disk?.sizeLimit = Chat.photoDiskBytes
    configuration.dataCache = disk
    return ImagePipeline(configuration: configuration)
  }()

  /// `photo` as a line or a quote shows it: its small version, read at
  /// most `pixels` on its longer side; the photo itself, whole, with none.
  /// The member's own photos, held on the device, are read from there and
  /// not kept twice (`whole` held: as it is sent).
  static func request(
    _ photo: LinePhoto, in groupID: String, pixels: Int?, calls: GroupCalls,
    priority: ImageRequest.Priority = .normal, held: Bool = false
  ) -> ImageRequest {
    let small = pixels != nil
    var request = ImageRequest(
      id: key(photo.id, in: groupID, small: small),
      data: { try await calls.photo(photo.id, in: groupID, small: small, keep: false) },
      priority: priority,
      options: held ? [.disableDiskCache] : [])
    if let pixels {
      request.thumbnail = ImageRequest.ThumbnailOptions(maxPixelSize: Float(pixels))
    }
    return request
  }

  /// What a photo is kept under, small or whole.
  private static func key(_ photoID: String, in groupID: String, small: Bool) -> String {
    "\(groupID)/\(photoID)\(small ? "?size=small" : "")"
  }

  /// `photo` as a line shows it in its box at `scale`.
  static func lineRequest(
    _ photo: LinePhoto, in groupID: String, scale: CGFloat, calls: GroupCalls, held: Bool = false
  ) -> ImageRequest? {
    pixels(of: photo, shown: PhotoBox.size(of: photo), scale: scale).map {
      request(photo, in: groupID, pixels: $0, calls: calls, held: held)
    }
  }

  /// Lets go of the photos the device lets go of (`ChatPhotos.forget`,
  /// `ChatPhotos.eraseAll`): a line taken back, every photo with the
  /// account. What memory holds of one taken back goes as it is let go,
  /// its line no longer drawn.
  static func followErasing() {
    let center = NotificationCenter.default
    center.addObserver(forName: ChatPhotos.forgotten, object: nil, queue: nil) { note in
      guard let photoID = note.userInfo?["photoID"] as? String,
        let groupID = note.userInfo?["groupID"] as? String
      else { return }
      for small in [true, false] {
        pipeline.configuration.dataCache?.removeData(
          for: key(photoID, in: groupID, small: small))
      }
    }
    center.addObserver(forName: ChatPhotos.erased, object: nil, queue: nil) { _ in
      pipeline.cache.removeAll()
    }
  }

  /// The longer side, in pixels, `photo` is read at to fill `shown`.
  static func pixels(of photo: LinePhoto, shown: CGSize, scale: CGFloat) -> Int? {
    guard photo.width > 0, photo.height > 0 else { return nil }
    let width = CGFloat(photo.width)
    let height = CGFloat(photo.height)
    let scale = min(max(shown.width / width, shown.height / height) * scale, 1)
    return Int((max(width, height) * scale).rounded(.up))
  }

  /// What the chat drew of `photo` and holds still, shown at once as it
  /// opens large while the photo itself comes: the line's, else its blur.
  static func held(_ photo: LinePhoto, in groupID: String, scale: CGFloat, calls: GroupCalls)
    -> UIImage?
  {
    let drawn = lineRequest(photo, in: groupID, scale: scale, calls: calls).flatMap {
      pipeline.cache[$0]?.image
    }
    return drawn ?? blur(of: photo)
  }

  /// The blur `photo`'s ThumbHash draws, kept beside the photos.
  static func blur(of photo: LinePhoto) -> UIImage? {
    guard let hash = photo.thumbHash else { return nil }
    let key = ImageCacheKey(key: "blur/\(photo.id)")
    if let kept = memory[key] {
      return kept.image
    }
    guard let drawn = ThumbHash.image(hash) else { return nil }
    let image = UIImage(cgImage: drawn)
    memory[key] = ImageContainer(image: image)
    return image
  }

  /// The photo itself, as fetched: to save or share.
  static func whole(_ photo: LinePhoto, in groupID: String, calls: GroupCalls) async -> Data? {
    let held = ChatPhotos.heldFile(photo.id, in: groupID) != nil
    return try? await pipeline.data(
      for: request(photo, in: groupID, pixels: nil, calls: calls, held: held)
    ).0
  }
}

/// The box a photo fits in, and how far from square it may be before its
/// ends are cut, as LINE crops a panorama in the chat (/design's
/// photoSize).
enum PhotoBox {
  static let width: CGFloat = 220
  static let height: CGFloat = 260
  static let widest: CGFloat = 2
  static let tallest: CGFloat = 0.5

  /// The size a photo takes in the chat.
  static func size(of photo: LinePhoto) -> CGSize {
    let aspect = min(
      max(CGFloat(photo.width) / CGFloat(max(photo.height, 1)), tallest), widest)
    let width = min(Self.width, Self.height * aspect)
    return CGSize(width: width, height: width / aspect)
  }
}

/// Fetches ahead the photos of the lines near those in sight
/// (`Chat.photoPrefetchScreens`), drawn as their lines will draw them, and
/// lets go of those scrolled away, as Signal and Telegram fetch ahead what
/// is about to come into sight.
@MainActor final class PhotoPrefetch {
  private let prefetcher = ImagePrefetcher(pipeline: ChatPhotoLoading.pipeline)
  private var near: [String: ImageRequest] = [:]

  /// The photos near those in sight, in `groupID`'s chat, are now
  /// `photos`: each fetched as its line draws it.
  func near(_ photos: [LinePhoto], in groupID: String, scale: CGFloat, calls: GroupCalls) {
    var requests: [String: ImageRequest] = [:]
    for photo in photos {
      if let request = ChatPhotoLoading.lineRequest(
        photo, in: groupID, scale: scale, calls: calls,
        held: ChatPhotos.heldFile(photo.id, in: groupID) != nil)
      {
        requests[photo.id] = request
      }
    }
    near(requests)
  }

  /// The photos about to be swiped to opened large, in `groupID`'s chat,
  /// are now `photos`: each fetched whole, as it opens.
  func whole(_ photos: [LinePhoto], in groupID: String, calls: GroupCalls) {
    var requests: [String: ImageRequest] = [:]
    for photo in photos {
      requests[photo.id] = ChatPhotoLoading.request(
        photo, in: groupID, pixels: nil, calls: calls,
        held: ChatPhotos.heldFile(photo.id, in: groupID) != nil)
    }
    near(requests)
  }

  private func near(_ requests: [String: ImageRequest]) {
    let gone = near.filter { requests[$0.key] == nil }.map(\.value)
    let new = requests.filter { near[$0.key] == nil }.map(\.value)
    near = requests
    if !gone.isEmpty { prefetcher.stopPrefetching(with: gone) }
    if !new.isEmpty { prefetcher.startPrefetching(with: new) }
  }

  func stop() {
    near = [:]
    prefetcher.stopPrefetching()
  }
}
