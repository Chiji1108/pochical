import CoreGraphics
import PochicalKit
import Testing

// The day rests with its top at 100 and is 20 tall; a title's words are
// the last 20 of its row.
private let line: CGFloat = 100
private let height: CGFloat = 20

private func pinned(_ rows: [(foot: CGFloat, title: Bool)]) -> PinnedDay {
  PinnedDay(
    rows: rows.enumerated().map {
      PinnedDay.Row(item: $0.offset + 5, foot: $0.element.foot, title: $0.element.title)
    },
    line: line, height: height)
}

@Test func theRowAcrossWhereTheDayRestsGivesItsDay() {
  let placed = pinned([(90, false), (130, false), (200, false)])
  #expect(placed.item == 6)
  #expect(placed.push == 0)
}

@Test func aTitleFarBelowPushesNothing() {
  let placed = pinned([(130, false), (160, true)])
  #expect(placed.item == 5)
  #expect(placed.push == 0)
}

@Test func aTitleComingUpPushesTheDayAsFarAsItsWordsReachIntoIt() {
  // Its words at 115...135, the pinned day's at 100...120.
  let placed = pinned([(110, false), (135, true)])
  #expect(placed.item == 5)
  #expect(placed.push == 5)
}

@Test func aTitleStillShortOfWhereTheDayRestsLeavesTheDayBeforeIt() {
  // The title's row reaches over the line, its words not yet.
  let placed = pinned([(95, false), (125, true)])
  #expect(placed.item == 5)
  #expect(placed.push == 15)
}

@Test func theDayIsPushedRightOutAsTheTitleReachesWhereItRests() {
  let placed = pinned([(95, false), (120, true)])
  #expect(placed.item == 6)
  #expect(placed.push == 0)
}

@Test func aTitleUpPastWhereTheDayRestsIsPinned() {
  let placed = pinned([(110, true), (200, false)])
  #expect(placed.item == 5)
  #expect(placed.push == 0)
}

@Test func aFirstTitleNotYetUpHasNoDayBeforeIt() {
  let placed = PinnedDay(
    rows: [PinnedDay.Row(item: 0, foot: 150, title: true)], line: line, height: height)
  #expect(placed.item == nil)
  #expect(placed.push == 0)
}

@Test func noRowsBelowWhereTheDayRestsPinNothing() {
  let placed = pinned([(50, false), (90, true)])
  #expect(placed.item == nil)
  #expect(placed.push == 0)
}
