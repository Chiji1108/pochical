package app.pochical.calendar

import java.time.LocalDate
import java.time.YearMonth

// How days are written, in one place so another language changes them
// here (spec/calendar.md, How days are written).

private const val WEEKDAYS = "日月火水木金土"

/** A weekday's one letter, 0 for Sunday through 6 for Saturday. */
fun weekdayLetter(weekday: Int): String = WEEKDAYS[weekday].toString()

/** 11月1日, with the year before it for a day of another year than today's. */
val LocalDate.monthDayText: String
  get() = "${if (year != LocalDate.now().year) "${year}年" else ""}${monthValue}月${dayOfMonth}日"

/** 11月1日(日) */
val LocalDate.fullText: String
  get() = "$monthDayText(${weekdayLetter(weekday)})"

/** 1日, where the month goes without saying. */
val LocalDate.dayText: String
  get() = "${dayOfMonth}日"

/** 1日(日), where the month goes without saying. */
val LocalDate.dayWeekdayText: String
  get() = "$dayText(${weekdayLetter(weekday)})"

/** 2026年11月 */
val YearMonth.yearMonthText: String
  get() = "${year}年${monthValue}月"
