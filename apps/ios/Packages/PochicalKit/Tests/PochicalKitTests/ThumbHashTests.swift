import CoreGraphics
import Foundation
import ImageIO
import PochicalDesign
import PochicalKit
import Testing

struct ThumbHashVectors: Decodable {
  struct Encode: VectorCase {
    let name: String
    let width: Int
    let height: Int
    let rgba: String
    let thumbHash: String
  }

  struct Decode: VectorCase {
    let name: String
    let thumbHash: String
    let width: Int
    let height: Int
    let rgba: String
  }

  let encode: [Encode]
  let decode: [Decode]
}

@Test(arguments: try vectors("thumbhash", as: ThumbHashVectors.self).encode)
func aPhotosThumbHashIsMade(_ vector: ThumbHashVectors.Encode) throws {
  let rgba = try #require(Data(base64Encoded: vector.rgba))
  let hash = ThumbHash.encode(width: vector.width, height: vector.height, rgba: [UInt8](rgba))
  #expect(hash.base64EncodedString() == vector.thumbHash)
  #expect(hash.count <= Chat.photoThumbHashMaxBytes)
}

@Test(arguments: try vectors("thumbhash", as: ThumbHashVectors.self).decode)
func aThumbHashDrawsItsBlur(_ vector: ThumbHashVectors.Decode) throws {
  let hash = try #require(Data(base64Encoded: vector.thumbHash))
  let drawn = try #require(ThumbHash.decode(hash))
  #expect(drawn.width == vector.width)
  #expect(drawn.height == vector.height)
  let expected = [UInt8](try #require(Data(base64Encoded: vector.rgba)))
  #expect(drawn.rgba.count == expected.count)
  // Cosines may round differently from the reference's.
  #expect(zip(drawn.rgba, expected).allSatisfy { abs(Int($0) - Int($1)) <= 1 })
}

@Test func bytesThatAreNoThumbHashDrawNothing() {
  #expect(ThumbHash.decode(Data([1, 2])) == nil)
  #expect(ThumbHash.image(Data()) == nil)
}

@Test func aPhotosBlurIsTheRightWayUp() throws {
  // Red over blue, as a JPEG the phone sends.
  let context = try #require(
    CGContext(
      data: nil, width: 60, height: 80, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
  context.setFillColor(red: 0, green: 0, blue: 1, alpha: 1)
  context.fill(CGRect(x: 0, y: 0, width: 60, height: 40))
  context.setFillColor(red: 1, green: 0, blue: 0, alpha: 1)
  context.fill(CGRect(x: 0, y: 40, width: 60, height: 40))
  let out = NSMutableData()
  let destination = try #require(
    CGImageDestinationCreateWithData(out, "public.jpeg" as CFString, 1, nil))
  let image = try #require(context.makeImage())
  CGImageDestinationAddImage(destination, image, nil)
  CGImageDestinationFinalize(destination)

  let hash = try #require(ChatPhotos.shrink(out as Data)?.thumbHash)
  let blur = try #require(ThumbHash.decode(hash))
  let top = 0
  let bottom = (blur.height - 1) * blur.width * 4
  #expect(blur.rgba[top] > blur.rgba[top + 2])
  #expect(blur.rgba[bottom + 2] > blur.rgba[bottom])
}
