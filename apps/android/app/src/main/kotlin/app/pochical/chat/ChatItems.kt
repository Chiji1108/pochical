package app.pochical.chat

import app.pochical.kit.ChatLine
import app.pochical.kit.ChatState
import app.pochical.kit.LineContent
import app.pochical.kit.TimedLine
import app.pochical.kit.WaitingLine
import app.pochical.kit.chatOrder
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

// What a chat's lines show, in order (spec/chat.md, In a message; Unread lines and typing): each
// day's title, ここから新着, and the lines, each knowing whether it starts a run of one writer's and
// whether its time shows, kept apart from how they are drawn.

/** One thing in a chat's list of lines, by a key that stays as the list changes. */
sealed interface ChatItem {
  val key: String

  /**
   * The title over a day's first line, by the key of the line it heads ([heads]): a day can head
   * the lines twice, as a line still being sent comes after every other, the next day's too.
   */
  data class DayTitle(val day: LocalDate, val heads: String) : ChatItem {
    override val key
      get() = "day-$heads"
  }

  /** ここから新着, over the first unread line as the chat opened. */
  data object Unread : ChatItem {
    override val key
      get() = "unread"
  }

  /**
   * A line the group holds: [startsRun] for the first of a run of one writer's, by their face and
   * name, and [showsTime] unless the next line goes on its run in the same minute.
   */
  data class Line(val line: ChatLine, val startsRun: Boolean, val showsTime: Boolean = true) : ChatItem {
    override val key
      get() = lineKey(line.opId, line.seq)
  }

  /** Who is writing, under the latest line (spec/chat.md, Unread lines and typing). */
  data class Typing(val userIds: List<String>) : ChatItem {
    override val key
      get() = "typing"
  }

  /** One of the member's lines on its way, by the same key as the group's line it becomes. */
  data class Waiting(val line: WaitingLine, val startsRun: Boolean) : ChatItem {
    override val key
      get() = lineKey(line.opId, null)
  }
}

/** A line's key: its send's op_id, so the line shown while it waited stays as the group's comes. */
private fun lineKey(opId: String, seq: Long?) = if (opId.isNotEmpty()) "line-$opId" else "seq-$seq"

/** The day a moment falls on where the device is. */
fun dayOf(ms: Long, zone: ZoneId): LocalDate = Instant.ofEpochMilli(ms).atZone(zone).toLocalDate()

/**
 * What the chat [state] shows for [me], oldest first: a line still being sent last, one not sent
 * where it was written (`chatOrder`), the day's title before each day's first line, and ここから新着
 * over [unreadFrom]. A line never delivered to the reader shows nothing, so it is left out; one
 * [folded] to ブロック中のメンバーのメッセージ stands apart from the runs, as a notice does.
 */
fun chatItems(state: ChatState, me: String?, unreadFrom: Long?, zone: ZoneId = ZoneId.systemDefault(), folded: (ChatLine) -> Boolean = { false }): List<ChatItem> {
  val lines =
    chatOrder<ChatItem>(
      sent = state.lines.filter { it.content != LineContent.Hidden }.map { TimedLine(ChatItem.Line(it, false), it.sentAtMs) },
      waiting = state.waiting.map { TimedLine(ChatItem.Waiting(it, false), it.madeAtMs, it.failed) },
    )
  val items = mutableListOf<ChatItem>()
  var lastDay: LocalDate? = null
  var lastWriter: String? = null
  for (item in lines) {
    val (at, writer, replies) =
      when (item) {
        is ChatItem.Line -> Triple(item.line.sentAtMs, item.line.authorId.takeIf { isMessage(item.line) && !folded(item.line) }, item.line.replyTo != null)
        is ChatItem.Waiting -> Triple(item.line.madeAtMs, me, item.line.replyTo != null)
        else -> continue
      }
    val day = dayOf(at, zone)
    var starts = writer != lastWriter
    if (day != lastDay) {
      items += ChatItem.DayTitle(day, item.key)
      lastDay = day
      starts = true
    }
    lastWriter = writer
    val unread = item is ChatItem.Line && item.line.seq == unreadFrom
    if (unread) items += ChatItem.Unread
    // A reply starts a run, as its quote begins it.
    val runs = starts || unread || replies
    items += if (item is ChatItem.Line) item.copy(startsRun = runs) else (item as ChatItem.Waiting).copy(startsRun = runs)
  }
  return withTimes(items, zone)
}

/** A line someone wrote, not one the chat words itself: a notice or a line taken back sits apart from the runs. */
fun isMessage(line: ChatLine): Boolean = line.content !is LineContent.Notice && line.content != LineContent.Unsent

/**
 * The lines with their times: a message's is left to the next when that goes on its run in the
 * same minute, as LINE shows one time for them (spec/chat.md, In a message).
 */
private fun withTimes(items: List<ChatItem>, zone: ZoneId): List<ChatItem> =
  items.mapIndexed { index, item ->
    val next = items.getOrNull(index + 1)
    if (item !is ChatItem.Line || next !is ChatItem.Line || next.startsRun || !isMessage(item.line)) return@mapIndexed item
    val minute = { ms: Long -> Instant.ofEpochMilli(ms).atZone(zone).truncatedTo(ChronoUnit.MINUTES) }
    if (minute(item.line.sentAtMs) == minute(next.line.sentAtMs)) item.copy(showsTime = false) else item
  }
