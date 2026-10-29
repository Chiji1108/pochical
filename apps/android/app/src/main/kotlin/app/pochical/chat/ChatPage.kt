package app.pochical.chat

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.compose.LifecycleEventEffect
import app.pochical.notifications.ShowingChat
import app.pochical.notifications.LocalNotificationAsking
import app.pochical.calendar.fullText
import app.pochical.calendar.rememberReducedMotion
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import app.pochical.EmojiPickerSheet
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import app.pochical.kit.LineContent
import app.pochical.kit.LineReaction
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.flowOf
import androidx.compose.animation.AnimatedVisibility
import kotlinx.coroutines.flow.first
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.HorizontalDivider
import app.pochical.notifications.rememberChatMuting
import app.pochical.notifications.rememberChatNotifications
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.Stable
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.DisposableEffect
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
import app.pochical.RootPage
import androidx.compose.foundation.clickable
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.directThread
import app.pochical.kit.inviteCode
import app.pochical.kit.folds
import app.pochical.kit.placeRules
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.design.SyncSocket
import app.pochical.groups.HoldSocket
import app.pochical.groups.LocalGroupCalls
import app.pochical.groups.rememberGroupDays
import app.pochical.groups.rememberGroupMembers
import app.pochical.groups.LocalValues
import app.pochical.groups.rememberMeId
import app.pochical.kit.ChatLine
import app.pochical.kit.ChatPhotoItem
import app.pochical.kit.ChatSocket
import app.pochical.kit.PhotoKey
import app.pochical.kit.PhotoRun
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
import java.time.LocalDate
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

/**
 * What floats over the top of a chat's lines and stays there (the pins' card), each by its key with
 * its height: the lines keep the room of them all at their top, so their first scrolls out from under
 * them. Every such piece over the lines measures itself here, in one place.
 */
@Stable
class OverTheLines {
  private val heights = mutableStateMapOf<String, Int>()

  /** The room kept at the lines' top, in pixels. */
  val topPx: Int
    get() = heights.values.sum()

  /** The room kept at the lines' top. */
  val top: Dp
    @Composable get() = with(LocalDensity.current) { topPx.toDp() }

  internal fun cover(key: String, height: Int) {
    heights[key] = height
  }

  internal fun uncover(key: String) {
    heights.remove(key)
  }
}

/** This piece floats over the lines' top as [key], its height kept as room there while it is drawn. */
@Composable
fun Modifier.covering(over: OverTheLines, key: String): Modifier {
  DisposableEffect(over, key) { onDispose { over.uncover(key) } }
  return onSizeChanged { over.cover(key, it.height) }
}

/** The pins' card's key over the lines. */
private const val PINS = "pins"

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
fun ChatPage(
  groupId: String,
  threadId: String,
  onBack: () -> Unit,
  open: (RootPage) -> Unit,
  /** A day brought from みんなのシフト to share (全体チャットで共有), set over the composer once as the chat opens. */
  sharing: LocalDate? = null,
) {
  HoldSocket(groupId)
  // Its lines are not notified while the person sees them come here.
  ShowingChat(groupId, threadId)
  val onPhotos = { open(RootPage.ChatPhotos(groupId, threadId)) }
  val chats = LocalChats.current
  val account = LocalAccount.current
  val values = LocalValues.current
  val me = rememberMeId()
  // Null until read, so a draft's mentions are named once the names are known.
  val memberRows by remember(values, groupId) { values.members(groupId) }.collectAsState(null)
  val members = memberRows.orEmpty()
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

  // One flow for the page, so the lines stay shown as the reader becomes known (signing in) or the
  // first line laid out changes, rather than going blank until read again.
  val currentMe by rememberUpdatedState(me)
  val state by
    remember(chats, groupId, threadId) {
      snapshotFlow { from to currentMe }.flatMapLatest { (from, me) -> chats.state(groupId, threadId, me, from) }
    }
      .collectAsState(null)
  // A member's profile, a report and blocking, over the chat.
  val reportAndBlock = remember { ReportAndBlockState() }
  val other = me?.let { otherIn(threadId, it) }
  // A tap on the title opens what the chat is of: the other member's profile, or the group's settings.
  val person = other?.let { id -> members.firstOrNull { it.userId == id } }
  // The chat with Pochical's people, a chat of two with no profile to open (spec/chat.md, The chat with Pochical's people).
  val support = groupId == Chat.supportPlace
  val onTitle: (() -> Unit)? =
    when {
      support -> null
      other == null -> { { open(RootPage.GroupSettings(groupId)) } }
      person != null && !person.deleted -> { { reportAndBlock.profileOf = ProfileOf.of(person) } }
      else -> null
    }
  // While the chat is read, its title opens nothing yet: the sheets come with the chat.
  // Said over the chat: what a menu's choice did, from its ⋯ too.
  val snackbar = remember { SnackbarHostState() }
  val scope = rememberCoroutineScope()
  val say = remember(snackbar, scope) { { said: String -> scope.launch { snackbar.showSnackbar(said) }; Unit } }
  val chat = state ?: return ChatScaffold(groupId, threadId, support, members, groups, socket, onBack, onPhotos, say, onTitle = null) {}

  val blockedIds = remember(blocked) { blocked.map { it.userId }.toSet() }
  // Blocked members' lines in the place's own chat, folded but those shown this once, by seq.
  var shownBlocked by rememberSaveable { mutableStateOf(emptyList<Long>()) }
  val blockedLine = remember(blockedIds) { { line: ChatLine -> line.folds(blockedIds) } }
  val folded = remember(blockedLine, shownBlocked) { { line: ChatLine -> blockedLine(line) && line.seq !in shownBlocked } }
  // Others writing, shown for chatRules.typingShowMs unless said again; a blocked member's is not.
  val typers = rememberTypers(socket, threadId, me, blockedIds)
  // From the foot up, as the list lays them out, who is writing at the very foot: an item's index
  // here is its index in the list.
  val items =
    remember(chat, me, unreadFrom, typers, blockedLine) {
      val lines = chatItems(chat, me, unreadFrom, blocked = blockedLine).asReversed()
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
  val reducedMotion = rememberReducedMotion()
  // The lines moved by the chat itself, not the person: a screen reader hears nothing of these.
  val moves = remember { ListMoves() }
  GoTo(going, items, list, reducedMotion, moves, enabled = placed && (going != Going.ToFoot || chat.atEnd)) { there ->
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
      rest != null -> moves.run { list.scrollToItem(rest, restingOffset) }
      unreadFrom != null -> following = moves.run { list.showAtTop(items.indexOfFirst { it == ChatItem.Unread }) }
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
    // The person's scroll takes the place of one asked for (↓, a line sent), which stops there.
    list.interactionSource.interactions.collect {
      if (it is DragInteraction.Start) {
        touched = true
        following = false
        going = null
      }
    }
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
      first < 0 || unreadFrom != null || list.fits(first + 1) -> moves.run { list.toFoot(reducedMotion) }
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
  LaunchedEffect(typers.isNotEmpty()) { if (placed && following && typers.isNotEmpty()) moves.run { list.toFoot(reducedMotion) } }

  var notKept by remember { mutableStateOf(false) }
  val composer = rememberComposerState()
  // As sharing into a chat app does: the day waits over the composer, after its draft, and nothing
  // reaches everyone until it is sent, with words if one likes.
  var tookSharing by rememberSaveable { mutableStateOf(false) }
  LaunchedEffect(composer.tookDraft) {
    if (sharing == null || tookSharing || !composer.tookDraft) return@LaunchedEffect
    tookSharing = true
    composer.writing = composer.writing.share(listOf(sharing.toString()))
  }
  // A chat of two by its thread, known before the reader is.
  val direct = threadId != GROUP_THREAD
  // Everyone's shifts over every day the chat's lines share or put to the vote, read once for all
  // their cards: everyone in the group, or the two of a one-to-one chat.
  val sharedDays =
    remember(chat.lines, chat.waiting) {
      (chat.lines.map { it.content } + chat.waiting.map { it.content }).flatMap { content ->
        when (content) {
          is LineContent.Days -> content.days
          is LineContent.Poll -> content.poll.daysList
          else -> emptyList()
        }
      }
    }
  val span = sharedDays.minOrNull()?.let(LocalDate::parse)
  val spanEnd = sharedDays.maxOrNull()?.let(LocalDate::parse)
  val spanMembers = if (span != null && spanEnd != null) rememberGroupMembers(groupId, span, spanEnd).orEmpty() else emptyList()
  val dayMembers = remember(spanMembers, direct, other, me) { if (direct) spanMembers.filter { it.userId == other || it.userId == me } else spanMembers }
  // A line sent, from the composer or the days sheet: the chat goes to its foot, the latest laid out.
  val toFoot = {
    if (!chat.atEnd) from = null
    going = Going.ToFoot
  }
  // 日にちを共有 and 日にちの投票 from ＋: the day sheet, in the way it was opened.
  var pickingDays by rememberSaveable { mutableStateOf<DaysPick?>(null) }
  var sendingDays by remember { mutableStateOf(false) }
  val asking = LocalNotificationAsking.current
  val menu = rememberLineMenuState()
  val deleted = stringResource(R.string.deleted_account)
  val nameOf = remember(writers, deleted) { { id: String -> writers[id]?.shownName(deleted) ?: deleted } }

  // A line gone to (a quote, later a pin): laid out from it when the device holds it, else earlier
  // lines asked for a page at a time until they reach it; then put in the middle of the screen and
  // lit once there (spec/chat.md, Replies; Pins).
  var jumping by remember { mutableStateOf<Long?>(null) }
  var lit by remember { mutableStateOf<Lit?>(null) }
  LaunchedEffect(jumping, items, placed, chat.heldBefore) {
    val seq = jumping ?: return@LaunchedEffect
    if (!placed) return@LaunchedEffect
    val index = items.indexOfFirst { it is ChatItem.Line && it.line.seq == seq }
    val first = chat.lines.firstOrNull()?.seq
    when {
      index >= 0 -> {
        following = false
        moves.run { list.showInMiddle(index, animated = !reducedMotion) }
        lit = Lit(seq, System.nanoTime())
        jumping = null
      }
      // Held but not laid out: the lines are laid out from it.
      from != seq && chat.line(seq) != null -> from = seq
      // Earlier than the lines and not held: those the device holds laid out first, then the page
      // before them waited for, which is asked as fewer than a page are held.
      first != null && seq < first && !chat.atStart -> if (chat.heldBefore > 0) from = maxOf(first - Chat.pageSize, chat.heldFrom ?: 1)
      else -> jumping = null
    }
  }

  // The menu closes as its line goes from the chat (taken back) or becomes the group's (its menu
  // was a line on its way's), as the app leaves the screen, at back, and as the member types.
  val acting = menu.open
  LaunchedEffect(acting, items) {
    val line = acting ?: return@LaunchedEffect
    val item = items.firstOrNull { it.key == line.key }
    val stays =
      when (item) {
        is ChatItem.Line -> !line.waiting && item.line.content != LineContent.Unsent
        is ChatItem.Waiting -> line.waiting
        else -> false
      }
    if (!stays) menu.close()
  }
  LifecycleEventEffect(Lifecycle.Event.ON_STOP) { menu.close() }
  BackHandler(enabled = acting != null) { menu.close() }
  LaunchedEffect(composer) { snapshotFlow { composer.writing.text }.drop(1).collect { menu.close() } }

  // The line the composer answers, held however far from the lines laid out.
  val replying = composer.writing.replyTo
  val answered by remember(chats, groupId, threadId, replying) { replying?.let { chats.line(groupId, threadId, it) } ?: flowOf(null) }.collectAsState(null)

  // Reactions (spec/chat.md, Reactions): the member's own put on sprays from its pill, with its
  // haptic (spec/haptics.md), but with animations off; + opens the system's emoji picker, and a
  // long press on a pill lists who chose it.
  var spray by remember { mutableStateOf<Spray?>(null) }
  // Played once: gone once its time is over, so a line scrolled back does not spray again.
  LaunchedEffect(spray) {
    if (spray == null) return@LaunchedEffect
    delay(SPRAY_MS.toLong())
    spray = null
  }
  var picking by remember { mutableStateOf<Long?>(null) }
  var choosers by remember { mutableStateOf<LineReaction?>(null) }
  val haptics = LocalHapticFeedback.current
  val react = { seq: Long, emoji: String, on: Boolean ->
    scope.launch {
      keeping({ notKept = true }) {
        chats.react(groupId, threadId, seq, emoji, on)
        if (on && !reducedMotion) {
          spray = Spray(seq, emoji, System.nanoTime())
          haptics.performHapticFeedback(HapticFeedbackType.ToggleOn)
        }
      }
    }
    Unit
  }

  // Pochical's invitations open their join screen, or the group once in it, never the browser
  // (spec/chat.md, Pochical's invitation links); any other link its page.
  val browse = rememberLinkOpener()
  // One known to be unusable says so where it is, as its card does.
  val unusableInvite = stringResource(R.string.chat_invite_unusable)
  val invites = remember { InviteCards() }
  val openLink = { url: String ->
    when (val code = inviteCode(url)) {
      null -> browse(url)
      else -> if (invites.answer(code) == InviteAnswer.Unusable) say(unusableInvite) else open(RootPage.Join(code))
    }
  }
  val groupCalls = LocalGroupCalls.current
  // Polls (spec/chat.md, Polls): 行ける, the sheet a poll is settled with, and who can come on a day.
  var deciding by remember { mutableStateOf<Long?>(null) }
  var listing by remember { mutableStateOf<Pair<LocalDate, List<String>>?>(null) }
  val vote = { seq: Long, day: String, on: Boolean ->
    scope.launch { keeping({ notKept = true }) { chats.vote(groupId, threadId, seq, day, on) } }
    Unit
  }
  // Pinning says what happened, the oldest pin making room for a new one.
  val resources = LocalContext.current.resources
  val pin = { seq: Long, on: Boolean ->
    scope.launch {
      keeping({ notKept = true }) {
        val step = chats.pin(groupId, threadId, seq, on)
        val said =
          when {
            step.dropped != null -> resources.getString(R.string.chat_pin_dropped, Chat.maxPins)
            on -> resources.getString(R.string.chat_pinned_done)
            else -> resources.getString(R.string.chat_unpinned_done)
          }
        snackbar.showSnackbar(said)
      }
    }
    Unit
  }
  var unsending by remember { mutableStateOf<Unsending?>(null) }
  // The chat's photos opened large over it.
  var viewing by remember { mutableStateOf<OpenPhotos?>(null) }
  val focus = LocalFocusManager.current
  val actions =
    rememberLineActions(
      groupId,
      threadId,
      composer,
      nameOf,
      snackbar,
      onUnsend = { unsending = it },
      onNotKept = { notKept = true },
      onPin = pin,
      onDecide = { deciding = it },
      onReport = { reportAndBlock.reporting = it },
    )
  // 続きを読む: the lines opened while the chat is open, each keeping its top as it opens.
  var unfolded by rememberSaveable { mutableStateOf(emptySet<String>()) }
  var keepTop by remember { mutableStateOf<Pair<String, Int>?>(null) }
  LaunchedEffect(keepTop) {
    val (key, top) = keepTop ?: return@LaunchedEffect
    // Reversed, the line grows up from its foot: the lines go down by as much as its top rose, once
    // it is laid out opened, the frame after.
    withFrameNanos {}
    withFrameNanos {}
    val now = list.layoutInfo.visibleItemsInfo.firstOrNull { it.key == key }?.let { it.offset + it.size }
    if (now != null && now != top) moves.run { list.scrollBy((now - top).toFloat()) }
    keepTop = null
  }
  val linkItems = rememberLinkActions(openLink, snackbar)
  val floatingDay = rememberFloatingDay(list, items)
  val handlers =
    MessageHandlers(
      menu = menu,
      items = actions,
      reply = { composer.answer(it) },
      jump = { jumping = it },
      nameOf = nameOf,
      notKept = { notKept = true },
      reducedMotion = reducedMotion,
      lit = lit,
      litShown = { if (lit == it) lit = null },
      me = me,
      writers = writers,
      react = react,
      moreReactions = { picking = it },
      choosers = { choosers = it },
      spray = spray,
      openLink = openLink,
      together = { from, through -> rememberGroupDays(dayMembers, from, through).together.days.toSet() },
      vote = vote,
      decide = { deciding = it },
      voters = { day, people -> listing = day to people },
      groupId = groupId,
      openShifts = { day -> open(RootPage.GroupShifts(groupId, day.toString())) },
      // Asked as a card shows, and again as the socket catches up after it could not be.
      invite = { code ->
        LaunchedEffect(code, current) { if (current) invites.ask(code, groupCalls::invite) }
        invites.answer(code)
      },
      dayMembers = dayMembers,
      stopSending = { opId -> scope.launch { keeping({ notKept = true }) { chats.stopSending(opId) } } },
      // Among the photos of the lines laid out, those the reader sees, the rest coming from the group.
      openPhoto = { seq, index ->
        // The keyboard down, as the photo takes the screen.
        focus.clearFocus()
        val held = chat.lines.flatMap { ChatPhotoItem.of(it, blockedIds) }
        val key = PhotoKey(seq, index)
        val line = chat.line(seq)
        viewing =
          if (held.none { it.key == key } && line != null) {
            // A blocked member's line shown this once is not among the chat's photos: its own open alone.
            val own = (line.content as? LineContent.Photos)?.photos.orEmpty().mapIndexed { at, photo -> ChatPhotoItem(PhotoKey(seq, at), photo, line.authorId, line.sentAtMs) }
            OpenPhotos(PhotoRun.opened(own, key), follows = false)
          } else {
            OpenPhotos(PhotoRun.opened(held, key))
          }
      },
      openOwnPhoto = { line, index ->
        focus.clearFocus()
        val photos = (line.content as? LineContent.Photos)?.photos.orEmpty()
        val items = photos.mapIndexed { at, photo -> ChatPhotoItem(PhotoKey(0, at), photo, me.orEmpty(), line.madeAtMs) }
        viewing = OpenPhotos(PhotoRun.opened(items, PhotoKey(0, index)), follows = false)
      },
      // Pochical's people open no profile: only a place that takes reports has them.
      openProfile = { writer: GroupMemberRow -> reportAndBlock.profileOf = ProfileOf.of(writer) }.takeIf { placeRules(groupId).reports },
      folded = folded,
      showFolded = { seq -> shownBlocked = shownBlocked + seq },
      unfolded = unfolded,
      unfold = { key ->
        // Opened where it is, its words going on down, and the chat no longer follows its latest.
        following = false
        keepTop = list.layoutInfo.visibleItemsInfo.firstOrNull { it.key == key }?.let { key to it.offset + it.size }
        unfolded = unfolded + key
      },
      linkItems = linkItems,
      takenTitle = { floatingDay.taken },
    )
  Box {
    ChatScaffold(groupId, threadId, support, members, groups, socket, onBack, onPhotos, say, onTitle) {
      Column(Modifier.fillMaxSize().imePadding()) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
          // What floats over the lines' top keeps its room there, so the first of them scrolls out from under it.
          val over = remember { OverTheLines() }
          ChatLines(
            items,
            list,
            chat,
            me,
            writers,
            threadId != GROUP_THREAD || support,
            handlers,
            { lineQuote(it, chat.line(it), nameOf, blockedIds) },
            over.top,
            head = if (support) { { SupportHead() } } else null,
            modifier = Modifier.alpha(if (placed) 1f else 0f),
          )
          // The day of the lines at the top, while the person scrolls.
          FloatingDay(floatingDay, list, over.top)
          // What a screen reader hears of the chat as it changes and scrolls.
          ChatSpeech(
            me,
            placed,
            moves = moves,
            newest = { chats.newest(groupId, threadId) },
            arrived = { after -> chats.arrived(groupId, threadId, after) },
            blockedLine,
            nameOf,
            list,
            floatingDay,
          )
          // Drawn while there are pins, keeping its room over the lines only then.
          if (chat.pins.isNotEmpty()) {
            PinBar(
              chat.pins,
              nameOf,
              blockedIds,
              onJump = { jumping = it },
              onUnpin = { pin(it, false) },
              Modifier.align(Alignment.TopCenter).covering(over, PINS),
            )
          }
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
          // What a pick says, over the lines' foot rather than the composer, and over ↓.
          SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
        }
        Composer(
          composer,
          groupId,
          threadId,
          quote = replying?.let { lineQuote(it, chat.line(it) ?: answered, nameOf, blockedIds) },
          nameOf = nameOf,
          namesKnown = memberRows != null,
          // The words of the line being changed, whose page stays while their first link does.
          editedWords = composer.writing.editing?.let { (chat.line(it)?.content as? LineContent.Words)?.text },
          onTyping = { on -> socket?.sendTyping(threadId, on) },
          onSent = toFoot,
          onNotKept = { notKept = true },
          onSay = { said -> scope.launch { snackbar.showSnackbar(said) } },
          onShareDays = if (placeRules(groupId).days) ({ pickingDays = DaysPick.Share }) else null,
          // One-to-one chats have no polls.
          onPollDays = if (!direct && placeRules(groupId).polls) ({ pickingDays = DaysPick.Poll }) else null,
        )
      }
    }
    LineMenu(menu)
    viewing?.let { open ->
      FollowPhotos(groupId, threadId, open)
      PhotoViewer(groupId, threadId, open, nameOf, onClose = { viewing = null })
    }
  }
  if (notKept) NotKeptDialog { notKept = false }
  val group = groups.firstOrNull { it.id == groupId }
  ReportAndBlock(
    reportAndBlock,
    blockedIds,
    groupId,
    group?.name.orEmpty(),
    group?.mark ?: GroupMarkValue(),
    snackbar,
    // メッセージを送る opens the one-to-one chat with them, but in that chat itself.
    messaging = { person -> me?.takeIf { person.id != other }?.let { me -> { open(RootPage.Chat(groupId, directThread(me, person.id))) } } },
  )
  picking?.let { seq ->
    EmojiPickerSheet(
      onPick = { emoji ->
        picking = null
        val own = chat.line(seq)?.reactions?.any { it.emoji == emoji && me in it.userIds } == true
        react(seq, emoji, !own)
      },
      onDismiss = { picking = null },
    )
  }
  choosers?.let { ChoosersSheet(it, writers, nameOf) { choosers = null } }
  pickingDays?.let { pick ->
    val people = if (direct) setOfNotNull(other, me) else null
    ShareDaysSheet(groupId, people, pick, sendingDays, onDismiss = { pickingDays = null }) { days ->
      sendingDays = true
      // A line sent, when an answer is first wanted (spec/chat.md, Notifications).
      asking.askOnce()
      val replyTo = composer.writing.replyTo
      scope.launch {
        // The sheet goes once the days are kept; one that cannot be keeps it up with its days picked.
        keeping({ notKept = true }) {
          chats.sendDays(groupId, threadId, days.map { it.toString() }, poll = pick == DaysPick.Poll, replyTo)
          pickingDays = null
          // The reply goes with the line it went with.
          if (replyTo != null && composer.writing.replyTo == replyTo) composer.writing = composer.writing.copy(replyTo = null)
          toFoot()
        }
        sendingDays = false
      }
    }
  }
  listing?.let { (day, people) -> VotersSheet(day, people, writers, nameOf) { listing = null } }
  // The poll being settled, gone with its line should it go from the chat meanwhile.
  val settling = deciding?.let { seq -> (chat.line(seq)?.content as? LineContent.Poll)?.poll?.let { seq to it } }
  LaunchedEffect(deciding, settling) { if (deciding != null && settling == null) deciding = null }
  settling?.let { (seq, poll) ->
    DecideSheet(poll, onDismiss = { deciding = null }) { day ->
      deciding = null
      scope.launch {
        keeping({ notKept = true }) {
          val step = chats.decide(groupId, threadId, seq, day.toString())
          // Said to whoever settled it; settling pins the poll, the oldest pin making room.
          snackbar.showSnackbar(resources.getString(R.string.chat_poll_decided_said, day.fullText))
          if (step.dropped != null) snackbar.showSnackbar(resources.getString(R.string.chat_pin_dropped, Chat.maxPins))
        }
      }
    }
  }
  unsending?.let { asked ->
    UnsendDialog(asked, support, onDismiss = { unsending = null }) {
      unsending = null
      scope.launch {
        keeping({ notKept = true }) {
          when (asked) {
            is Unsending.Sent -> chats.unsend(groupId, threadId, asked.seq)
            // Taken by the group while asked: taken back as its line now.
            is Unsending.Waiting ->
              chat.lines.firstOrNull { it.opId == asked.opId }?.let { chats.unsend(groupId, threadId, it.seq) } ?: chats.takeBack(asked.opId)
          }
        }
      }
    }
  }
}

/** The page around the chat: its title, and how the socket is under it while it is not current. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatScaffold(
  groupId: String,
  threadId: String,
  /** The chat with Pochical's people, titled with the app's name and nobody counted. */
  support: Boolean,
  members: List<GroupMemberRow>,
  groups: List<GroupRow>,
  socket: ChatSocket?,
  onBack: () -> Unit,
  /** 写真 in its ⋯: the chat's photos alone. */
  onPhotos: () -> Unit,
  /** Says what its ⋯ did, over the chat. */
  say: (String) -> Unit,
  /** A tap on the title: what the chat is of; null while it opens nothing. */
  onTitle: (() -> Unit)?,
  content: @Composable () -> Unit,
) {
  val me = rememberMeId()
  val other = me?.let { otherIn(threadId, it) }?.let { id -> members.firstOrNull { it.userId == id } }
  // The other member's name, the group's, or the app's for Pochical's people.
  val title = other?.shownName() ?: if (support) stringResource(R.string.app_name) else groups.firstOrNull { it.id == groupId }?.name.orEmpty()
  val count = members.count { !it.left }
  val status = rememberSocketWords(socket)
  val muted = rememberChatNotifications()?.isMuted(groupId, threadId)
  val setMuted = rememberChatMuting(groupId, threadId, say)
  Scaffold(
    topBar = {
      TopAppBar(
        title = {
          val opens = onTitle?.let { stringResource(if (other != null) R.string.profile else R.string.group_settings) }
          Column(if (onTitle != null) Modifier.clickable(onClickLabel = opens, onClick = onTitle) else Modifier) {
            Row(verticalAlignment = Alignment.CenterVertically) {
              Text(title, Modifier.weight(1f, fill = false), maxLines = 1, overflow = TextOverflow.Ellipsis)
              // 通知オフ, after its name as in the chat list.
              if (muted == true) {
                Icon(
                  painterResource(R.drawable.ic_notifications_off),
                  stringResource(R.string.chat_muted),
                  Modifier.padding(start = 4.dp).size(18.dp),
                  tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
              }
            }
            val under = status ?: if (threadId == GROUP_THREAD && !support) stringResource(R.string.chat_members, count) else null
            if (under != null) {
              Text(under, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
          }
        },
        navigationIcon = {
          IconButton(onClick = onBack) { Icon(painterResource(R.drawable.ic_back), stringResource(R.string.back)) }
        },
        actions = {
          // ⋯, its menu Material's own from where it was opened (spec/chat.md, Photos: 写真).
          var more by remember { mutableStateOf(false) }
          Box {
            IconButton(onClick = { more = true }) { Icon(painterResource(R.drawable.ic_more_vert), stringResource(R.string.chat_more)) }
            DropdownMenu(more, onDismissRequest = { more = false }) {
              DropdownMenuItem(
                text = { Text(stringResource(R.string.chat_photos_title)) },
                leadingIcon = { Icon(painterResource(R.drawable.ic_photo_library), contentDescription = null) },
                onClick = {
                  more = false
                  onPhotos()
                },
              )
              if (muted != null) {
                HorizontalDivider()
                DropdownMenuItem(
                  text = { Text(stringResource(if (muted) R.string.chat_unmute else R.string.chat_mute)) },
                  leadingIcon = {
                    Icon(painterResource(if (muted) R.drawable.ic_notifications else R.drawable.ic_notifications_off), contentDescription = null)
                  },
                  onClick = {
                    more = false
                    setMuted(!muted)
                  },
                )
              }
            }
          }
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
  direct: Boolean,
  handlers: MessageHandlers,
  quoteOf: @Composable (Long) -> LineQuote,
  topRoom: Dp,
  /** What heads the chat, over its first line once the lines reach it; none for most chats. */
  head: (@Composable () -> Unit)?,
  modifier: Modifier = Modifier,
) {
  val pinned = remember(chat.pins) { chat.pins.mapTo(HashSet()) { it.seq } }
  LazyColumn(
    modifier.fillMaxSize(),
    state = list,
    reverseLayout = true,
    contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 8.dp + topRoom, bottom = 8.dp),
  ) {
    items(items, key = { it.key }, contentType = { it::class }) { item ->
      val look = messageLook(item, me, writers, direct, pinned, quoteOf, handlers.nameOf, handlers.invite)
      // Lines come in fading as the lines slide up to them, and move to a new height together, over
      // chatRules.lineMoveMs; with motion reduced they fade where they go, put there at once.
      ChatItemRow(item, look, writers, me, handlers, Modifier.animateItem(fadeInSpec = tween(Chat.lineMoveMs), placementSpec = if (handlers.reducedMotion) null else tween(Chat.lineMoveMs), fadeOutSpec = tween(Chat.lineMoveMs)))
    }
    if (head != null && chat.atStart) item(key = "head") { head() }
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
internal fun GoTo(going: Going?, items: List<ChatItem>, list: LazyListState, reducedMotion: Boolean, moves: ListMoves, enabled: Boolean, onThere: (following: Boolean) -> Unit) {
  LaunchedEffect(going, items, enabled) {
    val to = going ?: return@LaunchedEffect
    if (!enabled) return@LaunchedEffect
    val following =
      when (to) {
        Going.ToUnread -> moves.run { list.showAtTop(items.indexOfFirst { it == ChatItem.Unread }) }
        Going.ToFoot -> {
          moves.run { list.toFoot(reducedMotion) }
          true
        }
      }
    onThere(following)
  }
}

/** How many moves of the lines the chat itself is making now (↓, following, a jump, opening), not the person. */
@Stable
class ListMoves {
  var count by mutableIntStateOf(0)
    private set

  suspend fun <T> run(move: suspend () -> T): T {
    count++
    try {
      return move()
    } finally {
      count--
    }
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

/** Takes the lines to their foot, the latest: gliding there, or at once with motion reduced (spec/chat.md, Reduced motion). */
private suspend fun LazyListState.toFoot(reducedMotion: Boolean) = if (reducedMotion) scrollToItem(0) else animateScrollToItem(0)

/** Puts the item at [index] in the middle of the screen, gliding there unless [animated] is off. */
private suspend fun LazyListState.showInMiddle(index: Int, animated: Boolean) {
  if (animated) animateScrollToItem(index) else scrollToItem(index)
  val info = layoutInfo
  val item = info.visibleItemsInfo.firstOrNull { it.index == index } ?: return
  // Reversed, an item's offset is from the foot; it goes up by how far its middle is under the screen's.
  val middle = (info.viewportEndOffset - info.viewportStartOffset) / 2
  val by = -(middle - (item.offset + item.size / 2)).toFloat()
  if (animated) animateScrollBy(by) else scrollBy(by)
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
