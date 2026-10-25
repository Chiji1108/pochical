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
