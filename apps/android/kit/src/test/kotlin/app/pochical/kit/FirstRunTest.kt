package app.pochical.kit

import java.time.LocalDate
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** はじめの設定 (spec/shift-patterns.md, The first run), kept with the user's data. */
@RunWith(RobolectricTestRunner::class)
class FirstRunTest {
  private val database = AppDatabase.open(RuntimeEnvironment.getApplication(), inMemory = true)
  private val firstRun = FirstRun(database)
  private val edits = OwnEdits(database)

  @After fun close() = database.close()

  @Test
  fun doneStaysDoneThoughEveryPatternGoes() = runBlocking {
    assertFalse(firstRun.done.first())
    edits.begin(readyCopies(listOf("off")), emptyList(), LocalDate.parse("2026-10-25"), LocalDate.parse("2026-10-25"), "JP")
    firstRun.finish()
    edits.deletePattern("off")

    assertTrue(firstRun.done.first())
    assertFalse(firstRun.holdsPatterns())
  }

  @Test
  fun aSwitchThatErasesWhatTheDeviceHeldKeepsItDone() = runBlocking {
    firstRun.finish()

    database.write { eraseUserData() }

    assertTrue(firstRun.done.first())
  }

  @Test
  fun aRepeatingWorkRepeatsFromTheMonthBeforeAndARostersSetsNoOrder() = runBlocking {
    val today = LocalDate.parse("2026-10-25")
    edits.begin(readyCopies(listOf("off")), emptyList(), today, today, "JP")
    assertTrue(firstRun.holdsPatterns())
    assertTrue(database.read { repeatOrders() }.isEmpty())

    val anchor = LocalDate.parse("2026-10-01")
    edits.begin(readyCopies(listOf("duty", "offDuty", "off")), listOf("duty", "offDuty", "off"), anchor, today, "JP")

    assertEquals(listOf("2026-09-01"), database.read { repeatOrders() }.map { it.start })
  }
}
