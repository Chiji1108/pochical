package app.pochical.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Badge
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.design.Radius
import app.pochical.groups.LocalValues
import app.pochical.kit.ChatSummary
import app.pochical.kit.GROUP_THREAD
import app.pochical.kit.LineContent

/**
 * 全体チャット in the group's hub (/design's GroupHub, チャット): its latest line, or 下書き： and the
 * draft left in it, and how many of its lines are unread. The rest of the hub's chats, the
 * one-to-one ones, come with the chat list (#826).
 */
@Composable
fun GroupChatRow(groupId: String, me: String, onOpen: () -> Unit) {
  val chats = LocalChats.current
  val values = LocalValues.current
  val members by remember(values, groupId) { values.members(groupId) }.collectAsState(emptyList())
  val summary by remember(chats, groupId, me) { chats.summary(groupId, GROUP_THREAD, me) }.collectAsState(ChatSummary())
  val colors = LocalThemeColors.current
  val names = members.associate { it.userId to it.shownName() }
  ListItem(
    headlineContent = { Text(stringResource(R.string.group_chat), maxLines = 1) },
    supportingContent = {
      val draft = summary.draft
      when {
        draft != null ->
          Row {
            Text(stringResource(R.string.chat_draft), color = colors.dangerDefault)
            Text(draft.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
          }
        summary.waiting?.failed == true -> Text(stringResource(R.string.chat_not_sent), color = colors.dangerDefault, maxLines = 1)
        else -> {
          val mine = stringResource(R.string.chat_me)
          val words = summary.waiting?.let { "$mine：${lineWords(it.content)}" } ?: summary.last?.let { line ->
            when (val content = line.content) {
              is LineContent.Notice -> noticeWords(content.notice, names[line.authorId].orEmpty(), names[content.notice.subjectId].orEmpty())
              LineContent.Unsent -> stringResource(R.string.chat_unsent, names[line.authorId].orEmpty())
              else -> {
                val who = if (line.authorId == me) mine else names[line.authorId].orEmpty()
                "$who：${lineWords(content)}"
              }
            }
          }
          Text(words ?: stringResource(R.string.chat_none), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
      }
    },
    leadingContent = {
      Box(Modifier.size(28.dp).background(colors.accentContainer, RoundedCornerShape(Radius.sm)), contentAlignment = Alignment.Center) {
        Icon(painterResource(R.drawable.ic_forum), contentDescription = null, Modifier.size(16.dp), tint = colors.accentDefault)
      }
    },
    trailingContent = {
      if (summary.unread > 0) Badge(Modifier.padding(start = 8.dp)) { Text("${summary.unread}", style = MaterialTheme.typography.labelSmall) }
    },
    modifier = Modifier.clickable(onClick = onOpen),
  )
}
