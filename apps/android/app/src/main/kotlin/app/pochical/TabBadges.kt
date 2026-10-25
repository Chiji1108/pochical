package app.pochical

import androidx.compose.material3.Badge
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import app.pochical.chat.LocalChats
import app.pochical.design.Chat
import app.pochical.groups.rememberMeId
import kotlinx.coroutines.flow.flowOf

/**
 * The unread lines each tab's badge counts, as iOS's RootView: グループ the groups' chats', 設定 the
 * chat with Pochical's people's, each as what notifies (spec/sync-protocol.md, Unread summary).
 */
@Composable
fun rememberTabBadges(): Map<RootTab, Int> {
  val unread = rememberNotifyingUnread()
  return remember(unread) {
    mapOf(
      RootTab.Groups to unread.filterKeys { it != Chat.supportPlace }.values.sum(),
      RootTab.Settings to (unread[Chat.supportPlace] ?: 0),
    )
  }
}

/** Each place's unread lines that notify, by its id (`Chats.notifyingUnread`), read again as they change. */
@Composable
fun rememberNotifyingUnread(): Map<String, Int> {
  val me = rememberMeId()
  val chats = LocalChats.current
  val unread by remember(chats, me) { me?.let(chats::notifyingUnread) ?: flowOf(emptyMap()) }.collectAsState(emptyMap())
  return unread
}

/** A tab's badge of [count] unread lines (Material's NavigationBarItem badge), none for none. */
fun tabBadge(count: Int): (@Composable () -> Unit)? = if (count > 0) ({ Badge { Text(count.toString()) } }) else null
