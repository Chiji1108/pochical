package app.pochical.chat

import android.view.accessibility.AccessibilityManager
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import app.pochical.kit.ChatState
import app.pochical.kit.LineContent
import app.pochical.kit.LineWriter
import java.time.LocalDate
import kotlinx.coroutines.delay

// What a chat says to a screen reader of itself (spec/chat.md, Screen readers): others' lines coming
// in, once they have settled, and the day at the top as the lines are scrolled a page at a time.
// Said through a polite live region, queued after what the screen reader is saying, as Android asks
// in place of announcing.

/** What the chat has to say to a screen reader now, set as things happen. */
private sealed interface Said {
  /** Others' lines come in, in order. */
  data class Coming(val lines: List<ChatLine>) : Said

  /** Scrolled to the day [day] at the top, or the latest lines ([day] null). */
  data class Scrolled(val day: LocalDate?, val at: Long) : Said
}

/**
 * Says to a screen reader others' lines coming in while the chat is open, wherever it is scrolled,
 * once they have settled for `chatRules.announceSettleMs`: one by who and what (the app's notices by
 * their words), several as 新しいメッセージ{n}件 and the latest; never the reader's own or a blocked
 * member's. And, with a screen reader on, the day of the lines at the top as a scroll stops, or
 * 最新のメッセージ at the foot, as the floating day shows it to the eye.
 */
@Composable
fun ChatSpeech(
  chat: ChatState,
  me: String?,
  /** Once the chat is placed where it opens: what it opens on is not said. */
  placed: Boolean,
  blocked: (ChatLine) -> Boolean,
  nameOf: (String) -> String,
  list: LazyListState,
  floatingDay: FloatingDayState,
) {
  var said by remember { mutableStateOf<Said?>(null) }
  val latest = chat.lines.lastOrNull()?.seq
  var heardTo by remember { mutableStateOf<Long?>(null) }
  LaunchedEffect(latest, placed, me) {
    if (!placed || me == null || latest == null) return@LaunchedEffect
    val from = heardTo
    if (from == null) {
      heardTo = latest
      return@LaunchedEffect
    }
    // A run coming at once is said once, rather than each cutting the last off.
    delay(Chat.announceSettleMs.toLong())
    heardTo = latest
    val coming = chat.lines.filter { it.seq > from && !blocked(it) && (it.writer(me) == LineWriter.Others || it.content is LineContent.Notice) }
    if (coming.isNotEmpty()) said = Said.Coming(coming)
  }
  val reading = rememberScreenReaderOn()
  LaunchedEffect(list, reading) {
    if (!reading) return@LaunchedEffect
    var scrolled = false
    androidx.compose.runtime.snapshotFlow { list.isScrollInProgress }.collect { scrolling ->
      if (scrolling) scrolled = true
      else if (scrolled) {
        scrolled = false
        said = Said.Scrolled(floatingDay.day.takeIf { list.canScrollBackward }, System.nanoTime())
      }
    }
  }
  val words =
    when (val now = said) {
      is Said.Coming -> {
        val last = lineSaid(now.lines.last(), nameOf)
        if (now.lines.size == 1) last else stringResource(R.string.chat_new_lines, now.lines.size, last)
      }
      is Said.Scrolled -> now.day?.let { dayWords(it) } ?: stringResource(R.string.chat_latest_lines)
      null -> null
    }
  Box(
    Modifier.size(1.dp).semantics {
      liveRegion = LiveRegionMode.Polite
      contentDescription = words.orEmpty()
    }
  )
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
