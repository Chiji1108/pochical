import CoreGraphics
import PochicalKit
import Testing

// An iPhone 17's screen in points: its safe edges, and the keyboard's top
// while it is up.
private let width: CGFloat = 402
private let safeTop: CGFloat = 62
private let safeBottom: CGFloat = 840
private let keyboardTop: CGFloat = 538
private let bar = CGSize(width: 300, height: 48)
private let menu = CGSize(width: 250, height: 200)

private func place(
  _ bubble: CGRect, keyboard: CGFloat? = nil, bar: CGSize? = bar, menu: CGSize = menu,
  mine: Bool = false
) -> MenuPlacement {
  MenuPlacement(
    bubble: bubble, top: safeTop, bottom: safeBottom, keyboardTop: keyboard, width: width,
    bar: bar, menu: menu, leastMenu: 44, mine: mine)
}

@Test func aBubbleWithRoomUnderItStaysWithTheBarOverAndTheMenuUnder() {
  let bubble = CGRect(x: 60, y: 300, width: 200, height: 40)
  let placed = place(bubble)
  #expect(placed.inPlace)
  #expect(placed.bubble == bubble)
  #expect(placed.scale == 1)
  #expect(placed.bar == CGRect(x: 60, y: 300 - 8 - 48, width: 300, height: 48))
  #expect(placed.menuUnder)
  #expect(placed.menu == CGRect(x: 60, y: 348, width: 250, height: 200))
}

@Test func aBubbleNearTheFootHasItsMenuOverTheBar() {
  let bubble = CGRect(x: 60, y: 740, width: 200, height: 40)
  let placed = place(bubble)
  #expect(placed.inPlace)
  #expect(placed.bubble == bubble)
  #expect(!placed.menuUnder)
  #expect(placed.menu.maxY == CGFloat(740 - 56 - 8))
}

@Test func aKeyboardUpStaysWhenTheyFitOverIt() {
  let placed = place(CGRect(x: 60, y: 200, width: 200, height: 40), keyboard: keyboardTop)
  #expect(placed.inPlace)
  #expect(!placed.putsKeyboardAway)
  #expect(placed.menu.maxY <= keyboardTop - 12)
}

@Test func aKeyboardUpGoesWhenTheyDoNotFitOverIt() {
  // Fits over the screen's foot, but not over the keyboard: placed for the
  // screen's room at once, the keyboard going down for it.
  let bubble = CGRect(x: 60, y: 140, width: 200, height: 380)
  let placed = place(bubble, keyboard: keyboardTop)
  let without = place(bubble)
  #expect(placed.putsKeyboardAway)
  #expect(!without.putsKeyboardAway)
  #expect(placed.inPlace)
  #expect(placed.bubble == bubble)
  #expect(placed.menu == without.menu)
  #expect(placed.bar == without.bar)
}

@Test func aTallBubbleIsDrawnSmallerAboutItsTopCornerAndCut() {
  let bubble = CGRect(x: 100, y: 80, width: 260, height: 1400)
  let placed = place(bubble, mine: true)
  #expect(!placed.inPlace)
  #expect(placed.scale == MenuPlacement.leastScale)
  // Smaller about its top right corner, one's own line's.
  #expect(placed.bubble.maxX == bubble.maxX)
  #expect(placed.bubble.width == 130)
  // Between the bar and the menu, within the room.
  let room = (safeBottom - 12) - (safeTop + 12)
  #expect(placed.bubble.height == room - 56 - 208)
  #expect(placed.bar?.minY == safeTop + 12)
  #expect(placed.menu.maxY == safeBottom - 12)
  #expect(placed.menuUnder)
}

@Test func aBubbleWithNoBarTakesNoRoomForIt() {
  let bubble = CGRect(x: 60, y: 80, width: 200, height: 40)
  let placed = place(bubble, bar: nil)
  #expect(placed.bar == nil)
  #expect(placed.inPlace)
  #expect(placed.menu.minY == bubble.maxY + 8)
}

@Test func theBarAndMenuLineUpWithTheWritersEdgeWithinTheSides() {
  let others = place(CGRect(x: 60, y: 300, width: 80, height: 40))
  #expect(others.bar?.minX == 60)
  #expect(others.menu.minX == 60)
  let mine = place(CGRect(x: 200, y: 300, width: 186, height: 40), mine: true)
  #expect(mine.menu.maxX == 386)
  // Its bar, wider than the bubble, by its right edge too.
  #expect(mine.bar?.minX == CGFloat(386 - 300))
  let left = place(CGRect(x: 4, y: 300, width: 80, height: 40))
  #expect(left.menu.minX == 12)
}

@Test func aMenuTallerThanTheRoomIsShownAsTallAsItLeaves() {
  let tall = CGSize(width: 250, height: 2000)
  let placed = place(CGRect(x: 60, y: 300, width: 200, height: 40), menu: tall)
  let room = (safeBottom - 12) - (safeTop + 12)
  #expect(placed.menu.height == room - 56 - MenuPlacement.leastBubble - 16)
  #expect(placed.menu.minY >= safeTop + 12)
  #expect(placed.menu.maxY <= safeBottom - 12)
  #expect(placed.bar.map { $0.minY >= safeTop + 12 } == true)
}
