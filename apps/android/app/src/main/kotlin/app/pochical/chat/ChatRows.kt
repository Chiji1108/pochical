package app.pochical.chat

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.calendar.fullText
import app.pochical.calendar.rememberToday
import app.pochical.design.Chat
import app.pochical.design.Radius
import app.pochical.kit.ChatLine
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.LineContent
import app.pochical.kit.PhotoShelf
import app.pochical.kit.WaitingLine
import app.pochical.kit.plainText
import app.pochical.v1.ChatNotice
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

// How each of a chat's items is drawn (spec/chat.md, In a message; Notices; Lines on their way):
// lines of words with their writer's face and name over a run, and what stands for the parts the
// chat's lines draw later (#826, #827) in a line of words, as a quote reads them.

/** One of the chat's items as it is drawn, a message by its [look] and what the chat's [handlers] do with it. */
@Composable
fun ChatItemRow(item: ChatItem, look: MessageLook?, writers: Map<String, GroupMemberRow>, me: String?, handlers: MessageHandlers, modifier: Modifier = Modifier) {
  when (item) {
    is ChatItem.Typing -> TypingRow(item.userIds.mapNotNull { writers[it] }, modifier)
    // Taken over by the floating day, read in its layer, so the row is not drawn again as the list scrolls.
    is ChatItem.DayTitle -> DayTitle(item.day, modifier.graphicsLayer { alpha = if (handlers.takenTitle() == item.key) 0f else 1f })
    ChatItem.Unread -> UnreadDivider(modifier)
    is ChatItem.Line -> {
      val line = item.line
      val by = handlers.nameOf(line.authorId)
      when (val content = line.content) {
        is LineContent.Notice -> AppLine(noticeWords(content.notice, by, handlers.nameOf(content.notice.subjectId)), modifier)
        LineContent.Unsent ->
          AppLine(if (line.authorId == me) stringResource(R.string.chat_unsent_mine) else stringResource(R.string.chat_unsent, by), modifier)
        else ->
          when {
            handlers.folded(line) -> FoldedLine({ handlers.showFolded(line.seq) }, modifier)
            look != null -> Message(look, handlers, modifier)
          }
      }
    }
    is ChatItem.Waiting -> if (look != null) Message(look, handlers, modifier)
  }
}

/** A day's title over its first line: 今日, 昨日, 10月5日(月), a heading for a screen reader to go by. */
@Composable
private fun DayTitle(day: LocalDate, modifier: Modifier) {
  Box(modifier.fillMaxWidth().padding(top = Chat.runGap.dp), contentAlignment = Alignment.Center) {
    DayWords(day, Modifier.semantics { heading() })
  }
}

/**
 * A day as the chat says it, 今日, 昨日 or 10月5日(月), on its quiet ground: a day's title, or the day
 * floating over the lines ([floating]), on the surface a piece over them stands on.
 */
@Composable
fun DayWords(day: LocalDate, modifier: Modifier = Modifier, floating: Boolean = false) {
  val colors = LocalThemeColors.current
  Text(
    dayWords(day),
    modifier
      .background(if (floating) MaterialTheme.colorScheme.surfaceContainerHighest else colors.fillTertiary, RoundedCornerShape(Radius.sm))
      .padding(horizontal = 12.dp, vertical = 2.dp),
    style = MaterialTheme.typography.labelSmall,
    color = if (floating) colors.textSecondary else colors.textTertiary,
  )
}

/** ここから新着, a rule either side, in the accent. */
@Composable
private fun UnreadDivider(modifier: Modifier) {
  val accent = LocalThemeColors.current.accentDefault
  Row(modifier.fillMaxWidth().padding(top = Chat.runGap.dp, start = 8.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
    HorizontalDivider(Modifier.weight(1f), color = accent)
    Text(
      stringResource(R.string.chat_unread_from),
      Modifier.padding(horizontal = 12.dp).semantics { heading() },
      style = MaterialTheme.typography.labelMedium,
      color = accent,
    )
    HorizontalDivider(Modifier.weight(1f), color = accent)
  }
}

/** A day as the chat says it: 今日, 昨日, 10月5日(月). */
@Composable
fun dayWords(day: LocalDate): String {
  val today = rememberToday()
  return when (day) {
    today -> stringResource(R.string.today)
    today.minusDays(1) -> stringResource(R.string.chat_yesterday)
    else -> day.fullText
  }
}

/** A line the app words, centered between the messages in the tertiary color, starting the run after it. */
@Composable
private fun AppLine(words: String, modifier: Modifier) {
  Text(
    words,
    modifier.fillMaxWidth().padding(top = Chat.runGap.dp, start = 24.dp, end = 24.dp),
    style = MaterialTheme.typography.labelMedium,
    color = LocalThemeColors.current.textTertiary,
    textAlign = TextAlign.Center,
  )
}

/**
 * The room for a line's time, kept as wide when the time is left to the next line, so the bubble
 * never widens as it comes: the time, the clock of a line on its way, or the ! of one not sent;
 * 編集済み over it once the line's words were changed.
 */
@Composable
internal fun TimeRoom(time: String?, waiting: WaitingLine?, edited: Boolean, pinned: Boolean, notSentItems: List<LineMenuItem>, modifier: Modifier) {
  val colors = LocalThemeColors.current
  Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
    // 編集済み and the pin on one line, over the time.
    if (edited || pinned) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        if (pinned) Icon(painterResource(R.drawable.ic_push_pin), stringResource(R.string.chat_pinned_line), Modifier.size(12.dp), tint = colors.textTertiary)
        if (edited) Text(stringResource(R.string.chat_edited), style = MaterialTheme.typography.labelSmall, color = colors.textTertiary)
      }
    }
    TimeOrMark(time, waiting, notSentItems)
  }
}

@Composable
private fun TimeOrMark(time: String?, waiting: WaitingLine?, notSentItems: List<LineMenuItem>) {
  val colors = LocalThemeColors.current
  Box(contentAlignment = Alignment.BottomCenter) {
    // The room a time takes, drawn only when the line shows its own.
    Text("00:00", Modifier.alpha(0f).clearAndSetSemantics {}, style = MaterialTheme.typography.labelSmall)
    when {
      waiting?.failed == true -> NotSentMark(notSentItems, photos = waiting.content is LineContent.Photos)
      waiting != null -> {
        val sending = stringResource(R.string.chat_sending)
        Icon(painterResource(R.drawable.ic_schedule), sending, Modifier.size(14.dp), tint = colors.textTertiary)
      }
      time != null -> Text(time, style = MaterialTheme.typography.labelSmall, color = colors.textTertiary)
    }
  }
}

/** The red ! of a line not sent: its menu, headed 送れなかったメッセージ (送れなかった写真 for photos), sends it again or deletes it. */
@Composable
private fun NotSentMark(items: List<LineMenuItem>, photos: Boolean) {
  var open by remember { mutableStateOf(false) }
  val colors = LocalThemeColors.current
  Box {
    Icon(
      painterResource(R.drawable.ic_error),
      stringResource(R.string.chat_not_sent),
      Modifier.size(20.dp).clip(CircleShape).clickable { open = true },
      tint = colors.dangerDefault,
    )
    DropdownMenu(open, onDismissRequest = { open = false }) {
      Text(
        stringResource(if (photos) R.string.chat_photo_not_sent_menu else R.string.chat_not_sent_menu),
        Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
        style = MaterialTheme.typography.labelMedium,
        color = colors.textSecondary,
      )
      // The same items as the line's long press, one list for both.
      for (item in items) {
        DropdownMenuItem(
          text = { Text(item.label, color = if (item.destructive) colors.dangerDefault else Color.Unspecified) },
          onClick = {
            open = false
            item.run()
          },
        )
      }
    }
  }
}

/** Someone writing: three dots rising in turn, in a bubble of the others' kind with their face, under the latest line. */
@Composable
fun TypingRow(typers: List<GroupMemberRow>, modifier: Modifier = Modifier) {
  val first = typers.firstOrNull() ?: return
  val colors = LocalThemeColors.current
  val deleted = stringResource(R.string.deleted_account)
  val said = stringResource(R.string.chat_typing, typers.joinToString("、") { it.shownName(deleted) })
  val transition = rememberInfiniteTransition(label = "typing")
  Row(modifier.fillMaxWidth().padding(top = Chat.runGap.dp).clearAndSetSemantics { contentDescription = said }) {
    Face(first.userId, first.shownName(), first.photoId, PhotoShelf.place(first.groupId), FACE)
    Spacer(Modifier.width(TAIL))
    Row(
      Modifier.background(colors.fillTertiary, BubbleShape(mine = false, tail = true)).padding(horizontal = 14.dp, vertical = 14.dp),
      horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      repeat(3) { dot ->
        val rise by
          transition.animateFloat(
            0f,
            -4f,
            infiniteRepeatable(tween(DOT_MS), RepeatMode.Reverse, StartOffset(dot * DOT_MS / 3)),
            label = "dot",
          )
        Box(Modifier.offset { IntOffset(0, rise.dp.roundToPx()) }.size(7.dp).background(colors.textTertiary, CircleShape))
      }
    }
  }
}

/**
 * A line as a line of words reads it, as a quote and the chat list read it, each mention as @ and
 * the member's name ([nameOf]) (spec/chat.md).
 */
@Composable
fun lineWords(content: LineContent, nameOf: (String) -> String): String =
  when (content) {
    is LineContent.Words -> plainText(content.text, nameOf)
    is LineContent.Photos ->
      if (content.photos.size > 1) stringResource(R.string.chat_photos_count, content.photos.size) else stringResource(R.string.chat_photos)
    is LineContent.Days -> {
      val first = content.days.firstOrNull()?.let { LocalDate.parse(it).fullText }.orEmpty()
      if (content.days.size > 1) stringResource(R.string.chat_days_more, first) else stringResource(R.string.chat_days, first)
    }
    is LineContent.Poll -> {
      val poll = content.poll
      if (poll.decided.isNotEmpty()) stringResource(R.string.chat_poll_decided, LocalDate.parse(poll.decided).fullText)
      else stringResource(R.string.chat_poll, poll.daysList.firstOrNull()?.let { LocalDate.parse(it).fullText }.orEmpty())
    }
    is LineContent.Notice,
    LineContent.Unsent,
    LineContent.Hidden -> ""
  }

/** A notice's words, [by] and [subject] the names the group shows now (spec/chat.md, Notices). */
@Composable
fun noticeWords(notice: ChatNotice, by: String, subject: String): String =
  when (notice.kind) {
    ChatNotice.Kind.KIND_JOINED -> stringResource(R.string.chat_notice_joined, by)
    ChatNotice.Kind.KIND_LEFT -> stringResource(R.string.chat_notice_left, by)
    ChatNotice.Kind.KIND_REMOVED -> stringResource(R.string.chat_notice_removed, by, subject)
    ChatNotice.Kind.KIND_REMOVED_BY_POCHICAL -> stringResource(R.string.chat_notice_removed_by_pochical, by)
    ChatNotice.Kind.KIND_INVITE_REMADE -> stringResource(R.string.chat_notice_invite_remade, by)
    else ->
      when {
        notice.name.isNotEmpty() && notice.markChanged -> stringResource(R.string.chat_notice_renamed_and_mark, by, notice.name)
        notice.name.isNotEmpty() -> stringResource(R.string.chat_notice_renamed, by, notice.name)
        else -> stringResource(R.string.chat_notice_mark, by)
      }
  }

/** The time by a line: 9:41. */
fun clock(ms: Long, zone: ZoneId = ZoneId.systemDefault()): String {
  val time = Instant.ofEpochMilli(ms).atZone(zone)
  return "${time.hour}:%02d".format(time.minute)
}

/**
 * Runs the person's [edit] of a chat, saying 保存できませんでした ([notKept]) when the device could
 * not keep it (spec/chat.md, Lines on their way).
 */
suspend fun keeping(notKept: () -> Unit, edit: suspend () -> Unit) {
  try {
    edit()
  } catch (e: CancellationException) {
    throw e
  } catch (_: Exception) {
    notKept()
  }
}

/** How long a typing dot takes to rise. */
private const val DOT_MS = 600
