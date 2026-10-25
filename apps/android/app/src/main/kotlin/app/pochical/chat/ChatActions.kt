package app.pochical.chat

import android.content.ClipData
import android.os.Build
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.design.ChatPlaceRules
import app.pochical.groups.LocalGroupCalls
import app.pochical.kit.LineContent
import app.pochical.kit.plainText
import kotlinx.coroutines.launch

// What a line's menu offers (spec/chat.md, Opening a message's menu; Replies; Editing and
// unsending; Lines on their way), each going through :kit's outbox as sending does.

/** A line to take back once asked: one the group holds, or one of the member's still on its way. */
sealed interface Unsending {
  data class Sent(val seq: Long) : Unsending

  data class Waiting(val opId: String) : Unsending
}

/**
 * The items of a message's menu, in the spec's order: 返信 first, コピー for words, 編集 for one's
 * own words, and 送信取消 last, apart and in the danger color. A line on its way has コピー and
 * 送信取消; one not sent もう一度送る and 削除, which is not asked, as nobody has it.
 */
@Composable
fun rememberLineActions(
  groupId: String,
  composer: ComposerState,
  nameOf: (String) -> String,
  snackbar: SnackbarHostState,
  onUnsend: (Unsending) -> Unit,
  onNotKept: () -> Unit,
  /** Pins the line, or takes its pin off. */
  onPin: (seq: Long, on: Boolean) -> Unit,
  /** 決め直す: the sheet a poll is settled with, on its day. */
  onDecide: (seq: Long) -> Unit,
): (MessageLook) -> List<LineMenuItem> {
  val chats = LocalChats.current
  val scope = rememberCoroutineScope()
  val clipboard = LocalClipboard.current
  val haptics = LocalHapticFeedback.current
  val context = LocalContext.current
  val resources = context.resources
  val calls = LocalGroupCalls.current
  val files = LocalPhotoFiles.current
  val rules = ChatPlaceRules.group
  fun copy(words: String) =
    LineMenuItem(resources.getString(R.string.chat_copy), R.drawable.ic_content_copy) {
      scope.launch {
        clipboard.setClipEntry(ClipEntry(ClipData.newPlainText(null, plainText(words, nameOf))))
        // Done out of sight, on the clipboard: felt as well as said (spec/haptics.md). From Android
        // 13 the system says it itself, so the app says nothing more.
        haptics.performHapticFeedback(HapticFeedbackType.Confirm)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) snackbar.showSnackbar(resources.getString(R.string.chat_copied))
      }
    }
  return { look ->
    val words = (look.content as? LineContent.Words)?.text
    val waiting = look.waiting
    val seq = look.seq
    buildList {
      when {
        waiting != null && waiting.failed -> {
          add(LineMenuItem(resources.getString(R.string.chat_send_again), R.drawable.ic_refresh) { scope.launch { keeping(onNotKept) { chats.sendAgain(waiting.opId) } } })
          add(LineMenuItem(resources.getString(R.string.chat_delete), R.drawable.ic_delete, destructive = true, startsGroup = true) {
            scope.launch { keeping(onNotKept) { chats.takeBack(waiting.opId) } }
          })
        }
        waiting != null -> {
          if (words != null) add(copy(words))
          add(LineMenuItem(resources.getString(R.string.chat_unsend), R.drawable.ic_undo, destructive = true, startsGroup = true) { onUnsend(Unsending.Waiting(waiting.opId)) })
        }
        seq != null -> {
          add(LineMenuItem(resources.getString(R.string.chat_reply), R.drawable.ic_reply) { composer.answer(seq) })
          if (words != null) add(copy(words))
          // A line of photos saves them all (spec/chat.md, Photos).
          val photos = (look.content as? LineContent.Photos)?.photos
          if (photos != null) {
            add(LineMenuItem(resources.getString(R.string.chat_save), R.drawable.ic_download) { scope.launch { snackbar.showSnackbar(savePhotos(context, calls, files, groupId, photos)) } })
          }
          // Anyone's line, for everyone in the chat (spec/chat.md, Pins).
          if (rules.pins) {
            val pinned = look.pinned
            add(
              LineMenuItem(resources.getString(if (pinned) R.string.chat_unpin else R.string.chat_pin), if (pinned) R.drawable.ic_keep_off else R.drawable.ic_push_pin) {
                onPin(seq, !pinned)
              }
            )
          }
          val poll = look.poll
          if (poll != null && poll.poll.decided.isNotEmpty() && poll.canDecide) {
            add(LineMenuItem(resources.getString(R.string.chat_poll_redecide), R.drawable.ic_event_available) { onDecide(seq) })
          }
          if (look.mine && words != null && rules.edit) {
            add(LineMenuItem(resources.getString(R.string.chat_edit), R.drawable.ic_edit) { composer.change(seq, words, nameOf) })
          }
          if (look.mine) {
            add(LineMenuItem(resources.getString(R.string.chat_unsend), R.drawable.ic_undo, destructive = true, startsGroup = true) { onUnsend(Unsending.Sent(seq)) })
          }
        }
      }
    }
  }
}

/** 送信を取り消しますか？, asked in a centered alert; a line still on its way says it has not gone yet. */
@Composable
fun UnsendDialog(asked: Unsending, onDismiss: () -> Unit, onUnsend: () -> Unit) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(stringResource(R.string.chat_unsend_ask)) },
    text = { Text(stringResource(if (asked is Unsending.Waiting) R.string.chat_unsend_waiting else R.string.chat_unsend_body)) },
    confirmButton = { TextButton(onClick = onUnsend) { Text(stringResource(R.string.chat_unsend_confirm), color = LocalThemeColors.current.dangerDefault) } },
    dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
  )
}
