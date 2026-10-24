package app.pochical.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.pochical.LocalAccount
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.design.SyncSocket
import app.pochical.groups.HoldSocket
import app.pochical.groups.LocalValues
import app.pochical.groups.rememberMeId
import app.pochical.kit.ChatSocket
import app.pochical.kit.ChatState
import app.pochical.kit.Chats
import app.pochical.kit.GROUP_THREAD
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.GroupRow
import app.pochical.kit.SocketState
import app.pochical.kit.firstComing
import app.pochical.kit.firstUnread
import app.pochical.kit.otherIn
import app.pochical.kit.pageAfter
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

/** The chats as the screens read and write them. */
val LocalChats = staticCompositionLocalOf<Chats> { error("No chats provided") }

/**
 * A chat (spec/chat.md, The chat's page; Unread lines and typing): its lines from the foot up, as
 * Compose's LazyColumn lays them out reversed, so it opens at the latest, keeps the lines seen where
 * they are as earlier ones come in above, and the keyboard never hides the latest. It holds its
 * group's socket while it shows.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalCoroutinesApi::class)
@Composable
fun ChatPage(groupId: String, threadId: String, onBack: () -> Unit) {
  HoldSocket(groupId)
  val chats = LocalChats.current
  val account = LocalAccount.current
  val values = LocalValues.current
  val me = rememberMeId()
  val members by remember(values, groupId) { values.members(groupId) }.collectAsState(emptyList())
  val groups by remember(values) { values.groups() }.collectAsState(emptyList())
  val blocked by remember(values) { values.blocks() }.collectAsState(emptyList())
  val socket by remember(account, groupId) { account.chatSocket(groupId) }.collectAsState(null)

  // Where the chat is, kept across a rotation and the process's death: the first line laid out,
  // the line ここから新着 is over as it opened, and the line the lines rest on at the foot.
  var from by rememberSaveable { mutableStateOf<Long?>(null) }
  var unreadFrom by rememberSaveable { mutableStateOf<Long?>(null) }
  var opened by rememberSaveable { mutableStateOf(false) }
  var restingOn by rememberSaveable { mutableStateOf<String?>(null) }
  var restingOffset by rememberSaveable { mutableIntStateOf(0) }

  val fromFlow = remember { snapshotFlow { from } }
  val state by
    remember(chats, groupId, threadId, me) { fromFlow.flatMapLatest { chats.state(groupId, threadId, me, it) } }.collectAsState(null)
  val chat = state ?: return ChatScaffold(groupId, threadId, members, groups, socket, onBack) {}

  // Others writing, shown for chatRules.typingShowMs unless said again; a blocked member's is not.
  val typers = rememberTypers(socket, threadId, me, blocked.map { it.userId }.toSet())
  // From the foot up, as the list lays them out, who is writing at the very foot: an item's index
  // here is its index in the list.
  val items =
    remember(chat, me, unreadFrom, typers) {
      val lines = chatItems(chat, me, unreadFrom).asReversed()
      if (typers.isEmpty()) lines else listOf(ChatItem.Typing(typers)) + lines
    }
  val list = rememberLazyListState()
  // Shown once placed where it opens, so the way there is not seen.
  var placed by remember { mutableStateOf(false) }
  // Whether the chat follows its latest line: the person's, stopped as they scroll.
  var following by remember { mutableStateOf(true) }
  // The person has scrolled since the chat opened: only then are earlier lines laid out.
  var touched by remember { mutableStateOf(false) }
  val writers = remember(members) { members.associateBy { it.userId } }
  // Where the lines are to go once laid out as they are now: ここから新着 at the top, or the foot.
  var going by remember { mutableStateOf<Going?>(null) }
  // To the foot only once the latest lines are laid out, when the window stopped short of them.
  GoTo(going, items, list, enabled = placed && (going != Going.ToFoot || chat.atEnd)) { there ->
    following = there
    going = null
  }

  // Opening: the first lines laid out stay laid out, ここから新着 over the first unread line.
  LaunchedEffect(chat.lines.firstOrNull()?.seq, me) {
    if (from == null) chat.lines.firstOrNull()?.let { from = it.seq }
    if (opened || me == null) return@LaunchedEffect
    opened = true
    firstUnread(chat.lines.map { it.writer(me) }, chat.unread(me))?.let { unreadFrom = chat.lines[it].seq }
  }
  // Placed once: on ここから新着 at the top, or where the lines rested before the activity was made again.
  LaunchedEffect(opened, items) {
    // Once the lines laid out are those it opened on, ここから新着 among them.
    if (!opened || placed || (unreadFrom != null && ChatItem.Unread !in items)) return@LaunchedEffect
    val rest = restingOn?.let { key -> items.indexOfFirst { it.key == key } }?.takeIf { it >= 0 }
    when {
      rest != null -> list.scrollToItem(rest, restingOffset)
      unreadFrom != null -> following = list.showAtTop(items.indexOfFirst { it == ChatItem.Unread })
    }
    following = following && !list.canScrollBackward
    placed = true
  }
  // Where the lines rest, and whether the person left the foot or came back to it.
  LaunchedEffect(list) {
    snapshotFlow { list.firstVisibleItemIndex to list.firstVisibleItemScrollOffset }.collect { (index, offset) ->
      if (!placed) return@collect
      restingOn = list.layoutInfo.visibleItemsInfo.firstOrNull { it.index == index }?.key as? String
      restingOffset = offset
    }
  }
  LaunchedEffect(list) {
    list.interactionSource.interactions.collect { if (it is DragInteraction.Start) { touched = true; following = false } }
  }
  LaunchedEffect(list) {
    snapshotFlow { list.isScrollInProgress }.filter { !it }.collect { if (touched) following = !list.canScrollBackward }
  }
  // Following: a new line at the foot comes in with the lines sliding up to it; others' unread lines
  // coming at once, more than the screen shows, stop under ここから新着 instead (firstComing).
  val latestKey = items.firstOrNull { it !is ChatItem.Typing }?.key
  var latestBefore by remember { mutableStateOf(chat.lines.lastOrNull()?.seq) }
  LaunchedEffect(latestKey) {
    val held = latestBefore
    latestBefore = chat.lines.lastOrNull()?.seq
    if (!placed || !following) return@LaunchedEffect
    val coming = if (me == null || held == null) null else firstComing(chat.lines.map { it.seq to it.writer(me) }, held, chat.lastRead(me))
    val first = coming?.let { seq -> items.indexOfFirst { it is ChatItem.Line && it.line.seq == seq } } ?: -1
    when {
      // They fit: they come in at the foot, the lines sliding up to them.
      first < 0 || unreadFrom != null || list.fits(first + 1) -> list.animateScrollToItem(0)
      // More than the screen shows: stopped under ここから新着, once laid out over them.
      else -> {
        unreadFrom = coming
        going = Going.ToUnread
      }
    }
  }

  // Earlier lines: those the device holds laid out a page at a time as the person nears the top,
  // and the page before them asked of the server while fewer than a page are held.
  val nearTop by remember { derivedStateOf { list.nearEnd(top = true) } }
  LaunchedEffect(placed, touched, nearTop, chat.heldBefore, chat.lines.firstOrNull()?.seq) {
    val first = chat.lines.firstOrNull() ?: return@LaunchedEffect
    if (placed && touched && nearTop && chat.heldBefore > 0) from = maxOf(first.seq - Chat.pageSize, chat.heldFrom ?: 1)
  }
  val current = socket?.state?.collectAsState()?.value == SocketState.Current
  LaunchedEffect(opened, socket, current, chat.heldFrom, chat.heldBefore < Chat.pageSize) {
    val held = chat.heldFrom ?: return@LaunchedEffect
    if (opened && current && chat.heldBefore < Chat.pageSize && held > 1) socket?.requestPage(threadId, held)
  }
  // Later lines: while the lines laid out stop short of the latest held, the page after them as their foot nears.
  val nearFoot by remember { derivedStateOf { list.nearEnd(top = false) } }
  LaunchedEffect(socket, current, nearFoot, chat.atEnd, chat.lines.lastOrNull()?.seq) {
    val last = chat.lines.lastOrNull() ?: return@LaunchedEffect
    if (current && nearFoot && !chat.atEnd) socket?.requestPage(threadId, pageAfter(last.seq))
  }

  // Read as the lines come on the screen, once they have stayed a moment, while the app is in front.
  val lifecycle = LocalLifecycleOwner.current.lifecycle
  val shownItems by rememberUpdatedState(items)
  LaunchedEffect(list, me, placed) {
    if (me == null || !placed) return@LaunchedEffect
    combine(snapshotFlow { list.footsShown() }, lifecycle.currentStateFlow) { seen, life -> seen.takeIf { life.isAtLeast(Lifecycle.State.RESUMED) } }
      .distinctUntilChanged()
      .collectLatest { seen ->
        val latest = seen?.mapNotNull { key -> shownItems.lineSeq(key) }?.maxOrNull() ?: return@collectLatest
        delay(READ_SETTLE_MS)
        // Not the person's edit: one not kept is tried again as a line next comes into sight.
        try {
          chats.read(groupId, threadId, me, latest)
        } catch (e: CancellationException) {
          throw e
        } catch (_: Exception) {}
      }
  }

  // Someone writing shows under the latest line, kept in sight while following.
  LaunchedEffect(typers.isNotEmpty()) { if (placed && following && typers.isNotEmpty()) list.animateScrollToItem(0) }

  var notKept by remember { mutableStateOf(false) }
  ChatScaffold(groupId, threadId, members, groups, socket, onBack) {
    Column(Modifier.fillMaxSize().imePadding()) {
      Box(Modifier.weight(1f).fillMaxWidth()) {
        ChatLines(items, list, chat, me, writers, threadId, { notKept = true }, Modifier.alpha(if (placed) 1f else 0f))
        LatestButton(list, chat, me, items, Modifier.align(Alignment.BottomEnd)) { toUnread ->
          when {
            toUnread -> going = Going.ToUnread
            // The latest lines laid out as the chat opens, and gone to.
            !chat.atEnd -> {
              from = null
              going = Going.ToFoot
            }
            else -> going = Going.ToFoot
          }
        }
      }
      Composer(
        groupId,
        threadId,
        onTyping = { on -> socket?.sendTyping(threadId, on) },
        onSent = {
          if (!chat.atEnd) from = null
          going = Going.ToFoot
        },
        onNotKept = { notKept = true },
      )
    }
  }
  if (notKept) NotKeptDialog { notKept = false }
}

/** The page around the chat: its title, and how the socket is under it while it is not current. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatScaffold(
  groupId: String,
  threadId: String,
  members: List<GroupMemberRow>,
  groups: List<GroupRow>,
  socket: ChatSocket?,
  onBack: () -> Unit,
  content: @Composable () -> Unit,
) {
  val me = rememberMeId()
  val other = me?.let { otherIn(threadId, it) }?.let { id -> members.firstOrNull { it.userId == id } }
  val title = other?.shownName() ?: groups.firstOrNull { it.id == groupId }?.name.orEmpty()
  val count = members.count { !it.left }
  val status = rememberSocketWords(socket)
  Scaffold(
    topBar = {
      TopAppBar(
        title = {
          Column {
            Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val under = status ?: if (threadId == GROUP_THREAD) stringResource(R.string.chat_members, count) else null
            if (under != null) {
              Text(under, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
          }
        },
        navigationIcon = {
          IconButton(onClick = onBack) { Icon(painterResource(R.drawable.ic_back), stringResource(R.string.back)) }
        },
      )
    },
    // The composer takes the foot, rising with the keyboard (imePadding).
    contentWindowInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Top),
  ) { padding ->
    Box(Modifier.fillMaxSize().padding(padding)) { content() }
  }
}

/**
 * 接続中… while the group's socket is not open, 更新中… while its catch-up still comes, once either
 * has lasted `socketRules.statusShownAfterMs`; null while it is current.
 */
@Composable
private fun rememberSocketWords(socket: ChatSocket?): String? {
  val state = socket?.state?.collectAsState()?.value ?: SocketState.Closed
  var shown by remember { mutableStateOf<SocketState?>(null) }
  LaunchedEffect(state) {
    shown = null
    if (state == SocketState.Current) return@LaunchedEffect
    delay(SyncSocket.statusShownAfterMs.toLong())
    shown = state
  }
  return when (shown) {
    null,
    SocketState.Current -> null
    is SocketState.CatchingUp -> stringResource(R.string.chat_catching_up)
    else -> stringResource(R.string.chat_connecting)
  }
}

/**
 * The lines, from the foot up: the spinner at the top while the page before them is on its way,
 * then each item, and who is writing at the very foot, under the latest line.
 */
@Composable
private fun ChatLines(
  items: List<ChatItem>,
  list: LazyListState,
  chat: ChatState,
  me: String?,
  writers: Map<String, GroupMemberRow>,
  threadId: String,
  onNotKept: () -> Unit,
  modifier: Modifier = Modifier,
) {
  LazyColumn(
    modifier.fillMaxSize(),
    state = list,
    reverseLayout = true,
    contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
  ) {
    items(items, key = { it.key }, contentType = { it::class }) { item ->
      ChatItemRow(item, me, writers, threadId != GROUP_THREAD, onNotKept, Modifier.animateItem())
    }
    if (!chat.atStart && chat.heldBefore == 0) {
      item(key = "earlier") {
        Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
      }
    }
  }
}

/**
 * ↓ (spec/chat.md, Unread lines and typing): shown more than half a screen up from the latest, or
 * with others' lines below not yet read, or while the lines stop short of the latest, carrying how
 * many are unread; a tap goes to the latest and follows it.
 */
@Composable
private fun LatestButton(
  list: LazyListState,
  chat: ChatState,
  me: String?,
  items: List<ChatItem>,
  modifier: Modifier = Modifier,
  onClick: (toUnread: Boolean) -> Unit,
) {
  val away by remember { derivedStateOf { list.awayFromFoot() } }
  val atFoot by remember { derivedStateOf { !list.canScrollBackward } }
  val divider = items.indexOfFirst { it == ChatItem.Unread }
  // ここから新着 below the top of the screen: on it, or under it.
  val unreadBelow by remember(divider) { derivedStateOf { divider >= 0 && list.belowTop(divider) } }
  val unread = me?.let { chat.unread(it) } ?: 0
  val unseen = if (atFoot && chat.atEnd) 0 else unread
  val toUnread = unreadBelow && unseen > 0
  AnimatedVisibility(away || !chat.atEnd || unseen > 0, modifier.padding(12.dp), enter = fadeIn(), exit = fadeOut()) {
    val to = stringResource(if (toUnread) R.string.chat_to_unread else R.string.chat_to_latest)
    val label = if (unseen > 0) stringResource(R.string.chat_unseen, to, unseen) else to
    BadgedBox(badge = { if (unseen > 0) Badge { Text("$unseen") } }) {
      SmallFloatingActionButton(onClick = { onClick(toUnread) }, Modifier.semantics { contentDescription = label }) {
        Icon(painterResource(R.drawable.ic_keyboard_arrow_down), contentDescription = null)
      }
    }
  }
}

/**
 * Takes the lines where [going] asks once they are laid out as [items], telling [onThere] whether
 * they follow the latest then. The request is cleared by [onThere] only once there: cleared
 * before, its key's change would cancel the scroll on its way.
 */
@Composable
internal fun GoTo(going: Going?, items: List<ChatItem>, list: LazyListState, enabled: Boolean, onThere: (following: Boolean) -> Unit) {
  LaunchedEffect(going, items, enabled) {
    val to = going ?: return@LaunchedEffect
    if (!enabled) return@LaunchedEffect
    val following =
      when (to) {
        Going.ToUnread -> list.showAtTop(items.indexOfFirst { it == ChatItem.Unread })
        Going.ToFoot -> {
          list.animateScrollToItem(0)
          true
        }
      }
    onThere(following)
  }
}

/** Where the lines are asked to go once laid out. */
internal enum class Going {
  /** ここから新着 at the top, or the foot when the lines under it fit. */
  ToUnread,

  /** The latest line, following it. */
  ToFoot,
}

/** 保存できませんでした: an edit the device could not keep (spec/sync-protocol.md, Outbox). */
@Composable
fun NotKeptDialog(onDismiss: () -> Unit) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(stringResource(R.string.chat_not_kept)) },
    text = { Text(stringResource(R.string.chat_not_kept_body)) },
    confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.ok)) } },
  )
}

/** How long the lines on the screen stay before they are read, so a fling reads once where it stops. */
private const val READ_SETTLE_MS = 100L

/** The seq of the line [key] names among the items, null for anything else or a line still on its way. */
private fun List<ChatItem>.lineSeq(key: String): Long? = (firstOrNull { it.key == key } as? ChatItem.Line)?.line?.seq

/**
 * Puts the item at [index] at the top of the lines, as ここから新着 opens there; with too few lines
 * under it to get there, they rest at the foot. True when it is at the foot then.
 */
private suspend fun LazyListState.showAtTop(index: Int): Boolean {
  if (index < 0) return !canScrollBackward
  scrollToItem(index)
  val item = layoutInfo.visibleItemsInfo.firstOrNull { it.index == index } ?: return !canScrollBackward
  // Reversed, an item's top stands its offset and size over the foot; the lines go down until it is at the top.
  val top = layoutInfo.viewportEndOffset - layoutInfo.afterContentPadding
  scrollBy(-(top - (item.offset + item.size)).toFloat())
  return !canScrollBackward
}

/**
 * Whether the lines laid out end within `chatRules.prefetchScreens` screens of the top ([top]) or
 * the foot, counted in the items' sizes as those on the screen show them.
 */
private fun LazyListState.nearEnd(top: Boolean): Boolean {
  val info = layoutInfo
  val shown = info.visibleItemsInfo
  if (shown.isEmpty()) return false
  val screen = info.viewportEndOffset - info.viewportStartOffset
  val average = shown.sumOf { it.size } / shown.size.coerceAtLeast(1)
  val beyond = if (top) info.totalItemsCount - 1 - shown.last().index else shown.first().index
  return beyond.toLong() * average < Chat.prefetchScreens.toLong() * screen
}

/** The item at [index] is under the top of the lines: on the screen short of the top, or under the screen. */
private fun LazyListState.belowTop(index: Int): Boolean {
  if (index < firstVisibleItemIndex) return true
  val info = layoutInfo
  val item = info.visibleItemsInfo.firstOrNull { it.index == index } ?: return false
  // Reversed, an item's top is its offset and size from the foot.
  return item.offset + item.size < info.viewportEndOffset - info.afterContentPadding - 1
}

/** Whether [count] items at the foot fit on the screen, counted in the sizes of those on it. */
private fun LazyListState.fits(count: Int): Boolean {
  val info = layoutInfo
  val shown = info.visibleItemsInfo
  if (shown.isEmpty()) return true
  val room = info.viewportEndOffset - info.viewportStartOffset - info.beforeContentPadding - info.afterContentPadding
  return count.toLong() * (shown.sumOf { it.size } / shown.size) <= room
}

/** More than half a screen up from the latest. */
private fun LazyListState.awayFromFoot(): Boolean {
  val info = layoutInfo
  val screen = info.viewportEndOffset - info.viewportStartOffset
  val shown = info.visibleItemsInfo
  val average = if (shown.isEmpty()) 0 else shown.sumOf { it.size } / shown.size
  return firstVisibleItemIndex.toLong() * average + firstVisibleItemScrollOffset > screen / 2
}

/** The keys of the items whose foot is on the screen. */
private fun LazyListState.footsShown(): List<String> {
  val info = layoutInfo
  // Reversed, an item's offset is where its foot is, from the foot of the lines.
  return info.visibleItemsInfo.filter { it.offset >= info.viewportStartOffset && it.offset < info.viewportEndOffset }.mapNotNull { it.key as? String }
}

/** A member's name as their lines show it: 削除されたアカウント once their account is deleted. */
@Composable
fun GroupMemberRow.shownName(): String = shownName(stringResource(R.string.deleted_account))

/** A member's name as their lines show it, [deletedWord] once their account is deleted. */
fun GroupMemberRow.shownName(deletedWord: String): String = if (deleted) deletedWord else displayName

/** Who is writing in the chat now, for the dots under the latest line. */
@Composable
private fun rememberTypers(socket: ChatSocket?, threadId: String, me: String?, blocked: Set<String>): List<String> {
  var until by remember { mutableStateOf(emptyMap<String, Long>()) }
  LaunchedEffect(socket, threadId) {
    val typing = socket?.typing ?: return@LaunchedEffect
    launch {
      while (true) {
        val now = System.currentTimeMillis()
        until = until.filterValues { it > now }
        val next = until.values.minOrNull() ?: Long.MAX_VALUE
        delay(minOf(next - now, Chat.typingShowMs.toLong()).coerceAtLeast(50))
      }
    }
    typing.collect { frame ->
      if (frame.threadId != threadId || frame.userId == me) return@collect
      until = if (frame.on) until + (frame.userId to System.currentTimeMillis() + Chat.typingShowMs) else until - frame.userId
    }
  }
  return until.keys.filter { it !in blocked }.sorted()
}
