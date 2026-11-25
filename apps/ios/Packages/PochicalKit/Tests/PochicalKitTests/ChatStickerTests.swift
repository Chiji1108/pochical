import Foundation
import ImageIO
import PochicalDesign
import PochicalProto
import SQLiteData
import Testing
import UniformTypeIdentifiers

@testable import PochicalKit

// Stickers (spec/chat.md, Stickers): told from photos pasted, written as
// WebP to send, and held as a line of their own.

/// A sticker's frames as the keyboard gives them, `width` by `height`:
/// see-through but for a disc in the middle, half see-through at its
/// edge, a little larger each frame.
private func frames(_ count: Int, width: Int = 1024, height: Int = 768) -> [CGImage] {
  (0..<count).map { index in
    let context = CGContext(
      data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let radius = CGFloat(height) / 4 + CGFloat(index * 10)
    let disc = CGRect(
      x: CGFloat(width) / 2 - radius, y: CGFloat(height) / 2 - radius, width: radius * 2,
      height: radius * 2)
    context.setFillColor(CGColor(red: 1, green: 0.5, blue: 0, alpha: 0.5))
    context.fillEllipse(in: disc.insetBy(dx: -20, dy: -20))
    context.setFillColor(CGColor(red: 1, green: 0.5, blue: 0, alpha: 1))
    context.fillEllipse(in: disc)
    return context.makeImage()!
  }
}

/// `images` written as `type`, each shown `delay` seconds and looping
/// `loops` times (0 for ever), as moving images keep their frames' times.
private func written(
  _ images: [CGImage], as type: UTType, delay: Double = 0.05, loops: Int = 0
) -> Data {
  let out = NSMutableData()
  let destination = CGImageDestinationCreateWithData(
    out, type.identifier as CFString, images.count, nil)!
  // ImageIO writes a GIF's loops, and no HEIF sequence's.
  CGImageDestinationSetProperties(
    destination,
    [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: loops]] as CFDictionary)
  for image in images {
    let timing: [CFString: Any] =
      switch type {
      case .png: [kCGImagePropertyPNGDictionary: [kCGImagePropertyAPNGDelayTime: delay]]
      case .gif: [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: delay]]
      default: [kCGImagePropertyHEICSDictionary: [kCGImagePropertyHEICSDelayTime: delay]]
      }
    CGImageDestinationAddImage(destination, image, timing as CFDictionary)
  }
  #expect(CGImageDestinationFinalize(destination))
  return out as Data
}

/// What ImageIO reads of a WebP: how many frames, its size, and the
/// alpha of its first frame's corner and middle.
private struct Read {
  let frames: Int
  let width: Int
  let height: Int
  let corner: UInt8
  let middle: UInt8
  let delay: Double?
  let loops: Int?

  init(_ webp: Data) throws {
    #expect(webp.prefix(4) == Data("RIFF".utf8))
    #expect(webp.dropFirst(8).prefix(4) == Data("WEBP".utf8))
    let source = try #require(CGImageSourceCreateWithData(webp as CFData, nil))
    #expect(CGImageSourceGetType(source) as String? == UTType.webP.identifier)
    frames = CGImageSourceGetCount(source)
    let image = try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))
    width = image.width
    height = image.height
    let context = try #require(
      CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    let pixels = try #require(context.data).assumingMemoryBound(to: UInt8.self)
    corner = pixels[3]
    middle = pixels[(height / 2 * width + width / 2) * 4 + 3]
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    delay =
      (properties?[kCGImagePropertyWebPDictionary] as? [CFString: Any])?[
        kCGImagePropertyWebPUnclampedDelayTime] as? Double
    let container = CGImageSourceCopyProperties(source, nil) as? [CFString: Any]
    loops =
      (container?[kCGImagePropertyWebPDictionary] as? [CFString: Any])?[
        kCGImagePropertyWebPLoopCount] as? Int
  }
}

@Test func aMovingStickerIsWrittenAsAMovingWebPItsSeeThroughKept() async throws {
  let sticker = try #require(await ChatStickers.shrink(written(frames(6), as: .heics)))
  let read = try Read(sticker.webp)
  #expect(read.frames == 6)
  #expect((read.width, read.height) == (Chat.stickerMaxEdge, 384))
  #expect((sticker.width, sticker.height) == (read.width, read.height))
  #expect(read.corner == 0)
  #expect(read.middle == 255)
  #expect(read.delay.map { abs($0 - 0.05) < 0.001 } == true)
  #expect(sticker.webp.count <= Chat.stickerMaxBytes)
}

@Test(arguments: [0, 1, 2])
func aMovingStickerLoopsForEverWhateverItsFileSays(_ loops: Int) async throws {
  let sticker = try #require(
    await ChatStickers.shrink(written(frames(3), as: .gif, loops: loops)))
  #expect(try Read(sticker.webp).loops == 0)
}

@Test func aMovingStickerPastItsBytesGoesAsItsFirstFrameStill() async throws {
  let source = written(frames(6), as: .heics)
  let moving = try #require(await ChatStickers.shrink(source))
  let still = try #require(await ChatStickers.shrink(source, maxBytes: moving.webp.count - 1))
  let read = try Read(still.webp)
  #expect(read.frames == 1)
  #expect(read.corner == 0)
  #expect(still.webp.count < moving.webp.count)
}

@Test func aStillStickerIsWrittenStillAndOneTooSmallIsNotGrown() async throws {
  let sticker = try #require(
    await ChatStickers.shrink(written(frames(1, width: 300, height: 200), as: .png)))
  let read = try Read(sticker.webp)
  #expect(read.frames == 1)
  #expect((read.width, read.height) == (300, 200))
  #expect(read.corner == 0)
}

@Test func whatIsNoImageIsNoSticker() async {
  #expect(await ChatStickers.shrink(Data("not an image".utf8)) == nil)
}

/// What the keyboard puts on the pasteboard for a sticker, as an iPhone
/// gave it: its HEIF sequence and a still HEIF, its PNG under the
/// sticker's own type and plainly, and an empty mark.
private func keyboardSticker(moving: Int) -> NSItemProvider {
  let item = NSItemProvider()
  let still = written(frames(1, width: 400, height: 400), as: .png)
  let types: [(String, Data)] = [
    ("public.heics", written(frames(moving, width: 400, height: 400), as: .heics)),
    ("public.heic", written(frames(1, width: 400, height: 400), as: .heic)),
    ("com.apple.png-sticker", still),
    (UTType.png.identifier, still),
    ("com.apple.sticker", Data()),
  ]
  for (type, data) in types {
    item.registerDataRepresentation(forTypeIdentifier: type, visibility: .all) { done in
      done(data, nil)
      return nil
    }
  }
  return item
}

@Test func aStickerPastedIsToldFromAPhoto() {
  #expect(ChatStickers.isSticker(keyboardSticker(moving: 2)))
  let photo = NSItemProvider()
  photo.registerDataRepresentation(forTypeIdentifier: UTType.png.identifier, visibility: .all) {
    done in
    done(written(frames(1), as: .png), nil)
    return nil
  }
  #expect(!ChatStickers.isSticker(photo))
}

@Test func aPastedStickerMovesFromItsSequenceAndStandsStillFromItsPNG() async throws {
  let moving = try #require(await ChatStickers.read(keyboardSticker(moving: 4)))
  #expect(try Read(#require(await ChatStickers.shrink(moving.data)).webp).frames == 4)
  // A sequence of one frame is no moving sticker: its PNG is read.
  let still = try #require(await ChatStickers.read(keyboardSticker(moving: 1)))
  #expect(try Read(#require(await ChatStickers.shrink(still.data)).webp).frames == 1)
}

@Test func aPastedStickerIsKeptAsGivenAndWrittenOnceOnItsWayUpAtTheSizeItsLineSays()
  async throws
{
  let pasted = try #require(await ChatStickers.read(keyboardSticker(moving: 4)))
  #expect(pasted.line("s") == LineSticker(id: "s", width: 400, height: 400))
  let webp = try #require(await ChatStickers.written(pasted.data))
  let read = try Read(webp)
  #expect(read.frames == 4)
  #expect(read.width == pasted.width && read.height == pasted.height)
  // Written already, it is left as it is.
  #expect(try await ChatStickers.written(webp) == nil)
}

@Test func aStickerThatCannotBeWrittenIsGone() async {
  do {
    _ = try await ChatStickers.written(Data("no image".utf8))
    Issue.record("written")
  } catch ChatPhotos.UploadError.gone {
  } catch {
    Issue.record(error)
  }
}

@Test func aStickerLineIsHeldAndItsStickerUploadedAndRecalledAsAPhoto() throws {
  let database = try appDatabase()
  try database.write { db in
    let sticker = LineSticker(id: "s1", width: 512, height: 480)
    var change = Pochical_V1_Change()
    change.cursor = 1
    change.chatLine.threadID = groupThread
    change.chatLine.seq = 1
    change.chatLine.authorID = "u1"
    change.chatLine.opID = "op1"
    change.chatLine.content.sticker = sticker.wire
    try GroupSync.take([change], of: "g", in: db)
    var send = Pochical_V1_ChatSend()
    send.threadID = groupThread
    send.content.sticker = LineSticker(id: "s2", width: 512, height: 512).wire
    try Chats.edit(.send(send), in: "g", now: 1, db: db)
    let state = try Chats.state(of: groupThread, in: "g", now: 0, db: db)
    #expect(state.lines.map(\.content) == [.sticker(sticker)])
    #expect(state.lines[0].content.photos.isEmpty)
    let waiting = try #require(state.waiting.first)
    #expect(waiting.content.photoIDs == ["s2"])
    #expect(try Chats.photosToUpload(waiting.opID, now: 1, in: db) == ["s2"])
  }
}
