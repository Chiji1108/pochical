package app.pochical

import androidx.compose.material3.Badge
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.chat.LocalChats
import app.pochical.design.Chat
import app.pochical.groups.rememberMeId
import kotlinx.coroutines.flow.flowOf

/** Each place's unread lines that notify, by its id (`Chats.notifyingUnread`), read again as they change. */
@Composable
fun rememberNotifyingUnread(): Map<String, Int> {
  val me = rememberMeId()
  val chats = LocalChats.current
  val unread by remember(chats, me) { me?.let(chats::notifyingUnread) ?: flowOf(emptyMap()) }.collectAsStateWithLifecycle(emptyMap())
  return unread
}

/** Each place's unread lines that notify, read once over the tabs for every badge under them. */
val LocalNotifyingUnread = compositionLocalOf<Map<String, Int>> { emptyMap() }

/**
 * The unread lines each tab's badge counts, as iOS's RootView: グループ the groups' chats', 設定 the
 * chat with Pochical's people's, each as what notifies (spec/sync-protocol.md, Unread summary).
 */
fun tabBadges(unread: Map<String, Int>): Map<RootTab, Int> =
  mapOf(
    RootTab.Groups to unread.filterKeys { it != Chat.supportPlace }.values.sum(),
    RootTab.Settings to (unread[Chat.supportPlace] ?: 0),
  )

/** A tab's badge of [count] unread lines (Material's NavigationBarItem badge), none for none. */
fun tabBadge(count: Int): (@Composable () -> Unit)? = if (count > 0) ({ UnreadBadge(count) }) else null

/**
 * Material's badge of [count] unread lines, 999+ past that as Material's guidance caps it; left out
 * of what TalkBack reads, as what it badges says the count in words.
 */
@Composable
fun UnreadBadge(count: Int, modifier: Modifier = Modifier) {
  Badge(modifier.clearAndSetSemantics {}) { Text(if (count > BADGE_MOST) "$BADGE_MOST+" else count.toString()) }
}

/** The most a badge counts before it says more. */
private const val BADGE_MOST = 999
