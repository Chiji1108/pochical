import Foundation
import Nuke
import Testing

@testable import PochicalKit

#if canImport(UIKit)
  import UIKit
#else
  import AppKit
#endif

/// The pipeline the app draws its photos with, over `caches`.
private func pipeline(_ caches: PhotoCaches) -> ImagePipeline {
  ImagePipeline(delegate: caches) {
    $0.imageCache = caches.memory
    $0.dataCache = caches.disk
  }
}

/// A request for `photoID` of `shelf`, as a line draws it.
private func request(_ photoID: String, of shelf: PhotoShelf) -> ImageRequest {
  var request = ImageRequest(id: "\(shelf.key)/\(photoID)", data: { Data() })
  request.thumbnail = ImageRequest.ThumbnailOptions(maxPixelSize: 400)
  request.shelf = shelf
  return request
}

@Test func aGroupLeftLetsGoOfItsOwnPhotosAloneFromMemoryAndTheDisk() throws {
  let folder = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: folder) }
  let caches = PhotoCaches(in: folder)
  let pipeline = pipeline(caches)
  let shelves: [PhotoShelf] = [.group("g1"), .group("g2"), .invitation(code: "g1")]
  for shelf in shelves {
    pipeline.cache[request("p", of: shelf)] = ImageContainer(image: PlatformImage())
    pipeline.cache.storeCachedData(Data([1]), for: request("p", of: shelf))
  }

  caches.forget(.group("g1"))

  // Read as the disk holds them, past what it holds still to write.
  caches.disk?.flush()
  let kept = shelves.map { shelf in
    (
      pipeline.cache[request("p", of: shelf)] != nil,
      pipeline.cache.cachedData(for: request("p", of: shelf)) != nil
    )
  }
  #expect(kept.map(\.0) == [false, true, true])
  #expect(kept.map(\.1) == [false, true, true])
}

@Test func aPhotosFileBeginsWithItsShelfsKeyEscaped() {
  #expect(PhotoCaches.filename(for: "invites/c1/p?size=small") == "invites%2Fc1%2Fp%3Fsize%3Dsmall")
  #expect(PhotoCaches.filename(for: "") == nil)
}
