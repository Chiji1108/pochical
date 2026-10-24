package app.pochical.chat

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.design.Radius
import app.pochical.design.TextLimits
import app.pochical.kit.KeptDraft
import app.pochical.kit.fitsText
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The chat's composer (spec/chat.md, Photos; Drafts; Unread lines and typing): Material's own field
 * and send at the lines' foot, rising with the keyboard. What is written is the chat's draft, kept
 * on the device as the writing pauses, as the composer empties and as the chat is left; while it
 * holds words, the others hear the member is writing, at most every `chatRules.typingSendMs`.
 * Replies, edits, mentions, photos and days (＋) come with #826 and #827, in this same row.
 */
@Composable
fun Composer(
  groupId: String,
  threadId: String,
  onTyping: (Boolean) -> Unit,
  onSent: () -> Unit,
  onNotKept: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val chats = LocalChats.current
  val scope = rememberCoroutineScope()
  var text by rememberSaveable { mutableStateOf("") }
  // The draft taken once, as the chat opens; after a rotation the composer keeps its own words.
  var tookDraft by rememberSaveable { mutableStateOf(false) }
  LaunchedEffect(Unit) {
    if (tookDraft) return@LaunchedEffect
    if (text.isEmpty()) chats.draft(groupId, threadId)?.let { text = it.text }
    // Only from here is what the composer holds the draft, so the draft is never kept empty before it is read.
    tookDraft = true
  }
  // Kept once the writing pauses, and at once as the composer empties.
  LaunchedEffect(text) {
    if (!tookDraft) return@LaunchedEffect
    if (text.isNotEmpty()) delay(Chat.draftSettleMs.toLong())
    runCatching { chats.keepDraft(groupId, threadId, KeptDraft(text)) }
  }
  val leaving by rememberUpdatedState(text)
  val leftNotKept by rememberUpdatedState(onNotKept)
  // Only once the draft was read: before, an empty composer would take its place.
  LifecycleEventEffect(Lifecycle.Event.ON_STOP) { if (tookDraft) chats.keepDraftLeaving(groupId, threadId, KeptDraft(leaving), leftNotKept) }
  DisposableEffect(groupId, threadId) {
    onDispose { if (tookDraft) chats.keepDraftLeaving(groupId, threadId, KeptDraft(leaving), leftNotKept) }
  }

  // Writing, said again every typingSendMs while words are there; stopped as they go, as the line is sent and as the chat closes.
  var typingSaidAt by remember { mutableLongStateOf(0L) }
  val typing by rememberUpdatedState(onTyping)
  LaunchedEffect(text.isEmpty()) {
    if (text.isEmpty()) {
      if (typingSaidAt != 0L) typing(false)
      typingSaidAt = 0L
    }
  }
  LaunchedEffect(text) {
    val now = System.currentTimeMillis()
    if (text.isNotEmpty() && now - typingSaidAt >= Chat.typingSendMs) {
      typing(true)
      typingSaidAt = now
    }
  }
  DisposableEffect(Unit) { onDispose { if (typingSaidAt != 0L) typing(false) } }

  val sendable = fitsText(text, TextLimits.chatMessage)
  Surface(modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surfaceContainer) {
    Row(
      Modifier.navigationBarsPadding().padding(horizontal = 8.dp, vertical = 6.dp),
      verticalAlignment = Alignment.Bottom,
    ) {
      OutlinedTextField(
        value = text,
        onValueChange = { text = it },
        modifier = Modifier.weight(1f),
        placeholder = { Text(stringResource(R.string.chat_message)) },
        maxLines = COMPOSER_LINES,
        shape = RoundedCornerShape(Radius.xxl),
      )
      FilledIconButton(
        onClick = {
          // Gone from the composer as it is sent, so a second tap sends nothing and the chat left
          // meanwhile keeps no draft of words sent.
          val words = text
          text = ""
          scope.launch {
            try {
              chats.send(groupId, threadId, words)
            } catch (e: CancellationException) {
              throw e
            } catch (_: Exception) {
              // Not kept: the words come back, to send again.
              if (text.isEmpty()) text = words
              onNotKept()
              return@launch
            }
            onSent()
          }
        },
        enabled = sendable,
        modifier = Modifier.padding(start = 8.dp, bottom = 4.dp),
      ) {
        Icon(painterResource(R.drawable.ic_send), stringResource(R.string.chat_send))
      }
    }
  }
}

/** The most lines the field grows to before its words scroll. */
private const val COMPOSER_LINES = 6
