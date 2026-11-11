package app.pochical.groups

import app.pochical.calendar.monthDayText
import app.pochical.chat.noticeWords
import app.pochical.kit.groupEndsAt
import app.pochical.string
import app.pochical.v1.ChatNotice
import app.pochical.v1.chatNotice
import app.pochical.vectors
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** How a group's end is worded, in its settings and its chat's lines (spec/vectors/group-end.json). */
@RunWith(RobolectricTestRunner::class)
class GroupEndWordsTest {
  @Test
  fun words() {
    val failed =
      vectors("group-end", "words").mapNotNull { case ->
        val got = LocalDate.parse(case.string("day")).monthDayText(LocalDate.parse(case.string("today")))
        if (got == case.string("expected")) null else "$case: got $got"
      }
    assertEquals("", failed.joinToString("\n"))
  }

  @Test
  fun notices() {
    val resources = RuntimeEnvironment.getApplication().resources
    val kinds =
      mapOf(
        "endSet" to ChatNotice.Kind.KIND_END_SET,
        "endCleared" to ChatNotice.Kind.KIND_END_CLEARED,
        "endsSoon" to ChatNotice.Kind.KIND_ENDS_SOON,
      )
    val failed =
      // The line's end is a moment, which a device words as the day its own clock shows for it.
      listOf("Asia/Tokyo", "Pacific/Honolulu", "Asia/Beirut").map(ZoneId::of).flatMap { zone ->
        vectors("group-end", "notices").mapNotNull { case ->
          val notice = chatNotice {
            kind = kinds.getValue(case.string("kind")!!)
            case.string("day")?.let { endsAtMs = groupEndsAt(LocalDate.parse(it), zone) }
          }
          // The line that the group ends soon is no one's: its author's name is empty, and not said.
          val got = noticeWords(resources, notice, case.string("by").orEmpty(), subject = "", LocalDate.parse(case.string("today")), zone)
          if (got == case.string("expected")) null else "$case in $zone: got $got"
        }
      }
    assertEquals("", failed.joinToString("\n"))
  }
}
