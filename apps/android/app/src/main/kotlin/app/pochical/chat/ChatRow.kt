package app.pochical.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Badge
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.calendar.rememberToday
import app.pochical.calendar.slashText
import app.pochical.design.Radius
import app.pochical.groups.LocalValues
import app.pochical.groups.MemberAvatar
import app.pochical.kit.ChatSummary
import app.pochical.kit.folds
import app.pochical.kit.GROUP_THREAD
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.LineContent
import app.pochical.kit.PhotoShelf
import app.pochical.kit.directThread
import app.pochical.kit.plainText
import java.time.LocalDate
import java.time.ZoneId

/**
 * The hub's チャット (/design's GroupHub; spec/chat.md, The chat's page): 全体チャット, then a
 * one-to-one chat with each member it has been started with (one who left too, so it can still be
 * read), and 個人チャットを始める while someone is left to start one with, all on one card of rows.
 * Whom the user blocked has no one-to-one chat here, nor can one be started.
 */
@Composable
fun ChatList(groupId: String, groupName: String, me: String, onOpen: (threadId: String) -> Unit, modifier: Modifier = Modifier) {
  val chats = LocalChats.current
  val values = LocalValues.current
  val colors = LocalThemeColors.current
  // Null until read, so a group is not taken for a group of one meanwhile.
  val writers by remember(values, groupId) { values.members(groupId) }.collectAsState(null)
  val threads by remember(chats, groupId) { chats.threads(groupId) }.collectAsState(emptySet())
  val blocked by remember(values) { values.blocks() }.collectAsState(emptyList())
  val today = rememberToday()
  val blockedIds = blocked.map { it.userId }.toSet()
  val everyone = writers.orEmpty()
  val names = everyone.associate { it.userId to it.shownName() }
  val talking = everyone.filter { it.userId != me && directThread(me, it.userId) in threads && it.userId !in blockedIds }
  val present = everyone.filter { !it.left }
  val untouched = present.filter { it.userId != me && talking.none { t -> t.userId == it.userId } && it.userId !in blockedIds }
  var starting by rememberSaveable { mutableStateOf(false) }
  Column(modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Column(Modifier.clip(RoundedCornerShape(Radius.xxl)).background(colors.fillQuaternary)) {
      ChatRow(groupId, GROUP_THREAD, me, stringResource(R.string.group_chat), names, blockedIds, onOpen = { onOpen(GROUP_THREAD) }, today = today, onCard = true) {
        Box(Modifier.size(28.dp).background(colors.accentContainer, RoundedCornerShape(Radius.sm)), contentAlignment = Alignment.Center) {
          Icon(painterResource(R.drawable.ic_forum), contentDescription = null, Modifier.size(16.dp), tint = colors.accentDefault)
        }
      }
      for (member in talking) {
        RowRule()
        val thread = directThread(me, member.userId)
        ChatRow(groupId, thread, me, member.shownName(), names, blockedIds, onOpen = { onOpen(thread) }, today = today, onCard = true) {
          MemberAvatar(member.shownName(), if (member.deleted) "" else member.photoId, PhotoShelf.Group(groupId), 28.dp)
        }
      }
      if (untouched.isNotEmpty()) {
        RowRule()
        ListItem(
          headlineContent = { Text(stringResource(R.string.chat_start)) },
          leadingContent = { Icon(painterResource(R.drawable.ic_add), contentDescription = null, Modifier.size(28.dp).padding(2.dp), tint = colors.accentDefault) },
          colors = ListItemDefaults.colors(containerColor = colors.fillQuaternary),
          modifier = Modifier.clickable { starting = true },
        )
      }
    }
    // Alone in the group, why there is no one to talk to one to one.
    if (writers != null && present.size <= 1) {
      Text(
        stringResource(R.string.chat_invite_to_talk),
        Modifier.padding(horizontal = 16.dp),
        style = MaterialTheme.typography.bodySmall,
        color = colors.textTertiary,
      )
    }
  }
  if (starting) {
    StartChatSheet(untouched, groupId, groupName, onDismiss = { starting = false }) { member ->
      starting = false
      onOpen(directThread(me, member.userId))
    }
  }
}

/** A line between rows, from where the words start. */
@Composable
private fun RowRule() {
  HorizontalDivider(Modifier.padding(start = 56.dp, end = 16.dp), color = LocalThemeColors.current.separator)
}

/**
 * A chat in a list of chats (/design's ChatRow): the hub's, on its card ([onCard]), and 設定's chat
 * with Pochical's people. Its mark, its name with a crossed-out bell while its notifications are off,
 * its latest line ([empty] while it has none), or 下書き： and the draft left in it, or the red ! of a
 * line of the member's not sent; its time, and how many of its lines are unread, @ before them when
 * one mentions the reader.
 */
@Composable
internal fun ChatRow(
  groupId: String,
  threadId: String,
  me: String,
  label: String,
  names: Map<String, String>,
  blocked: Set<String>,
  onOpen: () -> Unit,
  today: LocalDate = rememberToday(),
  empty: String = stringResource(R.string.chat_none),
  onCard: Boolean = false,
  icon: @Composable () -> Unit,
) {
  val chats = LocalChats.current
  val colors = LocalThemeColors.current
  val summary by remember(chats, groupId, threadId, me) { chats.summary(groupId, threadId, me) }.collectAsState(ChatSummary())
  val time = summary.waiting?.madeAtMs ?: summary.last?.sentAtMs
  ListItem(
    headlineContent = {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, Modifier.weight(1f, fill = false), maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (summary.muted) {
          Icon(
            painterResource(R.drawable.ic_notifications_off),
            stringResource(R.string.chat_muted),
            Modifier.size(14.dp),
            tint = colors.textTertiary,
          )
        }
      }
    },
    supportingContent = { RowWords(summary, me, names, blocked, empty) },
    leadingContent = icon,
    trailingContent =
      if (time == null && summary.unread == 0) null
      else {
        {
          Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (time != null) Text(listedTime(time, today), style = MaterialTheme.typography.labelSmall, color = colors.textTertiary)
            if (summary.unread > 0) {
              Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                if (summary.mentioned) {
                  val said = stringResource(R.string.chat_mentioned)
                  Box(
                    Modifier.size(18.dp).background(colors.accentFill, CircleShape).semantics { contentDescription = said },
                    contentAlignment = Alignment.Center,
                  ) {
                    Text("@", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = colors.accentOnFill)
                  }
                }
                Badge { Text("${summary.unread}") }
              }
            }
          }
        }
      },
    colors = if (onCard) ListItemDefaults.colors(containerColor = colors.fillQuaternary) else ListItemDefaults.colors(),
    modifier = Modifier.clickable(onClick = onOpen),
  )
}

/**
 * The row's line of words: the draft in place of the latest line, else the member's latest line
 * not sent saying so, else the latest line as the list says it (spec/chat.md, Drafts; Lines on their
 * way; Reporting and blocking).
 */
@Composable
private fun RowWords(summary: ChatSummary, me: String, names: Map<String, String>, blocked: Set<String>, empty: String) {
  val colors = LocalThemeColors.current
  val deleted = stringResource(R.string.deleted_account)
  val nameOf = { id: String -> names[id] ?: deleted }
  val draft = summary.draft
  when {
    draft != null ->
      Row {
        Text(stringResource(R.string.chat_draft), color = colors.dangerDefault, maxLines = 1)
        Text(plainText(draft.text, nameOf), maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    summary.waiting?.failed == true ->
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(painterResource(R.drawable.ic_error), contentDescription = null, Modifier.size(16.dp), tint = colors.dangerDefault)
        Text(stringResource(R.string.chat_not_sent), maxLines = 1)
      }
    else -> {
      val mine = stringResource(R.string.chat_me)
      val waiting = summary.waiting
      val last = summary.last
      val words =
        when {
          waiting != null -> "$mine：${listWords(waiting.content, nameOf)}"
          last == null -> empty
          else ->
            when (val content = last.content) {
              is LineContent.Notice -> noticeWords(content.notice, nameOf(last.authorId), nameOf(content.notice.subjectId))
              LineContent.Unsent ->
                if (last.authorId == me) stringResource(R.string.chat_unsent_mine) else stringResource(R.string.chat_unsent, nameOf(last.authorId))
              // Never the latest line: not the reader's to see (`lastLine`).
              LineContent.Hidden -> stringResource(R.string.chat_none)
              else ->
                when {
                  last.folds(blocked) -> stringResource(R.string.chat_blocked_line)
                  last.authorId == me -> "$mine：${listWords(content, nameOf)}"
                  else -> listWords(content, nameOf)
                }
            }
        }
      Text(words, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
  }
}

/**
 * A line as the list says it: photos as 写真を送りました, days shared or a poll still open as
 * 〜を共有しました, a settled poll its day (/design's lastLine).
 */
@Composable
private fun listWords(content: LineContent, nameOf: (String) -> String): String {
  val words = lineWords(content, nameOf)
  return when (content) {
    is LineContent.Photos -> stringResource(R.string.chat_sent_photos)
    is LineContent.Days -> stringResource(R.string.chat_shared, words)
    is LineContent.Poll -> if (content.poll.decided.isEmpty()) stringResource(R.string.chat_shared, words) else words
    else -> words
  }
}

/** A chat's time in the list: 9:41 today, 昨日, else 10/5 (2025/10/5 in another year). */
@Composable
private fun listedTime(ms: Long, today: LocalDate): String {
  val day = dayOf(ms, ZoneId.systemDefault())
  return when (day) {
    today -> clock(ms)
    today.minusDays(1) -> stringResource(R.string.chat_yesterday)
    else -> day.slashText
  }
}

/** 個人チャットを始める: the members there is no one-to-one chat with yet, the chat being the group's. */
@Composable
private fun StartChatSheet(members: List<GroupMemberRow>, groupId: String, groupName: String, onDismiss: () -> Unit, onPick: (GroupMemberRow) -> Unit) {
  MemberSheet(
    stringResource(R.string.chat_start),
    members.map { SheetMember(it.userId, it.shownName(), it.photoId, PhotoShelf.Group(groupId)) },
    onDismiss,
    // The chat is the group's, with the names and faces it shows.
    note = stringResource(R.string.chat_start_note, groupName),
    onPick = { picked -> members.firstOrNull { it.userId == picked.id }?.let(onPick) },
  )
}
