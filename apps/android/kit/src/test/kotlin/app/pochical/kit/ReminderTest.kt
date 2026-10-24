package app.pochical.kit

import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Test

@Serializable
private data class ReminderVectors(
  val patterns: List<Pattern>,
  val firings: List<Firings>,
  val names: List<Named>,
  val remindable: List<Remindable>,
) {
  @Serializable data class Pattern(val id: String, val name: String, val time: List<String>? = null)

  /** A reminder as the vectors write it, either kind's fields in one. */
  @Serializable
  data class VectorReminder(val kind: String, val time: String? = null, val minutes: Int? = null, val skip: List<String>) {
    val reminder: Reminder
      get() =
        Reminder(
          "r",
          skip = skip,
          kind = if (kind == "dayBefore") Reminder.Kind.DayBefore(checkNotNull(time)) else Reminder.Kind.BeforeStart(checkNotNull(minutes)),
        )
  }

  @Serializable data class Day(val shift: String, val start: String? = null, val end: String? = null)

  @Serializable
  data class Firing(val shiftDay: String, val day: String, val time: String, val title: String, val body: String?)

  @Serializable
  data class Firings(
    override val name: String,
    val reminder: VectorReminder,
    val days: Map<String, Day>,
    val from: String,
    val through: String,
    val expected: List<Firing>,
  ) : VectorCase

  @Serializable data class Named(override val name: String, val reminder: VectorReminder, val expected: String) : VectorCase

  @Serializable
  data class Remindable(override val name: String, val reminder: VectorReminder, val expected: List<String>) : VectorCase
}

class ReminderTest {
  private val vectors = vectors<ReminderVectors>("reminders")

  private val patterns =
    vectors.patterns.map {
      PatternRow(it.id, it.name, "⭐️", it.name, "star", 0, it.time?.get(0), it.time?.get(1), it.time == null, null, false)
    }

  private fun calendar(days: Map<String, ReminderVectors.Day>) =
    OwnCalendar(patterns, days.entries.associate { (day, it) -> LocalDate.parse(day) to OwnDay(it.shift, it.start, it.end) }, emptyList())

  @Test
  fun firings() =
    vectors.firings.checkEach({ it.expected }) { case ->
      case.reminder.reminder.firings(calendar(case.days), LocalDate.parse(case.from), LocalDate.parse(case.through)).map {
        ReminderVectors.Firing(
          it.shiftDay.toString(),
          it.day.toString(),
          "%02d:%02d".format(it.minute / 60, it.minute % 60),
          it.title,
          it.body,
        )
      }
    }

  @Test fun names() = vectors.names.checkEach({ it.expected }) { it.reminder.reminder.name }

  @Test
  fun remindable() = vectors.remindable.checkEach({ it.expected }) { case -> case.reminder.reminder.remindable(patterns).map { it.id } }

  @Test
  fun whatIsSentIsWhatComesAfterThroughTheEndSoonestFirst() {
    val zone = ZoneId.of("Asia/Tokyo")
    val calendar = calendar(mapOf("2026-11-02" to ReminderVectors.Day("day"), "2026-11-03" to ReminderVectors.Day("late")))
    val reminders =
      listOf(
        Reminder("evening", kind = Reminder.Kind.DayBefore("21:00")),
        Reminder("before", kind = Reminder.Kind.BeforeStart(60)),
        Reminder("off", on = false, kind = Reminder.Kind.DayBefore("20:00")),
      )
    // The evening's for the 2nd has gone; 開始前 of the 2nd is the morning after.
    val now = ZonedDateTime.of(2026, 11, 1, 21, 0, 0, 0, zone)

    fun sending(through: ZonedDateTime) =
      reminders.sending(calendar, now, through).map { it.reminderId to it.at(zone).toLocalDateTime().toString() }

    assertEquals(
      listOf("before" to "2026-11-02T07:30", "evening" to "2026-11-02T21:00", "before" to "2026-11-02T23:30"),
      sending(now.plusDays(7)),
    )
    // Up to and with the end, as the device wakes for one at its minute.
    assertEquals(listOf("before" to "2026-11-02T07:30", "evening" to "2026-11-02T21:00"), sending(now.plusHours(24)))
  }
}
