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
import androidx.compose.ui.draw.clip
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
import app.pochical.groups.MemberAvatar
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

/** The face's size beside others' lines. */
private val FACE = 32.dp

/** The room a bubble's tail reaches past its frame, kept beside every line of a run (`BubbleShape`). */
private val TAIL = Radius.lg * BubbleShape.TAIL_REACH

/** The room kept on the side away from the writer, so a bubble never runs the screen's width. */
private val AWAY = 40.dp

@Composable
fun ChatItemRow(
  item: ChatItem,
  me: String?,
  writers: Map<String, GroupMemberRow>,
  direct: Boolean,
  onNotKept: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val deleted = stringResource(R.string.deleted_account)
  val nameOf = { id: String -> writers[id]?.shownName(deleted) ?: deleted }
  when (item) {
    is ChatItem.Typing -> TypingRow(item.userIds.mapNotNull { writers[it] }, modifier)
    is ChatItem.DayTitle -> DayTitle(item.day, modifier)
    ChatItem.Unread -> UnreadDivider(modifier)
    is ChatItem.Line -> {
      val line = item.line
      val by = writers[line.authorId]?.shownName().orEmpty()
      when (val content = line.content) {
        is LineContent.Notice -> AppLine(noticeWords(content.notice, by, writers[content.notice.subjectId]?.shownName().orEmpty()), modifier)
        LineContent.Unsent ->
          AppLine(if (line.authorId == me) stringResource(R.string.chat_unsent_mine) else stringResource(R.string.chat_unsent, by), modifier)
        else ->
          Message(
            mine = line.authorId == me,
            words = lineWords(content, nameOf),
            startsRun = item.startsRun,
            writer = writers[line.authorId].takeIf { line.authorId != me },
            showsName = !direct,
            time = clock(line.sentAtMs).takeIf { item.showsTime },
            status = null,
            modifier = modifier,
          )
      }
    }
    is ChatItem.Waiting ->
      Message(
        mine = true,
        words = lineWords(item.line.content, nameOf),
        startsRun = item.startsRun,
        writer = null,
        showsName = false,
        time = null,
        status = item.line,
        onNotKept = onNotKept,
        modifier = modifier,
      )
  }
}

/** A day's title over its first line: 今日, 昨日, 10月5日(月). */
@Composable
private fun DayTitle(day: LocalDate, modifier: Modifier) {
  val colors = LocalThemeColors.current
  val today = rememberToday()
  val words =
    when (day) {
      today -> stringResource(R.string.today)
      today.minusDays(1) -> stringResource(R.string.chat_yesterday)
      else -> day.fullText
    }
  Box(modifier.fillMaxWidth().padding(top = Chat.runGap.dp), contentAlignment = Alignment.Center) {
    Text(
      words,
      Modifier.background(colors.fillTertiary, RoundedCornerShape(Radius.sm)).padding(horizontal = 12.dp, vertical = 2.dp).semantics { heading() },
      style = MaterialTheme.typography.labelSmall,
      color = colors.textTertiary,
    )
  }
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
 * A message: others' on the start with their face and name over a run, one's own on the end. Its
 * time sits beside it, keeping its room when left to the next line, and a line on its way shows its
 * clock there, or a red ! once not sent, whose menu sends it again or deletes it.
 */
@Composable
private fun Message(
  mine: Boolean,
  words: String,
  startsRun: Boolean,
  writer: GroupMemberRow?,
  showsName: Boolean,
  time: String?,
  status: WaitingLine?,
  modifier: Modifier,
  onNotKept: () -> Unit = {},
) {
  val colors = LocalThemeColors.current
  val shape = remember(mine, startsRun) { BubbleShape(mine, tail = startsRun) }
  Row(
    modifier.fillMaxWidth().padding(top = (if (startsRun) Chat.runGap else Chat.lineGap).dp).semantics(mergeDescendants = true) {},
    horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
  ) {
    if (!mine) {
      Box(Modifier.size(FACE)) {
        if (startsRun && writer != null) MemberAvatar(writer.shownName(), writer.photoId, PhotoShelf.Group(writer.groupId), FACE)
      }
      Spacer(Modifier.width(TAIL))
    } else {
      Spacer(Modifier.width(AWAY))
    }
    Column(Modifier.weight(1f, fill = false), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
      if (!mine && startsRun && showsName && writer != null) {
        Text(
          writer.shownName(),
          Modifier.padding(start = 4.dp, bottom = 2.dp),
          style = MaterialTheme.typography.labelMedium,
          color = colors.textSecondary,
        )
      }
      Row(verticalAlignment = Alignment.Bottom) {
        if (mine) TimeRoom(time, status, onNotKept, Modifier.padding(end = 4.dp))
        Text(
          words,
          Modifier.weight(1f, fill = false)
            .alpha(if (status != null && !status.failed) WAITING_ALPHA else 1f)
            .background(if (mine) colors.accentFill else colors.fillTertiary, shape)
            .padding(horizontal = 12.dp, vertical = 8.dp),
          style = MaterialTheme.typography.bodyLarge,
          color = if (mine) colors.accentOnFill else colors.textPrimary,
        )
        if (!mine) TimeRoom(time, null, onNotKept, Modifier.padding(start = 4.dp))
      }
      if (status?.failed == true) {
        Text(stringResource(R.string.chat_not_sent), style = MaterialTheme.typography.labelSmall, color = colors.dangerDefault)
      }
    }
    if (mine) Spacer(Modifier.width(TAIL)) else Spacer(Modifier.width(AWAY))
  }
}

/**
 * The room for a line's time, kept as wide when the time is left to the next line, so the bubble
 * never widens as it comes: the time, the clock of a line on its way, or the ! of one not sent.
 */
@Composable
private fun TimeRoom(time: String?, waiting: WaitingLine?, onNotKept: () -> Unit, modifier: Modifier) {
  val colors = LocalThemeColors.current
  Box(modifier, contentAlignment = Alignment.BottomCenter) {
    // The room a time takes, drawn only when the line shows its own.
    Text("00:00", Modifier.alpha(0f).clearAndSetSemantics {}, style = MaterialTheme.typography.labelSmall)
    when {
      waiting?.failed == true -> NotSentMark(waiting, onNotKept)
      waiting != null -> {
        val sending = stringResource(R.string.chat_sending)
        Icon(painterResource(R.drawable.ic_schedule), sending, Modifier.size(14.dp), tint = colors.textTertiary)
      }
      time != null -> Text(time, style = MaterialTheme.typography.labelSmall, color = colors.textTertiary)
    }
  }
}

/** The red ! of a line not sent: its menu, headed 送れなかったメッセージ, sends it again or deletes it. */
@Composable
private fun NotSentMark(line: WaitingLine, onNotKept: () -> Unit) {
  val chats = LocalChats.current
  val scope = rememberCoroutineScope()
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
        stringResource(R.string.chat_not_sent_menu),
        Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
        style = MaterialTheme.typography.labelMedium,
        color = colors.textSecondary,
      )
      DropdownMenuItem(
        text = { Text(stringResource(R.string.chat_send_again)) },
        onClick = {
          open = false
          scope.launch { keeping(onNotKept) { chats.sendAgain(line.opId) } }
        },
      )
      DropdownMenuItem(
        text = { Text(stringResource(R.string.chat_delete), color = colors.dangerDefault) },
        onClick = {
          open = false
          scope.launch { keeping(onNotKept) { chats.takeBack(line.opId) } }
        },
      )
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
    MemberAvatar(first.shownName(), first.photoId, PhotoShelf.Group(first.groupId), FACE)
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

/** How dim a line on its way is, as it would be on the chat's ground. */
private const val WAITING_ALPHA = 0.6f

/** How long a typing dot takes to rise. */
private const val DOT_MS = 600
