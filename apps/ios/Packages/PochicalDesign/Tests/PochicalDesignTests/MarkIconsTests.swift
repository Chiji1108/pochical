import SwiftUI
import Testing

@testable import PochicalDesign

// MarkIcons.swift is written by design/scripts/mark-icon-code.ts; these
// check that its paths read back as drawings inside the icon's square.
@Test func drawsTheSunInBothWeights() throws {
  let duotone = try #require(MarkIcons.layers("sun", filled: true, size: 256))
  #expect(duotone.map(\.opacity) == [0.2, 1])
  let regular = try #require(MarkIcons.layers("sun", filled: false, size: 256))
  #expect(regular.count == 1)
  let bounds = regular[0].path.boundingRect
  #expect(bounds.minX >= 0 && bounds.maxX <= 256 && bounds.minY >= 0 && bounds.maxY <= 256)
  #expect(bounds.width > 200)
}

@Test func scalesToTheSizeAsked() throws {
  let small = try #require(MarkIcons.layers("leaf", filled: false, size: 24))
  #expect(small[0].path.boundingRect.maxX <= 24)
}

@Test func hasNoGlyphForALetter() {
  #expect(MarkIcons.layers("letter", filled: true, size: 24) == nil)
  #expect(MarkIcons.layers("nothing", filled: true, size: 24) == nil)
}
