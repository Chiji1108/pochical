package app.pochical.calendar

import app.pochical.design.Holidays
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale

/** 0 for Sunday through 6 for Saturday, as spec/ and the settings count weekdays. */
val LocalDate.weekday: Int
  get() = dayOfWeek.value % 7

/** The first day of the week `this` is in, the week starting on `weekStart`. */
fun LocalDate.weekStartingOn(weekStart: Int): LocalDate = minusDays(((weekday - weekStart + 7) % 7).toLong())

/**
 * The days `month`'s page shows, a week to a row from `weekStart`: whole
 * weeks covering the month, with the days of the months around it filling
 * the first and last (spec/vectors/month.json).
 */
fun monthWeeks(month: YearMonth, weekStart: Int): List<List<LocalDate>> {
  val first = month.atDay(1)
  val lead = (first.weekday - weekStart + 7) % 7
  val start = first.minusDays(lead.toLong())
  val weeks = (lead + month.lengthOfMonth() + 6) / 7
  return List(weeks) { week -> List(7) { start.plusDays((week * 7 + it).toLong()) } }
}

/** The country whose holidays this device's days take: its region's when Pochical has them, else Japan's. */
fun holidayCountry(locale: Locale = Locale.getDefault()): String = Holidays.countryFor(locale.country.ifEmpty { null })

/** The national holiday on this day in `country`, or none. */
fun LocalDate.holidayName(country: String): String? = Holidays.nameOf(toString(), country)

/** How a day's own hours moved from its pattern's: starting earlier is 早出, ending later is 残業. */
data class TimeChange(val early: Boolean, val late: Boolean)

/**
 * The change of a day with its own `start` or `end` against `standard`,
 * none when it has neither or the pattern has no time. Times count from
 * the standard start around the clock, so a night shift's end the next
 * morning compares the right way (spec/vectors/time-change.json).
 */
fun timeChange(start: String?, end: String?, standard: ShiftTime?): TimeChange? {
  if (standard == null || (start == null && end == null)) return null
  val day = 24 * 60
  val standardStart = minutes(standard.start)
  fun fromStart(time: String): Int {
    val offset = minutes(time) - standardStart
    return when {
      offset > day / 2 -> offset - day
      offset < -day / 2 -> offset + day
      else -> offset
    }
  }
  fun endOf(time: String): Int {
    val offset = minutes(time) - standardStart
    return if (offset <= 0) offset + day else offset
  }
  return TimeChange(
    early = start?.let { fromStart(it) < 0 } ?: false,
    late = end?.let { endOf(it) > endOf(standard.end) } ?: false,
  )
}

/** Hours as the screens write them: 9:00 – 18:00, an end at or before the start as 翌9:30 (spec/vectors/widgets.json). */
fun hoursText(start: String, end: String): String {
  fun trim(time: String) = time.removePrefix("0")
  return "${trim(start)} – ${if (end <= start) "翌" else ""}${trim(end)}"
}

/** "HH:MM" as minutes since midnight. */
private fun minutes(time: String): Int {
  val (hours, minutes) = time.split(":").map(String::toInt)
  return hours * 60 + minutes
}
