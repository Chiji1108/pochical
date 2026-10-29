package app.pochical.widgets

import app.pochical.calendar.Pattern
import app.pochical.kit.TimeChange
import app.pochical.kit.hoursText
import app.pochical.calendar.monthWeeks
import app.pochical.calendar.pattern
import app.pochical.kit.timeChange
import app.pochical.calendar.weekStartingOn
import app.pochical.calendar.weekday
import app.pochical.design.Widgets
import app.pochical.groups.MemberShift
import app.pochical.groups.shifts
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.GroupMember
import app.pochical.kit.OwnCalendar
import app.pochical.kit.ShownDay
import app.pochical.kit.Week
import app.pochical.kit.allOff
import app.pochical.kit.mayAllBeOff
import app.pochical.kit.readyCopies
import java.time.LocalDate
import java.time.YearMonth

// What the home screen widgets show, worked out ahead of drawing (spec/widgets.md; iOS's
// WidgetEntry.swift; /design's widgetEntry in packages/prototype/src/lib/design-widgets.ts): the
// Glance views draw only from this, never from the person's database. How each field is worked
// out is pinned by spec/vectors/widgets.json.

/** How a day's date is colored where it stands alone. */
enum class WidgetTone { Holiday, Saturday, Plain }

/** One day of a widget's entry. */
data class WidgetDay(
  val date: LocalDate,
  val tone: WidgetTone,
  /** A national holiday while 祝日 coloring is on: the one date a grid of days colors, Sundays and Saturdays being colored in the weekdays. */
  val holiday: Boolean,
  /** The day's pattern, none where nothing is entered. */
  val pattern: Pattern?,
  /** A day off (休み, 有休), drawn as the calendar draws one. */
  val off: Boolean,
  /** "9:00 – 18:00", for a shift with a time: read aloud, not shown. */
  val time: String?,
  /** What is shown instead, only on a day whose hours differ from its pattern's: 早出 7:00〜, 残業 〜20:00, or the hours alone. */
  val change: String?,
  /** 早出 and 残業, drawn on the mark's corners. */
  val timeChange: TimeChange?,
  /** Whether the day has a memo, which the calendar's stroke says. Its words never come into an entry, nor do the day's people. */
  val noted: Boolean,
) {
  companion object {
    /** A day as the calendar shows it, from what it holds and its pattern. */
    fun of(date: LocalDate, shown: ShownDay?, pattern: Pattern?, noted: Boolean, week: Week, holiday: Boolean): WidgetDay {
      val drawn = pattern?.takeIf { shown != null }
      val standard = drawn?.time
      val moved = timeChange(shown?.start, shown?.end, standard)
      val time = standard?.let { hoursText(shown?.start ?: it.start, shown?.end ?: it.end) }
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

/** Someone or a group a widget is set to, by the name and picture they have in the group they were picked under. */
data class WidgetWith(
  val kind: Kind,
  val name: String,
  val groupId: String,
  /** A person's photo in the group; empty for none. */
  val photoId: String = "",
  /** A group's mark. */
  val mark: GroupMarkValue = GroupMarkValue(),
) {
  enum class Kind { Person, Group }
}

/** Who a widget is set to, with what the group holds of their days. */
class WidgetCompanion(
  val with: WidgetWith,
  /** Whose days count with the person's: the one picked, or the rest of the group. */
  val people: List<GroupMember>,
  /** The person as that group has them. */
  val me: WidgetWith,
)

/** これから's days beside someone's: theirs under each of the person's. */
data class WidgetPair(
  val with: WidgetWith,
  /** The person's own name and photo in that group. */
  val me: WidgetWith,
  /** One for each of the entry's upcoming days. */
  val days: List<WidgetPairDay>,
  /** The shape they draw their marks in, as the group's tables draw them (Look.drawing). */
  val theirMarkStyle: String,
  val theirMarkFill: Boolean,
)

data class WidgetPairDay(
  /** Their day, none where they have not entered it. */
  val theirs: WidgetDay?,
  /** Both are off: one band down the column. */
  val together: Boolean,
)

data class WidgetEntry(
  /** The day the entry is for, a new one each day at midnight. */
  val date: LocalDate,
  /** The person has entered no day at all yet: the widgets then say where their days will come from. */
  val nothingEntered: Boolean,
  val today: WidgetDay,
  val offs: WidgetOffs,
  /** Today and the six days after it. */
  val upcoming: List<WidgetDay>,
  /** This week and the next, from the person's week start. */
  val twoWeeks: List<WidgetDay>,
  /** Whole weeks covering today's month, from the person's week start. */
  val month: List<List<WidgetDay>>,
  /** Who the widget is set to, as it shows them. */
  val with: WidgetWith? = null,
  /** これから set to someone: their days beside the person's. */
  val pair: WidgetPair? = null,
  /** The group of someone picked whom the person or they have left: the widget asks for them to be picked again. */
  val pickAgain: String? = null,
)

/**
 * The person's widget entry for [today], with [companion] whom the widget is set to and [holiday]
 * whether a day is a national holiday of the device's holiday country.
 */
fun OwnCalendar.widgetEntry(
  today: LocalDate,
  week: Week,
  holiday: (LocalDate) -> Boolean,
  companion: WidgetCompanion? = null,
): WidgetEntry {
  val weeks = monthWeeks(YearMonth.from(today), week.start)
  val weekStart = today.weekStartingOn(week.start)
  val reached = today.plusDays(Widgets.offLookaheadDays.toLong())
  val first = minOf(weekStart, weeks.first().first())
  val shown = shown(first, maxOf(reached, weeks.last().last(), weekStart.plusDays(13)))
  // Each day worked out once, though the views' days overlap.
  val days = HashMap<LocalDate, WidgetDay>()
  fun day(date: LocalDate): WidgetDay =
    days.getOrPut(date) {
      val entry = shown[date]
      WidgetDay.of(date, entry, entry?.let { pattern(it.shift)?.pattern }, note(date) != null, week, holiday(date))
    }
  // Whose days count with the person's, from today as far as 次の休み looks.
  val shifts = companion?.people.orEmpty().map { it to it.shifts(today, reached) }
  val people =
    shifts.map { (member, theirs) ->
      val offs = theirs.mapValues { it.value.pattern.countsAsOff }
      WidgetPerson(member.name) { offs[it] }
    }
  val group = companion?.with?.kind == WidgetWith.Kind.Group
  val entry = entryOf(today, week, people, group, ::day).copy(nothingEntered = !hasEnteredDays, with = companion?.with)
  return entry.copy(pair = companion?.let { pair(it, shifts.firstOrNull(), entry.upcoming, week, holiday) })
}

/** The entry for [today] of the days [day] gives, the week from [week]'s start, with [people] those 次の休み counts with. */
private fun entryOf(today: LocalDate, week: Week, people: List<WidgetPerson>, group: Boolean, day: (LocalDate) -> WidgetDay): WidgetEntry {
  val weekStart = today.weekStartingOn(week.start)
  val todayDay = day(today)
  return WidgetEntry(
    date = today,
    nothingEntered = false,
    today = todayDay,
    offs = widgetOffs(todayDay, people, group) { day(today.plusDays(it.toLong())) },
    upcoming = List(7) { day(today.plusDays(it.toLong())) },
    twoWeeks = List(14) { day(weekStart.plusDays(it.toLong())) },
    month = monthWeeks(YearMonth.from(today), week.start).map { it.map(day) },
  )
}

/** これから beside the one picked, [them] with their shifts: their days under the person's, a day both are off together. */
private fun pair(
  companion: WidgetCompanion,
  them: Pair<GroupMember, Map<LocalDate, MemberShift>>?,
  upcoming: List<WidgetDay>,
  week: Week,
  holiday: (LocalDate) -> Boolean,
): WidgetPair? {
  if (companion.with.kind != WidgetWith.Kind.Person) return null
  val (member, shifts) = them ?: return null
  val days =
    upcoming.map { mine ->
      val theirs =
        shifts[mine.date]?.let { shift ->
          WidgetDay.of(mine.date, ShownDay(shift.pattern.id, shift.start, shift.end), shift.pattern, false, week, holiday(mine.date))
        }
      WidgetPairDay(theirs, together = mine.off && theirs?.off == true)
    }
  return WidgetPair(companion.with, companion.me, days, member.markStyle, member.markFill)
}

/**
 * The sample week the picker shows before a widget is placed (/design/widgets' ふつう): 日勤, 夜勤
 * and its 明け, and days off, coming round, in the ready-made patterns.
 */
fun sampleWidgetEntry(today: LocalDate, week: Week): WidgetEntry {
  val ids = listOf("day", "day", "night", "after", "off", "off", "day")
  // As iOS's sample: the ready-made patterns, their next days left aside.
  val patterns = readyCopies(ids.distinct(), keeping = emptySet()).associate { it.id to it.pattern }
  return entryOf(today, week, emptyList(), group = false) { date ->
    val id = ids[Math.floorMod(date.toEpochDay() - today.toEpochDay(), ids.size)]
    WidgetDay.of(date, ShownDay(id), patterns[id], noted = false, week = week, holiday = false)
  }
}
