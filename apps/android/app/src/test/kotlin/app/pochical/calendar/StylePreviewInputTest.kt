package app.pochical.calendar

import app.pochical.kit.Week
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/** The style preview's pages are drawn from one input, so a pattern's look changes both. */
class StylePreviewInputTest {
  private val today = LocalDate.of(2026, 10, 29)

  private fun pattern(id: String, color: Int, off: Boolean = false) =
    Pattern(id = id, name = id, icon = "", emoji = "", symbol = id, color = color, time = null, countsAsOff = off)

  @Test
  fun aPatternsColorChangedChangesTheInputAndTheWidgetsDays() {
    val before = StylePreviewInput.of(today, listOf(pattern("day", 0), pattern("off", 3, off = true)), weekStart = 0)
    val after = StylePreviewInput.of(today, listOf(pattern("day", 5), pattern("off", 3, off = true)), weekStart = 0)

    // The same days, so only the look tells the two apart: and it does, for both pages.
    assertEquals(before.shown, after.shown)
    assertNotEquals(before, after)
    val dayBefore = before.widgetEntry(Week()).twoWeeks.first { it.pattern?.id == "day" }
    val dayAfter = after.widgetEntry(Week()).twoWeeks.first { it.pattern?.id == "day" }
    assertEquals(0, dayBefore.pattern?.color)
    assertEquals(5, dayAfter.pattern?.color)
  }

  @Test
  fun withNothingEnteredTheWidgetShowsTheFortnightAsTheCalendarDoes() {
    val input = StylePreviewInput.of(today, listOf(pattern("day", 0), pattern("off", 3, off = true)), weekStart = 0)
    val entry = input.widgetEntry(Week())
    assertEquals(false, entry.nothingEntered)
    assertEquals(input.fortnight, entry.twoWeeks.map { it.date })
  }
}
