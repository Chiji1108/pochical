package app.pochical.groups

import app.pochical.kit.Look
import app.pochical.kit.MarkStyle
import app.pochical.kit.GroupMember
import app.pochical.kit.OwnCalendar
import app.pochical.kit.OwnDay
import app.pochical.kit.PatternRow
import app.pochical.calendar.spokenText
import app.pochical.kit.TimeChange
import app.pochical.name
import app.pochical.string
import app.pochical.vectors
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import app.pochical.kit.Together
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

private val saturday = LocalDate.parse("2026-10-24")
private val sunday = saturday.plusDays(1)

private fun pattern(id: String, off: Boolean) =
  PatternRow(id, id, emoji = "", symbol = "", icon = "", color = 0, start = null, end = null, countsAsOff = off, nextDay = null, archived = false)

private fun member(id: String, days: Map<LocalDate, String>, style: String = "", fill: Boolean = true) =
  GroupMember(
    id,
    id,
    photoId = "",
    markStyle = style,
    markFill = fill,
    calendar = OwnCalendar(listOf(pattern("off", off = true), pattern("day", off = false)), days.mapValues { OwnDay(it.value) }, emptyList()),
  )

class GroupDaysTest {
  @Test
  fun aDayEveryoneIsOffIsTogether() {
    val members = listOf(member("a", mapOf(saturday to "off", sunday to "day")), member("b", mapOf(saturday to "off", sunday to "off")))

    assertEquals(Together(listOf(saturday), unsure = false), groupDays(members, saturday, sunday).together)
  }

  @Test
  fun aDaySomeoneHasNotEnteredLeavesItUnsure() {
    val members = listOf(member("a", mapOf(saturday to "off")), member("b", emptyMap()))

    assertEquals(Together(emptyList(), unsure = true), groupDays(members, saturday, saturday).together)
  }

  @Test
  fun onePersonsDaysOffAreNotShared() {
    assertEquals(Together(emptyList(), unsure = false), groupDays(listOf(member("a", mapOf(saturday to "off"))), saturday, saturday).together)
  }

  @Test
  fun aMembersLegendListsShiftsByStartThenThoseWithoutHoursThenDaysOff() {
    fun timed(id: String, start: String) = pattern(id, off = false).copy(start = start, end = "23:00")
    val patterns = listOf(pattern("休み", off = true), pattern("研修", off = false), timed("夜勤", "17:00"), timed("日勤", "09:00"))
    val member = GroupMember("a", "a", "", "", true, OwnCalendar(patterns, emptyMap(), emptyList()))

    assertEquals(listOf("日勤", "夜勤", "研修", "休み"), legendPatterns(member).map { it.name })
  }

  @Test
  fun aGroupOfUpToFourIsNamedUpToSevenMarkedAndBiggerScrollsSideways() {
    assertEquals(
      listOf(DayRowsDensity.Names, DayRowsDensity.Names, DayRowsDensity.Marks, DayRowsDensity.Marks, DayRowsDensity.Scroll),
      listOf(1, 4, 5, 7, 8).map(DayRowsDensity::of),
    )
  }

  @Test
  fun eachMembersMarksAreDrawnInTheirOwnShapeWithTheViewersColors() {
    val viewer = Look(style = MarkStyle.Icon, fill = true, colored = false)

    assertEquals(Look(MarkStyle.Badge, fill = false, colored = false), viewer.drawing(member("a", emptyMap(), style = "badge", fill = false)))
    // Before theirs is known, the app's default, filled icons, whatever the viewer's.
    assertEquals(
      Look(MarkStyle.Icon, fill = true, colored = false),
      Look(MarkStyle.Emoji, fill = false, colored = false).drawing(member("a", emptyMap())),
    )
  }

  private val words = ShiftWords(unentered = "未入力", early = "早出", late = "残業", moved = "時間変更")

  private fun spoken(shift: JsonObject): String {
    val change = shift["change"]?.takeUnless { it is JsonNull }?.jsonObject
    return spokenShift(
      shift.string("member")!!,
      shift.string("pattern"),
      change?.let { TimeChange(it.getValue("early").jsonPrimitive.boolean, it.getValue("late").jsonPrimitive.boolean) },
      words,
    )
  }

  @Test
  fun aMembersDayIsReadWithItsShiftAndMovedHours() {
    for (case in vectors("spoken-days", "shifts")) assertEquals(case.name(), case.string("expected"), spoken(case))
  }

  @Test
  fun aGroupsDayIsReadWithWhoHasWhichShift() {
    for (case in vectors("spoken-days", "groupDays")) {
      val day = LocalDate.parse(case.string("day"))
      val today = LocalDate.parse(case.string("today"))
      val read =
        spokenGroupDay(
          day.spokenText("今日".takeIf { day == today }, case.string("holiday"), now = today),
          "みんな休み".takeIf { case.getValue("together").jsonPrimitive.boolean },
          case.getValue("shifts").jsonArray.map { spoken(it.jsonObject) },
        )
      assertEquals(case.name(), case.string("expected"), read)
    }
  }
}
