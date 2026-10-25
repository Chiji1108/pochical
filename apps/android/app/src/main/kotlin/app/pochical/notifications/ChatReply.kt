package app.pochical.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput

/**
 * 返信 written on a chat's notification (spec/chat.md, Notifications), handled without opening the
 * app: kept in the chat's outbox in the time the system gives a receiver (`goAsync`), and sent by
 * the outbox's worker in the time WorkManager gives it ([Push.reply]).
 */
class ChatReply : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val groupId = intent.getStringExtra(ChatNotifier.EXTRA_GROUP_ID) ?: return
    val threadId = intent.getStringExtra(ChatNotifier.EXTRA_THREAD_ID) ?: return
    val seq = intent.getLongExtra(ChatNotifier.EXTRA_SEQ, 0)
    val words = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(ChatNotifier.REPLY)?.toString().orEmpty()
    val pending = goAsync()
    (context.applicationContext as Push.Holder).push.reply(groupId, threadId, seq, words, done = pending::finish)
  }
}
