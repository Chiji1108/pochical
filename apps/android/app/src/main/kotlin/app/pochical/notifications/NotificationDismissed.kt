package app.pochical.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The system telling the app the person dismissed a chat's notification (ChatNotifier). */
class NotificationDismissed : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val tag = intent.getStringExtra(ChatNotifier.EXTRA_TAG) ?: return
    (context.applicationContext as Push.Holder).push.notifier.dismissed(tag)
  }
}
