package app.pochical.calendar

import app.pochical.kit.Period
import java.time.LocalDate
import java.time.YearMonth

// How days are written, in one place so another language changes them
// here (spec/calendar.md, How days are written).

private const val WEEKDAYS = "日月火水木金土"

/** A weekday's one letter, 0 for Sunday through 6 for Saturday. */
fun weekdayLetter(weekday: Int): String = WEEKDAYS[weekday].toString()

// 月と曜日 in English (spec/calendar.md, How days are written; spec/vectors/day-names.json): the
// headings and short labels name months and weekdays as lettered calendars do; sentences stay
// Japanese, their dates with them.

private val ENGLISH_WEEKDAY_LETTERS = listOf("S", "M", "T", "W", "T", "F", "S")
private val ENGLISH_WEEKDAY_NAMES = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
private val ENGLISH_MONTHS =
  listOf("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")

/** A weekday over a column of days: 木, or T, where the column's place tells T from T. */
fun weekdayLetter(weekday: Int, english: Boolean): String = if (english) ENGLISH_WEEKDAY_LETTERS[weekday] else weekdayLetter(weekday)

/** A weekday beside a date: 木, or Thu. */
fun weekdayName(weekday: Int, english: Boolean): String = if (english) ENGLISH_WEEKDAY_NAMES[weekday] else weekdayLetter(weekday)

/** A weekday over a column that does not start the week, as the hub's run from today: 木, or THU. */
fun weekdayHead(weekday: Int, english: Boolean): String = weekdayName(weekday, english).uppercase()

/** A month alone: 11月, or November. */
fun YearMonth.monthTitle(english: Boolean): String = if (english) ENGLISH_MONTHS[monthValue - 1] else monthText

/** The calendar heading's month in English, lower case and cut short as a lettered calendar's: nov., may. */
val YearMonth.headingMonth: String
  get() = ENGLISH_MONTHS[monthValue - 1].lowercase().let { if (it.length > 3) "${it.take(3)}." else it }

/** A month with its year: 2026年11月, or November 2026. */
fun YearMonth.monthWithYear(english: Boolean): String = if (english) "${ENGLISH_MONTHS[monthValue - 1]} $year" else yearMonthText

/** A month in small text: 11月, or Nov. */
fun YearMonth.shortMonth(english: Boolean): String = if (english) ENGLISH_MONTHS[monthValue - 1].take(3) else monthText

/** 11月1日, with the year before it for a day of another year than today's. */
val LocalDate.monthDayText: String
  get() = "${if (year != LocalDate.now().year) "${year}年" else ""}${monthValue}月${dayOfMonth}日"

/** 11月1日(日) */
val LocalDate.fullText: String
  get() = "$monthDayText(${weekdayLetter(weekday)})"

/** 11/1 where room is short, 2026/11/1 for a day of another year than today's. */
val LocalDate.slashText: String
  get() = "${if (year != LocalDate.now().year) "$year/" else ""}$monthValue/$dayOfMonth"

/** 1日, where the month goes without saying. */
val LocalDate.dayText: String
  get() = "${dayOfMonth}日"

/** 1日(日), where the month goes without saying. */
val LocalDate.dayWeekdayText: String
  get() = "$dayText(${weekdayLetter(weekday)})"

/** 11月, where the year goes without saying. */
val YearMonth.monthText: String
  get() = "${monthValue}月"

/** 11月 in [thisMonth]'s year, 2027年1月 in another. */
fun YearMonth.shortText(thisMonth: YearMonth): String = if (year == thisMonth.year) monthText else yearMonthText

/** 2026年11月 */
val YearMonth.yearMonthText: String
  get() = "${year}年${monthValue}月"

// A シフトの期間's page by its days, never a month's name, which would read as the month's own days
// (spec/calendar.md, How days are written; spec/vectors/periods.json, written).

/** 11/1, whatever the year: a period's day, with its year written apart. */
private val LocalDate.monthDaySlash: String
  get() = "$monthValue/$dayOfMonth"

/** 11月1日, whatever the year. */
private val LocalDate.monthDayKanji: String
  get() = "${monthValue}月${dayOfMonth}日"

/** 11/1, as a period's page dates the 1st of a month inside it, in English too. */
val LocalDate.periodDayText: String
  get() = monthDaySlash

/** 10/15〜11/14 */
val Period.text: String
  get() = "${first.monthDaySlash}〜${last.monthDaySlash}"

/** 2026/10/15〜11/14, its last day's year too in another year. */
val Period.yearText: String
  get() = "${first.year}/${first.monthDaySlash}〜${if (last.year == first.year) "" else "${last.year}/"}${last.monthDaySlash}"

/** 2026年10月15日〜11月14日, titling a picture of it. */
val Period.fullText: String
  get() = "${first.year}年${first.monthDayKanji}〜${if (last.year == first.year) "" else "${last.year}年"}${last.monthDayKanji}"

/** The picture's title: its full text, or Oct 15 – Nov 14, 2026 with 月と曜日 in English. */
fun Period.title(english: Boolean): String {
  if (!english) return fullText
  fun day(day: LocalDate) = "${YearMonth.from(day).shortMonth(true)} ${day.dayOfMonth}"
  return if (first.year == last.year) "${day(first)} – ${day(last)}, ${last.year}" else "${day(first)}, ${first.year} – ${day(last)}, ${last.year}"
}

/** A period's day as the calendar's heading writes it: 10/15, or oct. 15. */
fun LocalDate.headingDay(english: Boolean): String = if (english) "${YearMonth.from(this).headingMonth} $dayOfMonth" else monthDaySlash
