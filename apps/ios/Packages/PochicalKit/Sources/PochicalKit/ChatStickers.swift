import Accelerate
import Foundation
import GRDB
import ImageIO
import PochicalDesign
import PochicalProto
import SQLiteData
import UniformTypeIdentifiers
import libwebp

/// A sticker sent as a chat line (spec/chat.md, Stickers): its id in the
/// group's photos, kept and fetched as a photo is, and its size, so the
/// line keeps its place before it arrives.
public struct LineSticker: Hashable, Sendable, Codable, Identifiable {
  public let id: String
  public let width: Int
  public let height: Int

  public init(id: String, width: Int, height: Int) {
    self.id = id
    self.width = width
    self.height = height
  }

  /// The sticker as the wire carries it.
  init(_ wire: Pochical_V1_ChatSticker) {
    self.init(id: wire.id, width: Int(wire.width), height: Int(wire.height))
  }

  /// The sticker to send.
  public var wire: Pochical_V1_ChatSticker {
    var wire = Pochical_V1_ChatSticker()
    wire.id = id
    wire.width = UInt32(width)
    wire.height = UInt32(height)
    return wire
  }

  /// The sticker as one of the group's photos, which it is kept and
  /// fetched as: with no ThumbHash.
  public var photo: LinePhoto {
    LinePhoto(id: id, width: width, height: height)
  }
}

/// A sticker written to send: a WebP, still or moving, its longer side at
/// most `Chat.stickerMaxEdge`, within `Chat.stickerMaxBytes`, made from
/// its pixels and its frames' times alone.
public struct ShrunkSticker: Hashable, Sendable {
  public let webp: Data
  public let width: Int
  public let height: Int
}

/// A sticker as the keyboard gave it, kept to show while it is written to
/// send (`ChatStickers.write`), at the size it is sent at: its line goes at
/// once, as a photo's does, and the writing, which takes a moving one a
/// while, is done on its way up.
public struct PastedSticker: Hashable, Sendable {
  public let data: Data
  public let width: Int
  public let height: Int

  /// The sticker as its line sends it, by the id it is kept under.
  public func line(_ id: String) -> LineSticker {
    LineSticker(id: id, width: width, height: height)
  }
}

/// Stickers from the keyboard: telling one pasted from a photo, and
/// writing it to send.
public enum ChatStickers {
  /// The types the system marks a sticker with on the pasteboard, a
  /// sticker from a photo, a Memoji, a Genmoji or a sticker app's alike.
  static let marks: Set<String> = ["com.apple.sticker", "com.apple.png-sticker"]

  /// What a sticker is read from, in turn: its moving HEIF sequence,
  /// taken only when it has more than one frame, else its PNG.
  private static let sources = ["public.heics", "com.apple.png-sticker", UTType.png.identifier]

  /// Whether what was pasted is a sticker, not a photo.
  public static func isSticker(_ item: NSItemProvider) -> Bool {
    item.registeredTypeIdentifiers.contains(where: marks.contains)
  }

  /// The pasted sticker, kept as given to write later, and the size it is
  /// sent at; nil when none of what it holds can be read. Taken on the
  /// caller's actor, which holds the pasteboard's item.
  nonisolated(nonsending) public static func read(_ item: NSItemProvider) async -> PastedSticker? {
    for type in sources where item.registeredTypeIdentifiers.contains(type) {
      guard let data = await data(of: type, in: item),
        let sticker = await pasted(data, moving: type == "public.heics")
      else { continue }
      return sticker
    }
    return nil
  }

  /// The sticker in `data`, at the size its first frame is written at
  /// (`webp`); nil when it cannot be read, or holds one frame where it is
  /// to move. Off the caller's actor, as reading a frame takes a moment.
  @concurrent
  private static func pasted(_ data: Data, moving: Bool) async -> PastedSticker? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      !moving || CGImageSourceGetCount(source) > 1,
      let first = frame(0, of: source, maxEdge: Chat.stickerMaxEdge)
    else { return nil }
    return PastedSticker(data: data, width: first.width, height: first.height)
  }

  /// Writes the sticker `photoID` held to send as WebP, in its place, once
  /// (`written`). Throws as gone, the line not sent, when it cannot be.
  static func write(_ photoID: String, in shelf: PhotoShelf) async throws {
    guard let held = ChatPhotos.held(photoID, in: shelf) else {
      throw ChatPhotos.UploadError.gone
    }
    if let webp = try await written(held) {
      try ChatPhotos.keep(webp, as: photoID, in: shelf)
    }
  }

  /// A sticker held to send, as pasted, written as WebP; nil when what is
  /// held is WebP already, written before. Throws as gone when it cannot
  /// be written.
  static func written(_ held: Data) async throws -> Data? {
    guard !isWebP(held) else { return nil }
    guard let sticker = await shrink(held) else { throw ChatPhotos.UploadError.gone }
    return sticker.webp
  }

  private static func isWebP(_ data: Data) -> Bool {
    data.prefix(4) == Data("RIFF".utf8) && data.dropFirst(8).prefix(4) == Data("WEBP".utf8)
  }

  nonisolated(nonsending) private static func data(of type: String, in item: NSItemProvider)
    async -> Data?
  {
    await withCheckedContinuation { done in
      _ = item.loadDataRepresentation(forTypeIdentifier: type) { data, _ in
        done.resume(returning: data)
      }
    }
  }

  /// A sticker's image, still or moving, written as WebP to send: its
  /// longer side shrunk to `maxEdge`, its see-through parts kept, moving
  /// as its frames' times say and looping for ever, whatever it says, as
  /// every sticker is played (spec/chat.md, Stickers). One moving
  /// past `maxBytes` goes as its first frame, still; nil for what the
  /// device cannot read, or a still one past `maxBytes`. Off the caller's
  /// actor, as writing a moving one takes a while.
  @concurrent
  public static func shrink(
    _ data: Data, maxEdge: Int = Chat.stickerMaxEdge, maxBytes: Int = Chat.stickerMaxBytes
  ) async -> ShrunkSticker? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    let count = CGImageSourceGetCount(source)
    if count > 1, let moving = webp(of: source, frames: count, maxEdge: maxEdge),
      moving.webp.count <= maxBytes
    {
      return moving
    }
    guard let still = webp(of: source, frames: 1, maxEdge: maxEdge), still.webp.count <= maxBytes
    else { return nil }
    return still
  }

  /// The source's first `frames` frames as one WebP, lossy with its
  /// see-through parts, at the first frame's size, each frame read and
  /// written in turn rather than all held at once. A single frame is
  /// written still.
  private static func webp(of source: CGImageSource, frames: Int, maxEdge: Int) -> ShrunkSticker?
  {
    guard let first = frame(0, of: source, maxEdge: maxEdge) else { return nil }
    let width = first.width
    let height = first.height
    var options = WebPAnimEncoderOptions()
    guard WebPAnimEncoderOptionsInit(&options) != 0 else { return nil }
    // For ever.
    options.anim_params.loop_count = 0
    var config = WebPConfig()
    guard WebPConfigInit(&config) != 0 else { return nil }
    config.quality = 80
    guard let encoder = WebPAnimEncoderNew(Int32(width), Int32(height), &options) else {
      return nil
    }
    defer { WebPAnimEncoderDelete(encoder) }
    var atMs = 0
    for index in 0..<frames {
      guard let image = index == 0 ? first : frame(index, of: source, maxEdge: maxEdge),
        var pixels = rgba(image, width: width, height: height)
      else { return nil }
      var picture = WebPPicture()
      guard WebPPictureInit(&picture) != 0 else { return nil }
      picture.use_argb = 1
      picture.width = Int32(width)
      picture.height = Int32(height)
      defer { WebPPictureFree(&picture) }
      let added = pixels.withUnsafeMutableBytes { bytes in
        WebPPictureImportRGBA(
          &picture, bytes.baseAddress?.assumingMemoryBound(to: UInt8.self), Int32(width * 4))
          != 0 && WebPAnimEncoderAdd(encoder, &picture, Int32(atMs), &config) != 0
      }
      guard added else { return nil }
      atMs += delayMs(of: index, in: source)
    }
    // The last frame's end.
    guard WebPAnimEncoderAdd(encoder, nil, Int32(atMs), nil) != 0 else { return nil }
    var out = WebPData()
    WebPDataInit(&out)
    defer { WebPDataClear(&out) }
    guard WebPAnimEncoderAssemble(encoder, &out) != 0, let bytes = out.bytes else { return nil }
    return ShrunkSticker(webp: Data(bytes: bytes, count: out.size), width: width, height: height)
  }

  /// A frame read straight at most `maxEdge` on its longer side.
  private static func frame(_ index: Int, of source: CGImageSource, maxEdge: Int) -> CGImage? {
    CGImageSourceCreateThumbnailAtIndex(
      source, index,
      [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: maxEdge,
      ] as CFDictionary)
  }

  /// A frame's pixels as libwebp takes them: RGBA, 8 bits each, the
  /// colors not multiplied by their alpha, drawn at the sticker's size.
  private static func rgba(_ image: CGImage, width: Int, height: Int) -> [UInt8]? {
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    let drawn = pixels.withUnsafeMutableBytes { bytes -> Bool in
      guard
        let context = CGContext(
          data: bytes.baseAddress, width: width, height: height, bitsPerComponent: 8,
          bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
      else { return false }
      context.interpolationQuality = .high
      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      // A bitmap context holds its colors multiplied by alpha.
      var buffer = vImage_Buffer(
        data: bytes.baseAddress, height: vImagePixelCount(height),
        width: vImagePixelCount(width), rowBytes: width * 4)
      return vImageUnpremultiplyData_RGBA8888(&buffer, &buffer, vImage_Flags(kvImageNoFlags))
        == kvImageNoError
    }
    return drawn ? pixels : nil
  }

  /// Where each kind of moving image keeps its frames' times, as the file
  /// has them rather than as ImageIO slows the quicker ones.
  private static var timings: [(dictionary: CFString, delay: CFString)] {
    [
      (kCGImagePropertyHEICSDictionary, kCGImagePropertyHEICSUnclampedDelayTime),
      (kCGImagePropertyGIFDictionary, kCGImagePropertyGIFUnclampedDelayTime),
      (kCGImagePropertyPNGDictionary, kCGImagePropertyAPNGUnclampedDelayTime),
      (kCGImagePropertyWebPDictionary, kCGImagePropertyWebPUnclampedDelayTime),
    ]
  }

  /// How long the frame `index` shows, in milliseconds: a tenth of a
  /// second when the source gives it no time, as browsers and ImageIO
  /// show such a frame.
  private static func delayMs(of index: Int, in source: CGImageSource) -> Int {
    let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]
    for timing in timings {
      if let delay = (properties?[timing.dictionary] as? [CFString: Any])?[timing.delay] as? Double,
        delay > 0
      {
        return Int((delay * 1000).rounded())
      }
    }
    return 100
  }
}

extension DatabaseMigrator {
  /// A chat line may be a sticker: the lines' table again, its kinds with
  /// `sticker` among them, as SQLite changes no table's checks in place.
  mutating func registerStickers() {
    registerMigration("Take stickers among the chats' lines") { db in
      try #sql(
        """
        CREATE TABLE "chatLinesWithStickers" (
          "groupID" TEXT NOT NULL,
          "threadID" TEXT NOT NULL,
          "seq" INTEGER NOT NULL,
          "authorID" TEXT NOT NULL,
          "sentAtMs" INTEGER NOT NULL,
          "opID" TEXT NOT NULL,
          "content" TEXT NOT NULL CHECK (
            json_extract("content", '$.kind')
              IN (
                'words', 'photos', 'sticker', 'days', 'poll', 'notice', 'unsent', 'hidden',
                'unknown'
              )
          ),
          "reactionsJSON" TEXT NOT NULL DEFAULT '[]',
          "pinnedOrder" INTEGER NOT NULL DEFAULT 0,
          "replyTo" INTEGER,
          PRIMARY KEY ("groupID", "threadID", "seq")
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        INSERT INTO "chatLinesWithStickers" (
          "groupID", "threadID", "seq", "authorID", "sentAtMs", "opID", "content",
          "reactionsJSON", "pinnedOrder", "replyTo"
        )
        SELECT
          "groupID", "threadID", "seq", "authorID", "sentAtMs", "opID", "content",
          "reactionsJSON", "pinnedOrder", "replyTo"
        FROM "chatLines"
        """
      )
      .execute(db)
      try #sql(#"DROP TABLE "chatLines""#).execute(db)
      try #sql(#"ALTER TABLE "chatLinesWithStickers" RENAME TO "chatLines""#).execute(db)
    }
  }
}
