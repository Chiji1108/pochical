package app.pochical.kit

import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A reminder of the person's own shifts (spec/calendar.md, Reminders; iOS's Reminder.swift): a
 * notification the device sends by itself, kept on the device like an alarm, several at once, each
 * on or off. It goes off the evening before a day with a shift (前日), or some time before the
 * shift starts (開始前), which only days with a time have. Like an alarm's days, it keeps the shifts
 * it skips, so a pattern added later is reminded of until it is turned off.
 */
@Serializable
data class Reminder(val id: String, val on: Boolean = true, val skip: List<String> = emptyList(), val kind: Kind) {
  @Serializable
  sealed interface Kind {
    /** The evening before, at "HH:MM". */
    @Serializable @SerialName("dayBefore") data class DayBefore(val time: String) : Kind

    /** This many minutes before the shift starts. */
    @Serializable @SerialName("beforeStart") data class BeforeStart(val minutes: Int) : Kind
  }

  /** The patterns it can go off for: every one the evening before, only those with a time before they start. */
  fun remindable(patterns: List<PatternRow>): List<PatternRow> =
    when (kind) {
      is Kind.DayBefore -> patterns
      is Kind.BeforeStart -> patterns.filter { it.time != null }
    }

  /** What it is, as its row says: 前日 21:00, or 開始の1時間前. */
  val name: String
    get() =
      when (kind) {
        is Kind.DayBefore -> "前日 ${kind.time.removePrefix("0")}"
        is Kind.BeforeStart -> "開始の${beforeText(kind.minutes)}前"
      }

  /**
   * When it goes off for the shift [shown] on [day], of [pattern], if it does: for a shift it does
   * not skip, 前日 on every day with one, days off too, and 開始前 only for a shift with a time.
   */
  fun firing(day: LocalDate, shown: ShownDay, pattern: PatternRow): ReminderFiring? {
    if (shown.shift in skip) return null
    val (at, minute) =
      when (kind) {
        is Kind.DayBefore -> day.minusDays(1) to minutes(kind.time)
        is Kind.BeforeStart -> {
          val start = minutes(shown.start ?: pattern.time?.start ?: return null) - kind.minutes
          if (start < 0) day.minusDays(1) to start + MINUTES_A_DAY else day to start
        }
      }
    val time = pattern.time
    val shift = shiftText(shown, pattern.name, time)
    val title =
      when (kind) {
        is Kind.DayBefore -> "明日は$shift"
        is Kind.BeforeStart -> "あと${beforeText(kind.minutes)}で$shift"
      }
    val body = time?.let { hoursText(shown.start ?: it.start, shown.end ?: it.end) }
    return ReminderFiring(id, day, at, minute, title, body, shift)
  }

  /** Its firings for the shifts from [from] through [through] of [calendar], in order. */
  fun firings(calendar: OwnCalendar, from: LocalDate, through: LocalDate): List<ReminderFiring> =
    calendar.shown(from, through).entries.sortedBy { it.key }.mapNotNull { (day, shown) ->
      calendar.pattern(shown.shift)?.let { firing(day, shown, it) }
    }

  companion object {
    const val DEFAULT_TIME = "21:00"
    const val DEFAULT_MINUTES = 60

    /** 開始前's choices, as the platforms' alert choices offer them. */
    val MINUTES_CHOICES = listOf(15, 30, 60, 90, 120, 180)

    /** One to start with: the evening before at 21:00. */
    val defaults = listOf(Reminder("reminder-0", kind = Kind.DayBefore(DEFAULT_TIME)))

    /** How long before: 15分, 1時間, 1時間30分. */
    fun beforeText(minutes: Int): String {
      val hours = minutes / 60
      val rest = minutes % 60
      return when {
        hours == 0 -> "${rest}分"
        rest == 0 -> "${hours}時間"
        else -> "${hours}時間${rest}分"
      }
    }

    private const val MINUTES_A_DAY = 24 * 60
  }
}

/** A notification a reminder sends: when it arrives, on the device's clock, and what it says. */
data class ReminderFiring(
  val reminderId: String,
  /** The day of the shift it is about. */
  val shiftDay: LocalDate,
  /** The day it arrives, and the minute of that day. */
  val day: LocalDate,
  val minute: Int,
  /** The shift as its title: 明日は日勤, or あと1時間で日勤. */
  val title: String,
  /** The shift's time, if it has one: 8:30 – 17:30. */
  val body: String?,
  /** The shift by name, its 早出 or 残業 said: 日勤（残業）. */
  val shift: String,
) {
  /** When it arrives in [zone]; a minute the clocks skip that day comes as they go on. */
  fun at(zone: ZoneId): ZonedDateTime = day.atTime(minute / 60, minute % 60).atZone(zone)
}

/**
 * What the reminders that are on send after [now], soonest first, for the shifts through [days]
 * from today: what the device has the system wake it for.
 */
fun List<Reminder>.upcoming(calendar: OwnCalendar, now: ZonedDateTime, days: Long): List<ReminderFiring> {
  val today = now.toLocalDate()
  return filter { it.on }
    .flatMap { it.firings(calendar, today, today.plusDays(days)) }
    .filter { it.at(now.zone) > now }
    .sortedBy { it.at(now.zone) }
}

/** The pattern's standard hours; none for a pattern without a time. */
val PatternRow.time: ShiftTime?
  get() = start?.let { start -> end?.let { ShiftTime(start, it) } }

/**
 * The shift by name, with the day's own 早出 or 残業 always said, as the calendar marks them: the
 * time alone looks like any other day's.
 */
private fun shiftText(shown: ShownDay, name: String, time: ShiftTime?): String {
  val change = timeChange(shown.start, shown.end, time)
  val moves = listOfNotNull(if (change?.early == true) "早出" else null, if (change?.late == true) "残業" else null)
  return if (moves.isEmpty()) name else "$name（${moves.joinToString("・")}）"
}
