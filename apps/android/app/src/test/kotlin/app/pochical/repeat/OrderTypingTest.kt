package app.pochical.repeat

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

class OrderTypingTest {
  private val first = LocalDate.parse("2026-11-01")
  private val typed = OrderTyping(listOf("day", "night", "after"), first)

  @Test
  fun aKeyAddsAfterTheDaysTypedAndTheFrameStaysPastThem() {
    val after = typed.pick("off")
    assertEquals(listOf("day", "night", "after", "off"), after.sequence)
    assertEquals(first.plusDays(4), after.cursorDay)
  }

  @Test
  fun aDayTypedPressedIsTypedOverAndTheFrameMovesOn() {
    val over = typed.pressed(first.plusDays(1)).pick("off")
    assertEquals(listOf("day", "off", "after"), over.sequence)
    assertEquals(first.plusDays(2), over.cursorDay)
  }

  @Test
  fun clearingTakesTheDayOutAndThoseAfterCloseUp() {
    val cleared = typed.pressed(first).cleared()
    assertEquals(listOf("night", "after"), cleared.sequence)
    assertEquals(first, cleared.cursorDay)
    // The last typed taken out leaves the frame on the day after those left.
    assertEquals(OrderTyping(listOf("day", "night"), first), typed.pressed(first.plusDays(2)).cleared())
  }

  @Test
  fun theNextDayStopsAtTheDayAfterThoseTyped() {
    val moved = typed.pressed(first.plusDays(2)).movedOn()
    assertEquals(null, moved.framed)
    assertEquals(false, moved.onTyped)
    assertEquals(moved, moved.movedOn())
  }

  @Test
  fun anotherDayPressedMovesTheOrderThereKeepingWhatWasTyped() {
    val moved = typed.pressed(first.plusDays(10))
    assertEquals(OrderTyping(typed.sequence, first.plusDays(10)), moved)
    assertEquals(OrderTyping(typed.sequence, first.minusDays(3)), typed.pressed(first.minusDays(3)))
  }
}
