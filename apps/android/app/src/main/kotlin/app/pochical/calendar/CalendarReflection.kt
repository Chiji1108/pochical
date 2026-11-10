package app.pochical.calendar

import android.util.Log
import app.pochical.kit.CalendarAdd
import app.pochical.kit.DeviceSettings
import app.pochical.kit.Period
import app.pochical.kit.ShiftEvent
import app.pochical.kit.ShownDay
import app.pochical.kit.reflected
import app.pochical.kit.shiftEvents
import app.pochical.kit.shown
import java.time.LocalDate
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * What 端末カレンダーに追加 puts in from the days of [page] as [putting] has it: the patterns to pick
 * from and those picked, the events, and which switches would put something in, worked out once
 * for each.
 */
internal class Adding(calendar: OwnCalendar, page: Period, putting: CalendarAdd) {
  private val rows = calendar.patterns.map { it.row }
  private val shownDays = calendar.shown(page.first, page.last)

  /** The patterns to pick from: those in use, and one left that still shows on the page. */
  val listed: List<Pattern> = calendar.patterns.filter { pattern -> !pattern.archived || shownDays.values.any { it.shift == pattern.id } }

  val picked: Set<String> = putting.shown(rows)

  private val memos = page.days.mapNotNull { day -> calendar.note(day)?.takeIf { it.isNotEmpty() }?.let { day to it } }.toMap()

  private val people: Map<LocalDate, List<String>> =
    calendar.coworkers.associate { it.id to it.name }.let { names ->
      shownDays.mapNotNull { (day, entry) -> entry.people.mapNotNull(names::get).takeIf { it.isNotEmpty() }?.let { day to it } }.toMap()
    }

  val events =
    shiftEvents(
      page,
      shownDays.mapValues { (_, entry) -> ShownDay(entry.shift, entry.start, entry.end) },
      rows.associateBy { it.id },
      picked,
      if (putting.notes) memos else emptyMap(),
      if (putting.people) people else emptyMap(),
    )

  // A switch only when it would put something in: a memo goes in any day, those on a day only in its shift's event.
  val offersNotes = memos.isNotEmpty()
  val offersPeople = people.keys.any { shownDays[it]?.shift in picked }
}

/**
 * 自動で反映 (spec/calendar.md, Reflecting automatically; iOS's CalendarReflection): while it is on,
 * the days from today's page through the pages ahead are kept in the device's calendar, written
 * anew whenever what would be put in changes, the days, patterns and orders, sync's changes among
 * them, and what 端末カレンダーに追加 is set to put in, and each time the app comes to the front, as
 * the reminders' alarms are set. Only what differs is written ([DeviceCalendars.put]). Without the
 * calendar or its access nothing is written, and the page says so.
 */
class CalendarReflection(
  private val calendars: DeviceCalendars,
  private val days: OwnDays,
  private val settings: Flow<DeviceSettings>,
  /** The signed-in user's id, none while there is none. */
  private val user: Flow<String?>,
  private val scope: CoroutineScope,
  private val today: () -> LocalDate = LocalDate::now,
) {
  /** How many times the app came to the front: each reads the day and the calendar again. */
  private val fronts = MutableStateFlow(0)

  /** Follows what is put in, as the app starts; nothing before the person's days are read. */
  fun start() {
    scope.launch {
      days.awaitRead()
      combine(days.calendar, settings, user, fronts) { calendar, device, user, front ->
          val target = device.deviceCalendar
          if (!device.calendarReflects || user == null || target == null) return@combine null
          val span = device.period.reflected(today())
          Wanted(Adding(calendar, span, device.calendarAdd).events, span, user, target, front)
        }
        .distinctUntilChanged()
        .collectLatest { wanted -> if (wanted != null) reflect(wanted) }
    }
  }

  /** The app came to the front. */
  fun foreground() {
    fronts.update { it + 1 }
  }

  private suspend fun reflect(wanted: Wanted) {
    try {
      calendars.put(wanted.events, wanted.span, wanted.user, wanted.target)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      // Tried again with the next change, or as the app next comes to the front.
      Log.w("PochicalCalendarAdd", "The days were not reflected: $e")
    }
  }

  private data class Wanted(val events: List<ShiftEvent>, val span: Period, val user: String, val target: Long, val front: Int)
}
