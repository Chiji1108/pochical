package app.pochical.calendar

import android.Manifest
import android.content.ContentProviderOperation
import android.content.ContentResolver
import android.content.Context
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Events
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import app.pochical.kit.Period
import app.pochical.kit.ShiftEvent
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeParseException
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.conflate

/** A calendar of the device that takes new events, under the account it is in. */
data class DeviceCalendar(val id: Long, val name: String, val color: Int, val account: String, val primary: Boolean)

/**
 * The device's calendars, through Android's calendar provider (CalendarContract), as iOS's
 * DeviceCalendars through EventKit: listed for 追加先 and written to (spec/calendar.md, Adding a
 * month to the device calendar). Each event Pochical puts in carries its mark: the app's own link to
 * its day and whose shift it is (`pochical://day/YYYY-MM-DD?by=<user id>`), in the event's columns
 * for an app's own link ([Events.CUSTOM_APP_URI]), so a calendar app opens the day from it.
 */
class DeviceCalendars(private val context: Context) {
  private val resolver: ContentResolver = context.contentResolver

  /** Whether the person let the app read and write the device's calendars. */
  val allowed: Boolean
    get() = PERMISSIONS.all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }

  /** Signals now and again whenever the device's calendars or their events change, inside the app or out. */
  fun changes(): Flow<Unit> =
    callbackFlow {
        val observer =
          object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
              trySend(Unit)
            }
          }
        resolver.registerContentObserver(CalendarContract.CONTENT_URI, true, observer)
        trySend(Unit)
        awaitClose { resolver.unregisterContentObserver(observer) }
      }
      .conflate()

  /**
   * The calendars that take new events, grouped by account in the order the device lists them,
   * each account's by name: read-only ones like holidays and birthdays are left out.
   */
  fun calendars(): List<DeviceCalendar> {
    val columns =
      arrayOf(Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.CALENDAR_COLOR, Calendars.ACCOUNT_NAME, Calendars.IS_PRIMARY)
    val found = mutableListOf<DeviceCalendar>()
    resolver
      .query(
        Calendars.CONTENT_URI,
        columns,
        "${Calendars.CALENDAR_ACCESS_LEVEL} >= ? AND ${Calendars.SYNC_EVENTS} = 1",
        arrayOf(Calendars.CAL_ACCESS_CONTRIBUTOR.toString()),
        null,
      )
      ?.use { rows ->
        while (rows.moveToNext()) {
          found +=
            DeviceCalendar(
              id = rows.getLong(0),
              name = rows.getString(1).orEmpty(),
              color = rows.getInt(2),
              account = rows.getString(3).orEmpty(),
              primary = rows.getInt(4) == 1,
            )
        }
      }
    val accounts = found.map { it.account }.distinct()
    return found.sortedWith(compareBy<DeviceCalendar> { accounts.indexOf(it.account) }.thenBy(String.CASE_INSENSITIVE_ORDER) { it.name })
  }

  /** The calendar picked first: [last], the one added to last, while it still takes events, else an account's own, else the first. */
  fun pickedFirst(calendars: List<DeviceCalendar>, last: Long?): DeviceCalendar? =
    calendars.find { it.id == last } ?: calendars.find { it.primary } ?: calendars.firstOrNull()

  /**
   * The events Pochical put in for the page's days as [user]'s, in any calendar that takes changes,
   * by their ids: those adding again replaces, and ポチカルで入れた〇月の予定を消す takes out. Found by
   * the day each mark names, so they are found whichever device put them in.
   */
  fun marked(page: Period, user: String): List<Long> {
    // From the day before the page's first to two past its last, at midnight in UTC, which all-day
    // events keep: a night's event ends the day after it, and a timed one's start is the device's clock.
    val from = page.first.minusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    val to = page.last.plusDays(2).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    val ids = mutableListOf<Long>()
    resolver
      .query(
        Events.CONTENT_URI,
        arrayOf(Events._ID, Events.CUSTOM_APP_URI),
        "${Events.CUSTOM_APP_PACKAGE} = ? AND ${Events.DELETED} = 0 AND ${Events.CALENDAR_ACCESS_LEVEL} >= ? AND " +
          "${Events.DTSTART} >= ? AND ${Events.DTSTART} < ?",
        arrayOf(context.packageName, Calendars.CAL_ACCESS_CONTRIBUTOR.toString(), from.toString(), to.toString()),
        null,
      )
      ?.use { rows ->
        while (rows.moveToNext()) {
          val mark = markOf(rows.getString(1)) ?: continue
          if (mark.second == user && mark.first in page) ids += rows.getLong(0)
        }
      }
    return ids
  }

  /**
   * Puts [events], the page's, in [calendar], taking out first the events Pochical put in for its
   * days as [user]'s, from any calendar, so a page added again is put in anew rather than twice.
   * All in one batch, which the provider writes whole or not at all.
   */
  fun add(events: List<ShiftEvent>, page: Period, user: String, calendar: Long) {
    val zone = ZoneId.systemDefault()
    val operations = ArrayList<ContentProviderOperation>()
    marked(page, user).mapTo(operations) { ContentProviderOperation.newDelete(eventUri(it)).build() }
    for (event in events) {
      val start = event.start
      val end = event.end
      val insert =
        ContentProviderOperation.newInsert(Events.CONTENT_URI)
          .withValue(Events.CALENDAR_ID, calendar)
          .withValue(Events.TITLE, event.title)
          .withValue(Events.DESCRIPTION, event.notes)
          .withValue(Events.CUSTOM_APP_PACKAGE, context.packageName)
          .withValue(Events.CUSTOM_APP_URI, dayLink(event.day, user))
      if (start != null && end != null) {
        // By the clock of the day, so a change to summer time moves nothing.
        insert
          .withValue(Events.DTSTART, at(event.day, start, zone))
          .withValue(Events.DTEND, at(event.day, end, zone))
          .withValue(Events.EVENT_TIMEZONE, zone.id)
      } else {
        // All day: from the day's midnight in UTC to the next's, as the provider keeps all-day events.
        insert
          .withValue(Events.ALL_DAY, 1)
          .withValue(Events.DTSTART, event.day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
          .withValue(Events.DTEND, event.day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
          .withValue(Events.EVENT_TIMEZONE, ZoneOffset.UTC.id)
      }
      operations += insert.build()
    }
    resolver.applyBatch(CalendarContract.AUTHORITY, operations)
  }

  /** Takes out the events Pochical put in for the page as [user]'s, all at once or none, and says how many went. */
  fun remove(page: Period, user: String): Int {
    val old = marked(page, user)
    resolver.applyBatch(CalendarContract.AUTHORITY, old.mapTo(ArrayList()) { ContentProviderOperation.newDelete(eventUri(it)).build() })
    return old.size
  }

  private fun eventUri(id: Long) = Events.CONTENT_URI.buildUpon().appendPath(id.toString()).build()

  /** The clock time [minutes] after the start of [day], a day on past 24 hours, in [zone]. */
  private fun at(day: LocalDate, minutes: Int, zone: ZoneId): Long =
    day.atStartOfDay().plusMinutes(minutes.toLong()).atZone(zone).toInstant().toEpochMilli()

  companion object {
    /** What the calendar's full access is on Android: reading to list them and find its own, writing to put them in. */
    val PERMISSIONS = arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)

    /** The mark Pochical leaves on an event: its link to the day it is for, and whose shift it is. */
    fun dayLink(day: LocalDate, user: String): String =
      "pochical://day/$day".toUri().buildUpon().appendQueryParameter("by", user).build().toString()

    /** The day and the user a mark names; none for an event not Pochical's. */
    fun markOf(link: String?): Pair<LocalDate, String>? {
      val uri = link?.toUri() ?: return null
      if (uri.scheme != "pochical" || uri.host != "day") return null
      val user = uri.getQueryParameter("by") ?: return null
      val day =
        try {
          LocalDate.parse(uri.pathSegments.singleOrNull() ?: return null)
        } catch (_: DateTimeParseException) {
          return null
        }
      return day to user
    }
  }
}
