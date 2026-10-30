package app.pochical.widgets

import app.pochical.calendar.monthWeeks
import app.pochical.calendar.row
import app.pochical.calendar.weekStartingOn
import app.pochical.design.Widgets
import app.pochical.groups.MemberShift
import app.pochical.groups.shifts
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.GroupMember
import app.pochical.kit.NextOff
import app.pochical.kit.OwnCalendar
import app.pochical.kit.ShownDay
import app.pochical.kit.Week
import app.pochical.kit.WidgetDay
import app.pochical.kit.WidgetNow
import app.pochical.kit.WidgetOffs
import app.pochical.kit.WidgetPerson
import app.pochical.kit.opens
import app.pochical.kit.readyCopies
import app.pochical.kit.soonest
import app.pochical.kit.widgetDay
import app.pochical.kit.widgetNow
import app.pochical.kit.widgetOffs
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZonedDateTime

// What the home screen widgets show, worked out ahead of drawing (spec/widgets.md; iOS's
// WidgetEntry.swift; /design's widgetEntry in packages/prototype/src/lib/design-widgets.ts): the
// Glance views draw only from this, never from the person's database. Its days are :kit's
// WidgetDay, whose words and days off spec/vectors/widgets.json pins.

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
  /** いまのシフト at the entry's moment. */
  val now: WidgetNow,
  /** Who the widget is set to, as it shows them. */
  val with: WidgetWith? = null,
  /** これから set to someone: their days beside the person's. */
  val pair: WidgetPair? = null,
  /** The group of someone picked whom the person or they have left: the widget asks for them to be picked again. */
  val pickAgain: String? = null,
)

/**
 * The person's widget entry at [at], for its day, with [companion] whom the widget is set to and
 * [holiday] whether a day is a national holiday of the device's holiday country.
 */
fun OwnCalendar.widgetEntry(
  at: ZonedDateTime,
  week: Week,
  holiday: (LocalDate) -> Boolean,
  companion: WidgetCompanion? = null,
): WidgetEntry {
  val today = at.toLocalDate()
  val weeks = monthWeeks(YearMonth.from(today), week.start)
  val weekStart = today.weekStartingOn(week.start)
  val reached = today.plusDays(Widgets.offLookaheadDays.toLong())
  // From yesterday, whose shift may still be on, as far as いまのシフト looks too.
  val first = minOf(weekStart, weeks.first().first(), today.minusDays(1))
  val last = maxOf(reached, weeks.last().last(), weekStart.plusDays(13), today.plusDays(Widgets.shiftLookaheadDays.toLong()))
  val shown = shown(first, last)
  // Each day worked out once, though the views' days overlap.
  val days = HashMap<LocalDate, WidgetDay>()
  fun day(date: LocalDate): WidgetDay = days.getOrPut(date) { widgetDay(date, shown, week, holiday(date)) }
  // Whose days count with the person's, from today as far as 次の休み looks.
  val shifts = companion?.people.orEmpty().map { it to it.shifts(today, reached) }
  val people =
    shifts.map { (member, theirs) ->
      val offs = theirs.mapValues { it.value.pattern.countsAsOff }
      WidgetPerson(member.name) { offs[it] }
    }
  val group = companion?.with?.kind == WidgetWith.Kind.Group
  val entry = entryOf(at, week, people, group, ::day).copy(nothingEntered = !hasEnteredDays, with = companion?.with)
  return entry.copy(pair = companion?.let { pair(it, shifts.firstOrNull(), entry.upcoming, week, holiday) })
}

/** The day off 次の休み counts: today on a day off, else the next one ahead; none ahead, none. */
val WidgetEntry.soonestOff: NextOff?
  get() = offs.soonest(today)

/** The day 次の休み opens (spec/widgets.md, Opening the app): the day off it counts, else today. */
val WidgetEntry.offOpens: LocalDate
  get() = offs.opens(today)

/** The entry at [at] of the days [day] gives, the week from [week]'s start, with [people] those 次の休み counts with. */
private fun entryOf(at: ZonedDateTime, week: Week, people: List<WidgetPerson>, group: Boolean, day: (LocalDate) -> WidgetDay): WidgetEntry {
  val today = at.toLocalDate()
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
    now = widgetNow(at) { day(today.plusDays(it.toLong())) },
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
          WidgetDay.of(mine.date, ShownDay(shift.pattern.id, shift.start, shift.end), shift.pattern.row, false, week, holiday(mine.date))
        }
      WidgetPairDay(theirs, together = mine.off && theirs?.off == true)
    }
  return WidgetPair(companion.with, companion.me, days, member.markStyle, member.markFill)
}

/**
 * The sample week the picker shows before a widget is placed (/design/widgets' ふつう): 日勤, 夜勤
 * and its 明け, and days off, coming round, in the ready-made patterns.
 */
fun sampleWidgetEntry(at: ZonedDateTime, week: Week): WidgetEntry {
  val today = at.toLocalDate()
  val ids = listOf("day", "day", "night", "after", "off", "off", "day")
  // As iOS's sample: the ready-made patterns, their next days left aside.
  val patterns = readyCopies(ids.distinct(), keeping = emptySet()).associateBy { it.id }
  return entryOf(at, week, emptyList(), group = false) { date ->
    val id = ids[Math.floorMod(date.toEpochDay() - today.toEpochDay(), ids.size)]
    WidgetDay.of(date, ShownDay(id), patterns[id], noted = false, week = week, holiday = false)
  }
}

/** いまのシフト at [at] alone, as the entry works it out: what its turns are counted from. The week only colors the days, so any does. */
fun OwnCalendar.widgetNow(at: ZonedDateTime): WidgetNow {
  val today = at.toLocalDate()
  val shown = shown(today.minusDays(1), today.plusDays(Widgets.shiftLookaheadDays.toLong()))
  return widgetNow(at) { widgetDay(today.plusDays(it.toLong()), shown, Week(), holiday = false) }
}
