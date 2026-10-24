package app.pochical.groups

import app.pochical.Look
import app.pochical.MarkStyle
import app.pochical.kit.GroupMember
import app.pochical.kit.OwnCalendar
import app.pochical.kit.OwnDay
import app.pochical.kit.PatternRow
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
}
