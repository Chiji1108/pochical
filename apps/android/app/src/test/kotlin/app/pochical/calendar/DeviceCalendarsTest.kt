package app.pochical.calendar

import android.content.ContentProvider
import android.content.ContentUris
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.provider.CalendarContract
import android.provider.CalendarContract.Events
import app.pochical.kit.Period
import app.pochical.kit.ShiftEvent
import java.time.LocalDate
import java.time.YearMonth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** 端末カレンダーに追加's writes (spec/calendar.md, Adding a month to the device calendar), over a calendar provider in memory. */
@RunWith(RobolectricTestRunner::class)
class DeviceCalendarsTest {
  /** The events table alone, as the writes use it: every row whatever is asked, by its columns. */
  class EventsInMemory : ContentProvider() {
    val rows = mutableListOf<Map<String, Any?>>()
    private var next = 1L

    override fun onCreate() = true

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, args: Array<String>?, sort: String?): Cursor {
      val columns = checkNotNull(projection)
      return MatrixCursor(columns).apply { synchronized(rows) { rows.forEach { row -> addRow(columns.map { row[it] }) } } }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri =
      synchronized(rows) {
        val id = next++
        rows += values!!.keySet().associateWith { values.get(it) } + (Events._ID to id)
        ContentUris.withAppendedId(uri, id)
      }

    override fun delete(uri: Uri, selection: String?, args: Array<String>?): Int =
      synchronized(rows) { if (rows.removeIf { it[Events._ID] == ContentUris.parseId(uri) }) 1 else 0 }

    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<String>?) = 0

    override fun getType(uri: Uri): String? = null
  }

  private val provider = Robolectric.setupContentProvider(EventsInMemory::class.java, CalendarContract.AUTHORITY)
  private val calendars = DeviceCalendars(RuntimeEnvironment.getApplication())
  private val page = Period.of(YearMonth.of(2026, 11), 1)
  private val events =
    listOf(
      ShiftEvent(LocalDate.of(2026, 11, 2), "日勤", 510, 1050),
      ShiftEvent(LocalDate.of(2026, 11, 5), "夜勤", 990, 1980),
      ShiftEvent(LocalDate.of(2026, 11, 7), "休み", null, null),
    )

  private fun marks() = provider.rows.map { it[Events.CUSTOM_APP_URI] }

  @Test
  fun twoAddsAtOnceLeaveThePageInOnce() = runBlocking {
    // As two quick taps, or two pages: each takes out what the other put in, never both in at once.
    coroutineScope { repeat(2) { launch(Dispatchers.Default) { calendars.add(events, page, "me", 1) } } }

    assertEquals(events.map { DeviceCalendars.dayLink(it.day, "me") }.sortedBy { it }, marks().sortedBy { it as String })
  }

  @Test
  fun addingAgainAndTakingOutLeaveOthersEvents() = runBlocking {
    // Someone else's event of the month in a calendar shared with family, and the user's own of another month.
    provider.insert(Events.CONTENT_URI, ContentValues().apply { put(Events.CUSTOM_APP_URI, DeviceCalendars.dayLink(LocalDate.of(2026, 11, 2), "family")) })
    provider.insert(Events.CONTENT_URI, ContentValues().apply { put(Events.CUSTOM_APP_URI, DeviceCalendars.dayLink(LocalDate.of(2026, 12, 1), "me")) })

    calendars.add(events, page, "me", 1)
    calendars.add(events.take(1), page, "me", 2)
    assertEquals(3, provider.rows.size)

    assertEquals(1, calendars.remove(page, "me"))
    assertEquals(
      listOf(DeviceCalendars.dayLink(LocalDate.of(2026, 11, 2), "family"), DeviceCalendars.dayLink(LocalDate.of(2026, 12, 1), "me")),
      marks(),
    )
  }
}
