package app.pochical.notifications

import android.app.Application
import android.util.Log
import app.pochical.kit.AccountState
import app.pochical.kit.PochicalKit
import app.pochical.kit.Pushed
import app.pochical.kit.pushedOf
import app.pochical.kit.DeviceSettings
import app.pochical.kit.ReadState
import app.pochical.kit.SendOutboxWorker
import app.pochical.kit.limitText
import app.pochical.design.TextLimits
import coil3.SingletonImageLoader
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import com.google.firebase.messaging.FirebaseMessaging
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * The app's notifications from the server (spec/sync-protocol.md, Push), through Firebase Cloud
 * Messaging: the channels, the device's token kept by the server, what the system lets the app
 * show, and the notifications shown.
 */
class Push(
  private val application: Application,
  private val kit: PochicalKit,
  private val permission: NotificationPermission,
  /** The device settings, for the テーマ the conversations' marks and faces are drawn in. */
  settings: Flow<DeviceSettings>,
  private val scope: CoroutineScope,
) {
  /** The app, which holds the one Push for what runs without its screens, as the FCM service. */
  interface Holder {
    val push: Push
  }

  private val states = kit.account.state
  private val users = states.map { (it as? AccountState.SignedIn)?.userId }.distinctUntilChanged()
  private val tokens = PushTokens(scope, users, kit.groups::registerPushToken)

  val notifier =
    ChatNotifier(
      application,
      kit.database::owner,
      { groupId -> kit.database.values().members(groupId).first() },
      { groupId -> kit.database.values().groups().first().find { it.id == groupId } },
      DrawnConversations(application, { settings.first().theme }) { SingletonImageLoader.get(application) },
    )

  /** Sets everything up, as the app starts. */
  fun start() {
    Channels.create(application)
    // The server sends to the device's token only while the app may show what it sends.
    scope.launch { permission.allowed.collect(tokens::allowed) }
    askToken()
    // The device letting go of a user (spec/sync-protocol.md, Sockets): the notifications of the
    // user before go with their data.
    scope.launch { lettingGo(states).collect { notifier.forgetAll() } }
    // A group left: its chats' notifications and conversations go with it.
    scope.launch(start = CoroutineStart.UNDISPATCHED) { kit.account.left.collect(notifier::forgetPlace) }
    // The notifications of lines read go as the device learns of the reads, should no withdrawal
    // reach it (spec/chat.md, Notifications): the user's own reads, here or elsewhere, at once,
    // and a chat whose count comes to nothing unread once it does. The first counts read may be
    // older than the notifications since, so only a chat cleared after them counts.
    scope.launch {
      users.collectLatest { me ->
        me ?: return@collectLatest
        var before: ReadState? = null
        kit.chats.readState(me).distinctUntilChanged().collect { read ->
          notifier.withdrawRead(read.copy(cleared = before?.let { read.cleared - it.cleared }.orEmpty()))
          before = read
        }
      }
    }
  }

  /** Asks FCM for the device's token; one not given is asked for again as the app comes to the front. */
  private fun askToken() {
    scope.launch {
      try {
        tokens.took(FirebaseMessaging.getInstance().token.await())
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        Log.i(TAG, "FCM gave no token, asked again in the foreground: $e")
      }
    }
  }

  /** Handles an FCM message's [data]: a notification shown, or those of lines read taken back. */
  suspend fun handle(data: Map<String, String>) {
    when (val pushed = pushedOf(data)) {
      is Pushed.Alert -> notifier.show(pushed.alert)
      is Pushed.Withdraw -> notifier.withdraw(pushed.withdrawal)
      null -> Log.i(TAG, "A message of nothing the app knows: ${data.keys}")
    }
  }

  /**
   * 返信 written on the chat's notification answering its line [seq] (spec/chat.md, Notifications):
   * the words as a line of the user's in the chat, which is read up to that line, kept in its outbox
   * and sent by the outbox's worker, in the time WorkManager gives it. Nothing is sent for empty
   * words; words the device cannot keep bring the notification back, saying so. [done] once kept.
   */
  fun reply(groupId: String, threadId: String, seq: Long, written: String, done: () -> Unit) {
    scope.launch {
      try {
        val me = kit.database.owner()
        val words = limitText(written.trim(), TextLimits.chatMessage)
        if (me == null || words.isEmpty()) {
          notifier.restore(groupId, threadId)
          return@launch
        }
        // Its own read, kept with it, is not to take the notification back before it shows the answer.
        notifier.answering(groupId, threadId)
        try {
          kit.chats.reply(groupId, threadId, me, words, seq)
        } catch (e: CancellationException) {
          throw e
        } catch (e: Exception) {
          Log.w(TAG, "An answer from a notification could not be kept", e)
          notifier.notSent(groupId, threadId, words)
          return@launch
        }
        SendOutboxWorker.enqueue(application)
        notifier.replied(groupId, threadId, words)
      } finally {
        done()
      }
    }
  }

  /** FCM's new token for the device. */
  fun took(token: String) = tokens.took(token)

  /** The app came to the front. */
  fun foreground() {
    permission.read()
    if (!tokens.hasToken) askToken()
    tokens.foreground()
  }

  private companion object {
    const val TAG = "Push"
  }
}

/**
 * Each time the device lets go of the user it was signed in as: as it starts erasing what it held
 * of them (signing out, deleting the account, はじめから使う, offline too), or goes on as another
 * user straight away. A change still waiting on the server ([AccountState.Changing]) is not one.
 */
fun lettingGo(states: Flow<AccountState>): Flow<Unit> = flow {
  var user: String? = null
  states.collect { state ->
    when (state) {
      is AccountState.Erasing -> {
        user = null
        emit(Unit)
      }
      is AccountState.SignedIn -> {
        if (user != null && user != state.userId) emit(Unit)
        user = state.userId
      }
      else -> Unit
    }
  }
}
