import Testing

@testable import PochicalKit

private func pattern(_ id: String, off: Bool = false, next: String? = nil) -> Pattern {
  Pattern(
    id: id, name: id, emoji: "", symbol: "", icon: "", color: 0, countsAsOff: off, nextDay: next)
}

@Test func theSampleRunsEachShiftWithWhatFollowsItAndDaysOffBetween() {
  let patterns = [
    pattern("day"), pattern("night", next: "after"), pattern("after"), pattern("late"),
    pattern("off", off: true),
  ]
  #expect(sampleSequence(of: patterns) == ["day", "night", "after", "off", "late", "off"])
}

@Test func theSampleRepeatsOverThePreviewsDays() {
  let patterns = [pattern("day"), pattern("off", off: true)]
  let first = Day(year: 2026, month: 10, day: 4)
  let days = (0..<3).map { first.adding(days: $0) }
  let shown = stylePreviewDays(days, patterns: patterns)
  #expect(days.map { shown[$0]?.shift } == ["day", "off", "day"])
}

@Test func withoutPatternsThePreviewIsBlank() {
  #expect(stylePreviewDays([Day(year: 2026, month: 10, day: 4)], patterns: []).isEmpty)
}
