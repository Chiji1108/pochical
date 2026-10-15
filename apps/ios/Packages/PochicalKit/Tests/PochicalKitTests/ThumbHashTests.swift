import Foundation
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
