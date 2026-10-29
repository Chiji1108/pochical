package app.pochical.widgets

import app.pochical.calendar.Pattern
import app.pochical.kit.ShiftTime
import app.pochical.kit.ShownDay
import app.pochical.kit.Week
import app.pochical.name
import app.pochical.string
import app.pochical.strings
import app.pochical.vectors
import java.time.LocalDate
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** What a widget's entry says of a day and of days off, as spec/vectors/widgets.json pins it for every platform. */
class WidgetEntryTest {
  private val today = LocalDate.of(2026, 9, 21)

  @Test
  fun saysWhatChangedOfADay() {
    for (case in vectors("widgets", "day")) {
      val time = case.strings("time")?.let { (start, end) -> ShiftTime(start, end) }
      val shown = ShownDay("day", case.string("start"), case.string("end"))
      val day = WidgetDay.of(today, shown, pattern("day", time, off = false), noted = false, week = Week(), holiday = false)
      val expected = case.getValue("expected").jsonObject
      val column = day.columnHours()
      assertEquals(
        case.name(),
        listOf("time", "change", "column", "columnShort").map(expected::string),
        listOf(day.time, day.change, column, column?.let(::withoutWholeHours)),
      )
    }
  }

  @Test
  fun countsTheNextDayOff() {
    for (case in vectors("widgets", "offs")) {
      val me = days(case.getValue("me").jsonObject)
      val people =
        case.getValue("with").jsonArray.map { it.jsonObject }.map { person ->
          val theirs = days(person)
          WidgetPerson(person.string("name")!!) { date -> theirs(date)?.let { it == "off" } }
        }
      fun dayAt(offset: Int): WidgetDay {
        val date = today.plusDays(offset.toLong())
        val kind = me(date)
        return WidgetDay.of(date, kind?.let(::ShownDay), kind?.let { pattern(it, null, off = it == "off") }, false, Week(), false)
      }
      val offs = widgetOffs(dayAt(0), people, case["group"]?.jsonPrimitive?.content == "true", ::dayAt)
      val expected = case.getValue("expected").jsonObject
      val none = expected["none"]?.takeUnless { it is JsonNull }?.jsonObject
      assertEquals(
        case.name(),
        listOf(
          expected.getValue("today").jsonPrimitive.content.toBoolean(),
          expected["next"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.int,
          none?.let { noOff(it) },
        ),
        listOf(offs.today, offs.next?.inDays, offs.none),
      )
    }
  }

  /** Each day's kind by date, "work" or "off", from days keyed by their offset from today and `rest` for the others; null where not entered. */
  private fun days(person: JsonObject): (LocalDate) -> String? {
    val listed = person.getValue("days").jsonObject.mapKeys { it.key.toInt() }
    val rest = person.string("rest")
    return { date ->
      val offset = (date.toEpochDay() - today.toEpochDay()).toInt()
      if (offset in listed) listed[offset]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content else rest
    }
  }

  private fun noOff(none: JsonObject): NoOff =
    when (none.string("kind")) {
      "waiting" -> NoOff.Waiting(none.strings("names")!!)
      "apart" -> NoOff.Apart
      "alone" -> NoOff.Alone
      else -> NoOff.NotEntered
    }

  private fun pattern(id: String, time: ShiftTime?, off: Boolean) =
    Pattern(id = id, name = id, icon = "", emoji = "", symbol = "", color = 0, time = time, countsAsOff = off)
}
