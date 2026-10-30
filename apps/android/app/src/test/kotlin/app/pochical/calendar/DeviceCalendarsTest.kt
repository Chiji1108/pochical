package app.pochical.calendar

import android.content.ContentProvider
import android.content.ContentUris
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.provider.CalendarContract
import android.provider.CalendarContract.Events
import app.pochical.kit.EventMark
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

  private fun descriptions() = provider.rows.map { it[Events.DESCRIPTION] as String? }

  private fun link(day: LocalDate, user: String) = EventMark(day, user).link

  /** An event as another calendar app or a sync left it: its description alone, the app's own columns gone. */
  private fun putDescribed(description: String) {
    provider.insert(Events.CONTENT_URI, ContentValues().apply { put(Events.DESCRIPTION, description) })
  }

  @Test
  fun eachEventCarriesTheMarkInItsDescription() = runBlocking {
    calendars.add(events.take(1).map { it.copy(notes = "申し送りあり") }, page, "me", 1)

    assertEquals(listOf("申し送りあり\n${link(LocalDate.of(2026, 11, 2), "me")}"), descriptions())
  }

  @Test
  fun twoAddsAtOnceLeaveThePageInOnce() = runBlocking {
    // As two quick taps, or two pages: each takes out what the other put in, never both in at once.
    coroutineScope { repeat(2) { launch(Dispatchers.Default) { calendars.add(events, page, "me", 1) } } }

    assertEquals(events.map { link(it.day, "me") }.sorted(), descriptions().map { it.orEmpty() }.sorted())
  }

  @Test
  fun addingAgainAndTakingOutLeaveOthersEvents() = runBlocking {
    // As Google's sync downloads them, with the description alone: the user's own of the month, put
    // in on another phone; someone else's in a calendar shared with family; the user's own of another
    // month; and the person's own event that names the day's link in a sentence.
    putDescribed("申し送りあり\n${link(LocalDate.of(2026, 11, 3), "me")}")
    putDescribed(link(LocalDate.of(2026, 11, 2), "family"))
    putDescribed(link(LocalDate.of(2026, 12, 1), "me"))
    putDescribed("${link(LocalDate.of(2026, 11, 2), "me")} を見る")

    calendars.add(events, page, "me", 1)
    calendars.add(events.take(1), page, "me", 2)
    assertEquals(4, provider.rows.size)

    assertEquals(1, calendars.remove(page, "me"))
    assertEquals(
      listOf(link(LocalDate.of(2026, 11, 2), "family"), link(LocalDate.of(2026, 12, 1), "me"), "${link(LocalDate.of(2026, 11, 2), "me")} を見る"),
      descriptions(),
    )
  }
}
