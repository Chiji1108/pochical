import Foundation
import Nuke
import PochicalDesign
import Synchronization

/// Where the app's image pipeline keeps the chats' photos, faces and links'
/// pictures (spec/chat.md, Photos): drawn in memory, and the photos as
/// fetched on the disk, each within its one limit, the least lately seen
/// let go first. What a request of a shelf's draws or fetches (its
/// `ImageRequest.shelf`) is kept as that shelf's, so a group left lets go
/// of its own alone (`forget(_:)`) and the other groups' stay.
public final class PhotoCaches: ImagePipeline.Delegate {
  /// Everything drawn.
  public let memory: ImageCache
  /// The photos as fetched, each file named by its key (`filename(for:)`),
  /// so a shelf's are found by their names; none where the disk keeps
  /// nothing.
  public let disk: DataCache?
  private let shelves = Mutex<[PhotoShelf: ShelfImages]>([:])

  /// The caches, the photos fetched kept in `folder`.
  public init(
    in folder: URL, memoryBytes: Int = Chat.photoMemoryBytes,
    diskBytes: Int = Chat.photoDiskBytes
  ) {
    memory = ImageCache(costLimit: memoryBytes)
    disk = try? DataCache(path: folder, filenameGenerator: Self.filename(for:))
    disk?.sizeLimit = diskBytes
  }

  /// What `shelf`'s requests draw: kept in `memory` beside the rest, and
  /// let go of with the shelf.
  public func images(of shelf: PhotoShelf) -> any ImageCaching {
    shelves.withLock { shelves in
      if let images = shelves[shelf] { return images }
      let images = ShelfImages(memory)
      shelves[shelf] = images
      return images
    }
  }

  public func imageCache(for request: ImageRequest, pipeline: ImagePipeline)
    -> (any ImageCaching)?
  {
    request.shelf.map(images(of:)) ?? memory
  }

  /// Lets go of everything `shelf`'s requests drew and fetched, as its
  /// group is left or ends. It waits on the disk, so off the main thread
  /// and any actor.
  public func forget(_ shelf: PhotoShelf) {
    let images = shelves.withLock { $0.removeValue(forKey: shelf) }
    images?.removeAll()
    guard let disk else { return }
    // Writes still on their way are on the disk first, to be found there.
    disk.flush()
    let prefix = Self.filename(for: "\(shelf.key)/") ?? ""
    let files =
      (try? FileManager.default.contentsOfDirectory(
        at: disk.path, includingPropertiesForKeys: nil)) ?? []
    for file in files.map(\.lastPathComponent) where file.hasPrefix(prefix) {
      if let key = file.removingPercentEncoding {
        disk.removeData(for: key)
      }
    }
  }

  /// Lets go of everything, as the account goes.
  public func removeAll() {
    shelves.withLock { $0 = [:] }
    memory.removeAll()
    disk?.removeAll()
  }

  /// A key's file: the key itself, every character but a letter or a digit
  /// escaped, so a shelf's keys' files begin with its own key's, and none
  /// is hidden (DataCache's own file begins with a dot).
  static func filename(for key: String) -> String? {
    key.isEmpty ? nil : key.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
  }
}

/// A shelf's images in the memory shared by all: each set kept by its key,
/// to let go of together. A key stays after memory has let go of its image,
/// one for each size drawn while the app runs.
private final class ShelfImages: ImageCaching {
  private let memory: ImageCache
  private let keys = Mutex<Set<ImageCacheKey>>([])

  init(_ memory: ImageCache) {
    self.memory = memory
  }

  subscript(key: ImageCacheKey) -> ImageContainer? {
    get { memory[key] }
    set {
      if newValue != nil {
        keys.withLock { _ = $0.insert(key) }
      }
      memory[key] = newValue
    }
  }

  func removeAll() {
    for key in keys.withLock({ $0 }) {
      memory[key] = nil
    }
  }
}

extension ImageRequest.UserInfoKey {
  fileprivate static let shelf: Self = "app.pochical.shelf"
}

extension ImageRequest {
  /// The shelf whose photo the request draws, kept and let go of as that
  /// shelf's (`PhotoCaches`); none for a picture of no group's.
  public var shelf: PhotoShelf? {
    get { userInfo[.shelf] as? PhotoShelf }
    set {
      if let newValue {
        userInfo[.shelf] = newValue
      } else {
        userInfo[.shelf] = nil
      }
    }
  }
}
