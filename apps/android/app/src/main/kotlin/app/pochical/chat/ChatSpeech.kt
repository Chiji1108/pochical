package app.pochical.chat

import android.view.accessibility.AccessibilityManager
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.kit.ChatLine
import app.pochical.kit.LineContent
import app.pochical.kit.LineWriter
import java.time.LocalDate
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf

// What a chat says to a screen reader of itself (spec/chat.md, Screen readers): others' lines coming
// in, once they have settled, and the day at the top as the lines are scrolled a page at a time.
// Each is an event of its own, said by a polite live region made for it, queued after what the
// screen reader is saying, as Android asks in place of announcing (deprecated in Android 16).

/** Something to say, once: [id] tells it from the one before, the same words included. */
private class Said(val id: Long, val what: What)

private sealed interface What {
  /** Others' lines come in, in order. */
  data class Coming(val lines: List<ChatLine>) : What

  /** Scrolled to the day [day] at the top, or the latest lines ([day] null). */
  data class Scrolled(val day: LocalDate?) : What
}

/**
 * Says to a screen reader others' lines coming in while the chat is open, wherever it is scrolled,
 * once they have settled for `chatRules.announceSettleMs`: one by who and what (the app's notices by
 * their words), several as how many and the latest, as iOS says them; never the reader's own or a
 * blocked member's. What has come is told by [arrived] after the newest line held as the chat was
 * placed ([newest]), not by the lines laid out, so a gap or a page of earlier lines changes nothing.
 * And, with a screen reader on, the day of the lines at the top as a scroll stops, or 最新のメッセージ
 * at the foot, as the floating day shows it to the eye.
 */
@Composable
fun ChatSpeech(
  me: String?,
  /** Once the chat is placed where it opens: what it opens on is not said. */
  placed: Boolean,
  /** The lines moved by the chat itself, which say nothing: only the person's scroll says the day. */
  moves: ListMoves,
  /** The seq of the chat's newest line held now, 0 with none. */
  newest: suspend () -> Long,
  /** The chat's lines after a seq, as they arrive. */
  arrived: (after: Long) -> Flow<List<ChatLine>>,
  blocked: (ChatLine) -> Boolean,
  nameOf: (String) -> String,
  list: LazyListState,
  floatingDay: FloatingDayState,
  /** Whether a screen reader reads the screen: nothing is followed or said otherwise. */
  reading: Boolean = rememberScreenReaderOn(),
  /** Told of each thing said, as it is. */
  onSaid: (String) -> Unit = {},
) {
  var said by remember { mutableStateOf<Said?>(null) }
  var ids by remember { mutableLongStateOf(0L) }
  val say = { what: What -> said = Said(++ids, what) }
  // The newest line as the chat was placed, an empty chat's 0: what comes after it has arrived.
  var since by remember { mutableStateOf<Long?>(null) }
  val asking by rememberUpdatedState(newest)
  LaunchedEffect(placed) { if (placed && since == null) since = asking() }
  var heardTo by remember(since) { mutableLongStateOf(since ?: 0) }
  // Those after the last heard, followed only while a screen reader reads the screen, as nothing is
  // said otherwise.
  val came by remember(since, heardTo, reading) { since?.takeIf { reading }?.let { arrived(heardTo) } ?: flowOf(emptyList()) }.collectAsState(emptyList())
  val hidden by rememberUpdatedState(blocked)
  // A run coming at once is said once, rather than each cutting the last off. Keyed on the lines as
  // the device holds them, so one changed or taken back while it settles waits again and is said as
  // it is then, or not at all.
  LaunchedEffect(came, me) {
    val last = came.lastOrNull()?.seq ?: return@LaunchedEffect
    if (me == null || last <= heardTo) return@LaunchedEffect
    delay(Chat.announceSettleMs.toLong())
    val coming =
      came.filter { line ->
        line.seq > heardTo &&
          !hidden(line) &&
          line.content != LineContent.Unsent &&
          // Others' lines, and the app's notices of what others did, never the reader's own.
          (line.writer(me) == LineWriter.Others || (line.content is LineContent.Notice && line.authorId != me))
      }
    heardTo = last
    if (coming.isNotEmpty()) say(What.Coming(coming))
  }
  LaunchedEffect(list, reading) {
    if (!reading) return@LaunchedEffect
    var scrolled = false
    snapshotFlow { list.isScrollInProgress }.collect { scrolling ->
      if (scrolling) scrolled = moves.count == 0
      else if (scrolled) {
        scrolled = false
        say(What.Scrolled(floatingDay.day.takeIf { list.canScrollBackward }))
      }
    }
  }
  val now = said
  val words =
    when (val what = now?.what) {
      is What.Coming -> {
        val last = lineSaid(what.lines.last(), nameOf)
        if (what.lines.size == 1) last else stringResource(R.string.chat_new_lines, what.lines.size, last)
      }
      is What.Scrolled -> what.day?.let { dayWords(it) } ?: stringResource(R.string.chat_latest_lines)
      null -> ""
    }
  // Two live regions, each thing said by the one the last was not, the other emptied: a live region
  // is told as its words change on a node the screen already has, so the same words said again are
  // a change too.
  val turn = (now?.id ?: 0L) % 2
  LaunchedEffect(now?.id) { if (now != null) onSaid(words) }
  for (side in 0L..1L) {
    Box(
      Modifier.size(1.dp).semantics {
        liveRegion = LiveRegionMode.Polite
        contentDescription = if (side == turn) words else ""
      }
    )
  }
}

/** A line as it is said coming in: who and what, or a notice by its words. */
@Composable
private fun lineSaid(line: ChatLine, nameOf: (String) -> String): String {
  val content = line.content
  if (content is LineContent.Notice) return noticeWords(content.notice, nameOf(line.authorId), nameOf(content.notice.subjectId))
  return stringResource(R.string.chat_line_said, nameOf(line.authorId), lineWords(content, nameOf))
}

/** Whether a screen reader is reading the screen (touch exploration), as it turns on and off. */
@Composable
fun rememberScreenReaderOn(): Boolean {
  val manager = LocalContext.current.getSystemService(AccessibilityManager::class.java) ?: return false
  var on by remember(manager) { mutableStateOf(manager.isTouchExplorationEnabled) }
  DisposableEffect(manager) {
    val listener = AccessibilityManager.TouchExplorationStateChangeListener { on = it }
    manager.addTouchExplorationStateChangeListener(listener)
    onDispose { manager.removeTouchExplorationStateChangeListener(listener) }
  }
  return on
}
