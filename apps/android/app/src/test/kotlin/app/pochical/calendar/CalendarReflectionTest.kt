package app.pochical.calendar

import android.provider.CalendarContract
import android.provider.CalendarContract.Events
import app.pochical.kit.DeviceSettings
import app.pochical.kit.EventMark
import app.pochical.kit.OwnCalendar as KitCalendar
import app.pochical.kit.PatternRow
import app.pochical.kit.Period
import app.pochical.kit.ShiftEvent
import java.time.LocalDate
import java.time.YearMonth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

/** 自動で反映 (spec/calendar.md, Reflecting automatically) over a calendar provider in memory: when it writes, and as whom. */
@RunWith(RobolectricTestRunner::class)
class CalendarReflectionTest {
  private val provider = Robolectric.setupContentProvider(DeviceCalendarsTest.EventsInMemory::class.java, CalendarContract.AUTHORITY)
  private val calendars =
    DeviceCalendars(RuntimeEnvironment.getApplication().also { shadowOf(it).grantPermissions(*DeviceCalendars.PERMISSIONS) })
  private val today = LocalDate.of(2026, 11, 10)
  private val month = Period.of(YearMonth.of(2026, 11), 1)
  private val day = ShiftEvent(LocalDate.of(2026, 11, 12), "日勤", 540, 1080)
  private val patterns = listOf(PatternRow("day", "日勤", "☀️", "日", "sun", 1, "09:00", "18:00", false, null, false))
  private val scope = CoroutineScope(Dispatchers.Default)
  private val own = MutableStateFlow("" to KitCalendar.empty)
  private val settings = MutableStateFlow(DeviceSettings(deviceCalendar = 1, calendarReflects = true))
  private val reflection = CalendarReflection(calendars, own, settings, { change -> settings.update(change) }, scope, today = { today })

  @After
  fun end() {
    scope.cancel()
  }

  private fun marks() = provider.rows.map { EventMark.inNotes(it[Events.DESCRIPTION] as String?)?.user }

  /** Runs the reflection until it has kept days as [user]. */
  private suspend fun reflectedBy(user: String) {
    reflection.start()
    withTimeout(10_000) { settings.first { it.calendarReflectedBy == user } }
  }

  @Test
  fun dataThatIsNoOnesOrHoldsNoPatternWritesNothing() = runBlocking {
    calendars.put(listOf(day), month, "me", 1)
    val written = provider.writes

    // Erased and not yet synced again: no one's, then the user's with nothing in it; then their
    // patterns, with which the days that show no shift lose their events.
    reflection.start()
    own.value = "me" to KitCalendar.empty
    reflection.foreground()
    assertEquals(written, provider.writes)
    own.value = "me" to KitCalendar(patterns, emptyMap(), emptyList())
    reflectedBy("me")

    assertEquals(emptyList<String?>(), marks())
  }

  @Test
  fun theUserBeforeIsTakenOutOfTheDaysKept() = runBlocking {
    calendars.put(listOf(day), month, "before", 1)
    calendars.put(listOf(day), month, "family", 1)
    settings.update { it.copy(calendarReflectedBy = "before") }

    own.value = "me" to KitCalendar(patterns, emptyMap(), emptyList())
    reflectedBy("me")

    assertEquals(listOf<String?>("family"), marks())
  }
}
