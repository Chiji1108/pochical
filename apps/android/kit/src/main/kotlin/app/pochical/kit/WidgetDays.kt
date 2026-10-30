package app.pochical.kit

import app.pochical.design.Widgets
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

// What a widget's entry says of a day and of days off (spec/widgets.md; iOS's WidgetEntry.swift in
// PochicalKit), pinned by spec/vectors/widgets.json: the widgets' entry (:app's WidgetEntry) is
// made of these days.

/** How a day's date is colored where it stands alone. */
enum class WidgetTone { Holiday, Saturday, Plain }

/** One day of a widget's entry. */
data class WidgetDay(
  val date: LocalDate,
  val tone: WidgetTone,
  /** A national holiday while 祝日 coloring is on: the one date a grid of days colors, Sundays and Saturdays being colored in the weekdays. */
  val holiday: Boolean,
  /** The day's pattern, none where nothing is entered. */
  val pattern: PatternRow?,
  /** A day off (休み, 有休), drawn as the calendar draws one. */
  val off: Boolean,
  /** "9:00 – 18:00", for a shift with a time: read aloud, not shown. */
  val time: String?,
  /** The day's own start and end, else its pattern's, for a shift with hours: いまのシフト counts by them. */
  val hours: ShiftTime?,
  /** What is shown instead, only on a day whose hours differ from its pattern's: 早出 7:00〜, 残業 〜20:00, or the hours alone. */
  val change: String?,
  /** 早出 and 残業, drawn on the mark's corners. */
  val timeChange: TimeChange?,
  /** Whether the day has a memo, which the calendar's stroke says. Its words never come into an entry, nor do the day's people. */
  val noted: Boolean,
) {
  companion object {
    /** A day as the calendar shows it, from what it holds and its pattern. */
    fun of(date: LocalDate, shown: ShownDay?, pattern: PatternRow?, noted: Boolean, week: Week, holiday: Boolean): WidgetDay {
      val drawn = pattern?.takeIf { shown != null }
      val standard = drawn?.time
      val moved = timeChange(shown?.start, shown?.end, standard)
      val hours = standard?.let { ShiftTime(shown?.start ?: it.start, shown?.end ?: it.end) }
      val time = hours?.let { hoursText(it.start, it.end) }
      val isHoliday = week.holiday && holiday
      return WidgetDay(
        date = date,
        tone =
          when {
            isHoliday || (date.weekday == 0 && week.sunday) -> WidgetTone.Holiday
            date.weekday == 6 && week.saturday -> WidgetTone.Saturday
            else -> WidgetTone.Plain
          },
        holiday = isHoliday,
        pattern = drawn,
        off = drawn?.countsAsOff ?: false,
        time = time,
        hours = hours,
        change = time?.let { widgetChange(it, moved) },
        timeChange = moved,
        noted = noted,
      )
    }
  }
}

/**
 * A day's changed hours in words, from its time and how it moved: 早出 7:00〜, 残業 〜20:00, or the
 * hours alone where both moved or for other changes, so they keep to one line; the mark's corners
 * say 早出 and 残業.
 */
fun widgetChange(time: String, moved: TimeChange?): String? {
  val hours = changedHours(time, moved ?: return null)
  return when {
    moved.early && !moved.late -> "早出 $hours"
    moved.late && !moved.early -> "残業 $hours"
    else -> hours
  }
}

/** What changed, short enough for a column of これから on one line: the new start for 早出, the new end for 残業, else both ends. */
fun WidgetDay.columnHours(): String? {
  val time = time ?: return null
  change ?: return null
  return changedHours(time, timeChange ?: return null)
}

/** The hours that moved, from a time range as [hoursText] writes it: the start for 早出 alone, the end for 残業 alone, else both. */
private fun changedHours(time: String, moved: TimeChange): String {
  val (start, end) = time.split(" – ").let { it.first() to it.getOrElse(1) { "" } }
  return when {
    moved.early && !moved.late -> "$start〜"
    moved.late && !moved.early -> "〜$end"
    else -> "$start〜$end"
  }
}

/** Those words for a column they do not fit even shrunk to 8sp: without their :00 (7〜20). */
fun withoutWholeHours(words: String): String = words.replace(":00", "")

/** The next day off after today, and how many days on it is. */
data class NextOff(val day: WidgetDay, val inDays: Int)

/** Why no day off is ahead. */
sealed interface NoOff {
  data object NotEntered : NoOff

  /** Waiting on those who have not entered days the person is off, as their days come. */
  data class Waiting(val names: List<String>) : NoOff

  data object Apart : NoOff

  /** Set to a group the person is alone in: no day off is shared. */
  data object Alone : NoOff
}

/** 次の休み: whether today is off, and the next day off after it, as far as days are entered; with someone picked, only days all are off. */
data class WidgetOffs(
  val today: Boolean,
  val next: NextOff?,
  /** Only when nothing is ahead, today included. */
  val none: NoOff?,
)

/** Someone a widget is set to, by name, with whether they are off on a day, null where they have not entered it. */
class WidgetPerson(val name: String, val offOn: (LocalDate) -> Boolean?)

/**
 * 次の休み from [today], [dayAt] giving each day by how many days on it is, with [people] those the
 * widget is set to; [group] when it is set to a group, which with no one else in it shares no day
 * off, as the group's own screens show no みんな休み for one member.
 */
fun widgetOffs(today: WidgetDay, people: List<WidgetPerson>, group: Boolean = false, dayAt: (Int) -> WidgetDay): WidgetOffs {
  if (group && people.isEmpty()) return WidgetOffs(today = false, next = null, none = NoOff.Alone)
  fun theirs(day: WidgetDay) = people.map { it.offOn(day.date) }
  fun together(day: WidgetDay) = allOff(listOf(if (day.pattern == null) null else day.off) + theirs(day))
  val looked = mutableListOf(today)
  var next: NextOff? = null
  for (inDays in 1..Widgets.offLookaheadDays) {
    val day = dayAt(inDays)
    looked += day
    if (together(day)) {
      next = NextOff(day, inDays)
      break
    }
  }
  val offToday = together(today)
  if (next != null || offToday) return WidgetOffs(offToday, next, none = null)
  val waiting = LinkedHashSet<String>()
  for (day in looked) {
    val offs = theirs(day)
    if (!day.off || !mayAllBeOff(offs)) continue
    offs.forEachIndexed { index, off -> if (off == null) waiting += people[index].name }
  }
  val none =
    when {
      waiting.isNotEmpty() -> NoOff.Waiting(waiting.toList())
      looked.any { it.pattern != null } && people.isNotEmpty() -> NoOff.Apart
      else -> NoOff.NotEntered
    }
  return WidgetOffs(today = false, next = null, none = none)
}

/** The day off 次の休み counts from [today]: today on a day off, else the next one ahead; none ahead, none. */
fun WidgetOffs.soonest(today: WidgetDay): NextOff? = if (this.today) NextOff(today, 0) else next

/** The day 次の休み opens from [today] (spec/widgets.md, Opening the app): the day off it counts, else today. */
fun WidgetOffs.opens(today: WidgetDay): LocalDate = soonest(today)?.day?.date ?: today.date

/** The person's [date] as a widget shows it, of [shown], their days from [OwnCalendar.shown]. */
fun OwnCalendar.widgetDay(date: LocalDate, shown: Map<LocalDate, ShownDay>, week: Week, holiday: Boolean): WidgetDay {
  val entry = shown[date]
  return WidgetDay.of(date, entry, entry?.let { pattern(it.shift) }, note(date) != null, week, holiday)
}

/**
 * The day the launcher's 次の休み opens from [today] (spec/shortcuts.md): the one 次の休み not set to
 * anyone opens. The week and the holidays only color the days, so any do.
 */
fun OwnCalendar.nextDayOff(today: LocalDate): LocalDate {
  val shown = shown(today, today.plusDays(Widgets.offLookaheadDays.toLong()))
  fun day(inDays: Int) = widgetDay(today.plusDays(inDays.toLong()), shown, Week(), holiday = false)
  val first = day(0)
  return widgetOffs(first, people = emptyList(), dayAt = ::day).opens(first)
}

/** A shift with hours as a stretch of the clock: from its day's start to its end, the next day where the end comes at or before the start. */
data class WidgetSpan(val day: WidgetDay, val start: ZonedDateTime, val end: ZonedDateTime)

/**
 * いまのシフト at [at]: the shift on, else the next with hours, as far as widgetRules.shiftLookaheadDays.
 * Days off and shifts without hours are time off.
 */
data class WidgetNow(
  val at: ZonedDateTime,
  val on: WidgetSpan?,
  val next: WidgetSpan?,
  /** Whole days to the next shift's day, when it is more than countdownHours away; within them the words count down instead. */
  val nextInDays: Int?,
  /** When the entry is made again: as the shift on ends, as the next starts, countdownHours before it starts, else at midnight. */
  val refresh: ZonedDateTime,
)

/** [day]'s shift as a stretch of the clock in [at]'s zone; none for a day off, a shift without hours or hours that are not a time. */
private fun span(day: WidgetDay, at: ZonedDateTime): WidgetSpan? {
  val hours = day.hours?.takeUnless { day.off } ?: return null
  val from = minutesOrNull(hours.start) ?: return null
  val to = minutesOrNull(hours.end) ?: return null
  fun clock(date: LocalDate, minutes: Int) = date.atTime(LocalTime.ofSecondOfDay(minutes * 60L)).atZone(at.zone)
  val start = clock(day.date, from)
  val end = clock(day.date, to).let { if (it <= start) clock(day.date.plusDays(1), to) else it }
  return WidgetSpan(day, start, end)
}

/** いまのシフト at [at], [dayAt] giving each day by how many days it is from [at]'s: yesterday's shift may still be on past midnight. */
fun widgetNow(at: ZonedDateTime, dayAt: (Int) -> WidgetDay): WidgetNow {
  val spans = (-1..Widgets.shiftLookaheadDays).mapNotNull { span(dayAt(it), at) }
  val on = spans.firstOrNull { it.start <= at && at < it.end }
  val next = spans.firstOrNull { it.start > at }
  val midnight = at.toLocalDate().plusDays(1).atStartOfDay(at.zone)
  val countdown = Duration.ofHours(Widgets.countdownHours.toLong())
  val turns = listOfNotNull(on?.end, next?.start, next?.start?.minus(countdown))
  val refresh = turns.filter { it > at && it < midnight }.minOrNull() ?: midnight
  val far = next != null && Duration.between(at, next.start) > countdown
  val inDays = next?.let { ChronoUnit.DAYS.between(at.toLocalDate(), it.day.date).toInt() }
  return WidgetNow(at, on, next, nextInDays = inDays?.takeIf { far }, refresh = refresh)
}
