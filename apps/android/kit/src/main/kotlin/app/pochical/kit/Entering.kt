package app.pochical.kit

import java.time.LocalDate

// ポチポチ入力 (spec/shift-patterns.md, The next day; Blanks when entering ends), as iOS's
// Entering.swift: what a key does to the days as they show, where entering goes on, and the blank
// days 完了 asks about.

/**
 * The days after entering [shift] on [day]: the day takes it, keeping its memo and people, and a
 * pattern with a next day ([nextDay], as [OwnCalendar.nextDay] gives it) fills the following day
 * too, keeping that day's. One day only: the following day's own next day is never followed. No
 * shift clears the day, and only that day.
 */
fun enteringShift(
  shift: String?,
  day: LocalDate,
  days: Map<LocalDate, ShownDay>,
  nextDay: (String) -> String?,
): Map<LocalDate, ShownDay> {
  val entered = days.toMutableMap()
  if (shift == null) entered -= day else entered[day] = keepingDetails(days[day], shift)
  shift?.let(nextDay)?.let { following ->
    val next = day.plusDays(1)
    entered[next] = keepingDetails(days[next], following)
  }
  return entered
}

private fun keepingDetails(entry: ShownDay?, shift: String): ShownDay =
  if (entry?.shift == shift) entry else ShownDay(shift, note = entry?.note, people = entry?.people)

/**
 * The day selected after entering [shift] on [day]: one day on, or two past a next day it filled,
 * but never past [last], the page's last day, where entering stays until 完了.
 */
fun selectedAfterEntering(shift: String?, day: LocalDate, last: LocalDate, nextDay: (String) -> String?): LocalDate =
  minOf(day.plusDays(if (shift?.let(nextDay) != null) 2 else 1), last)

/**
 * The blank days 完了 asks about on the page from [first] through [last]: those before its last
 * entered day, [entered] saying which show a shift. Blanks after it are left alone, as more likely
 * not decided yet.
 */
fun gapDays(first: LocalDate, last: LocalDate, entered: (LocalDate) -> Boolean): List<LocalDate> {
  val page = daysFrom(first, last).toList()
  val lastEntered = page.lastOrNull(entered) ?: return emptyList()
  return page.filter { it < lastEntered && !entered(it) }
}

/** Where ポチポチ入力 starts on the page from [first] through [last]: its first blank day, else [first]. */
fun firstBlankDay(first: LocalDate, last: LocalDate, entered: (LocalDate) -> Boolean): LocalDate =
  daysFrom(first, last).toList().firstOrNull { !entered(it) } ?: first
