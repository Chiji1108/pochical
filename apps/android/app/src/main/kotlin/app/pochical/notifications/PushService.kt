package app.pochical.notifications

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.runBlocking

/**
 * What FCM hands the app (spec/sync-protocol.md, Push): its token for the device, and the server's
 * messages, data alone, which the app words and shows itself. FCM calls it on a thread of its own
 * and takes a message as handled once it returns, so each is handled before returning.
 */
class PushService : FirebaseMessagingService() {
  private val push: Push
    get() = (application as Push.Holder).push

  override fun onNewToken(token: String) = push.took(token)

  override fun onMessageReceived(message: RemoteMessage) = runBlocking { push.handle(message.data) }
}
