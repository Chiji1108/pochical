package app.pochical.chat

import app.pochical.kit.ChatLine
import app.pochical.kit.ChatState
import app.pochical.kit.GROUP_THREAD
import app.pochical.kit.LineContent
import app.pochical.kit.WaitingLine
import app.pochical.v1.ChatNotice
import app.pochical.v1.chatNotice
import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Test

class ChatItemsTest {
  private val zone = ZoneOffset.UTC

  /** A minute in ms on 2026-10-25, UTC. */
  private fun at(minute: Int, second: Int = 0) = LocalDate.of(2026, 10, 25).atStartOfDay(zone).toInstant().toEpochMilli() + minute * 60_000L + second * 1000L

  private fun line(seq: Long, author: String, ms: Long, content: LineContent = LineContent.Words("$seq")) =
    ChatLine(GROUP_THREAD, seq, author, ms, "op-$seq", content)

  private fun shape(items: List<ChatItem>) =
    items.map {
      when (it) {
        is ChatItem.DayTitle -> "day ${it.day}"
        ChatItem.Unread -> "unread"
        is ChatItem.Typing -> "typing"
        is ChatItem.Line -> "${it.line.seq}${if (it.startsRun) " run" else ""}${if (it.showsTime) " time" else ""}"
        is ChatItem.Waiting -> "waiting ${it.line.opId}${if (it.startsRun) " run" else ""}"
      }
    }

  @Test
  fun aRunOfOneWritersLinesShowsItsMinuteOnceByItsLast() {
    val state =
      ChatState(
        lines = listOf(line(1, "u2", at(1)), line(2, "u2", at(1, 30)), line(3, "u2", at(2)), line(4, "me", at(2))),
        waiting = listOf(WaitingLine("w", at(3), LineContent.Words("まだ"))),
        atStart = true,
      )
    assertEquals(
      listOf("day 2026-10-25", "1 run", "2 time", "3 time", "4 run time", "waiting w"),
      shape(chatItems(state, me = "me", unreadFrom = null, zone = zone)),
    )
  }

  @Test
  fun aLineStillBeingSentFromBeforeMidnightTitlesItsDayAgainUnderTheNextDays() {
    val yesterday = at(0) - 60_000L
    val state =
      ChatState(
        lines = listOf(line(1, "u2", yesterday - 60_000L), line(2, "u2", at(1))),
        waiting = listOf(WaitingLine("w", yesterday, LineContent.Words("まだ"))),
        atStart = true,
      )
    val items = chatItems(state, me = "me", unreadFrom = null, zone = zone)
    assertEquals(
      listOf("day 2026-10-24", "1 run time", "day 2026-10-25", "2 run time", "day 2026-10-24", "waiting w run"),
      shape(items),
    )
    // Each item keeps a key of its own, as the list asks of them.
    assertEquals(items.size, items.map { it.key }.toSet().size)
  }

  @Test
  fun unreadStandsOverItsLineAndStartsARun() {
    val state = ChatState(lines = listOf(line(1, "u2", at(1)), line(2, "u2", at(1))), waiting = emptyList(), atStart = true)
    assertEquals(
      listOf("day 2026-10-25", "1 run time", "unread", "2 run time"),
      shape(chatItems(state, me = "me", unreadFrom = 2, zone = zone)),
    )
  }

  @Test
  fun aNoticeSitsApartAndAHiddenLineShowsNothing() {
    val notice = LineContent.Notice(chatNotice { kind = ChatNotice.Kind.KIND_JOINED })
    val state =
      ChatState(
        lines = listOf(line(1, "u2", at(1)), line(2, "u3", at(1), notice), line(3, "u4", at(1), LineContent.Hidden), line(4, "u2", at(1))),
        waiting = emptyList(),
        atStart = true,
      )
    assertEquals(listOf("day 2026-10-25", "1 run time", "2 run time", "4 run time"), shape(chatItems(state, "me", null, zone)))
  }

  @Test
  fun aFoldedLineSitsApartSoTheWritersNextLineShownStartsARun() {
    val state = ChatState(lines = listOf(line(1, "u2", at(1)), line(2, "u2", at(1)), line(3, "u2", at(1))), waiting = emptyList(), atStart = true)
    // The first folded, as a blocked writer's is until shown: the next starts its run with face and name.
    assertEquals(
      listOf("day 2026-10-25", "1 run time", "2 run", "3 time"),
      shape(chatItems(state, "me", null, zone, folded = { it.seq == 1L })),
    )
  }
}
