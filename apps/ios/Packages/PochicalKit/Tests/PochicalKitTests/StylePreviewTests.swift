import Testing

@testable import PochicalKit

struct StylePreviewVectors: Decodable, Sendable {
  struct OwnPattern: Decodable, Sendable {
    let id: String
    let countsAsOff: Bool?
    let nextDay: String?

    var pattern: Pattern {
      Pattern(
        id: id, name: id, emoji: "", symbol: "", icon: "", color: 0,
        countsAsOff: countsAsOff ?? false, nextDay: nextDay)
    }
  }

  struct Run: VectorCase {
    let name: String
    let patterns: [OwnPattern]
    let expected: [String]
  }

  struct Days: VectorCase {
    let name: String
    let patterns: [OwnPattern]
    let days: Int
    let expected: [String?]
  }

  let sequence: [Run]
  let days: [Days]
  let samples: [Run]
}

@Test(arguments: try vectors("style-preview", as: StylePreviewVectors.self).sequence)
func runsThePersonsOwnShifts(_ vector: StylePreviewVectors.Run) {
  #expect(sampleSequence(of: vector.patterns.map(\.pattern)) == vector.expected)
}

@Test(arguments: try vectors("style-preview", as: StylePreviewVectors.self).days)
func repeatsTheRunOverThePreviewsDays(_ vector: StylePreviewVectors.Days) {
  let first = Day(year: 2026, month: 10, day: 4)
  let days = (0..<vector.days).map { first.adding(days: $0) }
  let shown = stylePreviewDays(days, patterns: vector.patterns.map(\.pattern))
  #expect(days.map { shown[$0]?.shift } == vector.expected)
}

@Test(arguments: try vectors("style-preview", as: StylePreviewVectors.self).samples)
func showsEachOfTheRunOnceUpToFour(_ vector: StylePreviewVectors.Run) {
  #expect(styleSamples(of: vector.patterns.map(\.pattern)) == vector.expected)
}
