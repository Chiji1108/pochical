package app.pochical.calendar

import app.pochical.design.ReadyPatterns
import app.pochical.kit.AppDatabase
import app.pochical.kit.OwnEdits
import app.pochical.kit.ShownDay
import app.pochical.v1.DayField
import app.pochical.v1.pattern
import app.pochical.v1.repeatOrder
import java.time.LocalDate
import kotlinx.coroutines.flow.first

/**
 * A month to look at before entering is built, as iOS's SampleDays puts in: Pochical's 二交代制
 * patterns, repeated from last month with the device's holidays off, a memo on two days and changed
 * hours on two 日勤. Put in only when the person has no patterns, and entered as the person would,
 * so it reaches the server and their other devices like anything else they enter.
 */
suspend fun putSampleDays(database: AppDatabase, edits: OwnEdits, today: LocalDate) {
  if (database.values().patterns().first().isNotEmpty()) return
  for (id in listOf("day", "night", "after", "off")) {
    val ready = ReadyPatterns.all.first { it.id == id }
    edits.savePattern(
      id,
      pattern {
        name = ready.name
        emoji = ready.emoji
        symbol = ready.symbol
        icon = ready.icon
        color = ready.color
        ready.time?.let { (start, end) ->
          this.start = start
          this.end = end
        }
        countsAsOff = ready.countsAsOff
        ready.nextDay?.let { nextDay = it }
      },
    )
  }
  val first = today.withDayOfMonth(1)
  edits.setRepeatOrders(
    listOf(
      repeatOrder {
        start = first.minusMonths(1).toString()
        sequence += listOf("day", "day", "night", "after", "off", "off")
        holidaysOff = true
        holidayShift = "off"
        holidayCountry = holidayCountry()
      }
    )
  )
  edits.setDays(
    mapOf(
      first.plusDays(7) to ShownDay("day", end = "20:00"),
      first.plusDays(12) to ShownDay("day", start = "08:00"),
    )
  )
  edits.setDay(first.plusDays(7).toString(), DayField.DAY_FIELD_NOTE, "棚卸し")
  edits.setDay(first.plusDays(15).toString(), DayField.DAY_FIELD_NOTE, "歯医者")
}
