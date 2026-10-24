package app.pochical.notifications

import android.app.Application
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import app.pochical.kit.AccountState
import app.pochical.kit.PochicalKit
import app.pochical.kit.Pushed
import app.pochical.kit.pushedOf
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * The app's notifications from the server (spec/sync-protocol.md, Push), through Firebase Cloud
 * Messaging: the channels, the device's token kept by the server, what the system lets the app
 * show, and the notifications shown. A build with no Firebase project (no google-services.json, as
 * on CI) runs the same, and hears nothing.
 */
class Push(private val application: Application, kit: PochicalKit, private val scope: CoroutineScope) {
  /** The app, which holds the one Push for what runs without its screens, as the FCM service. */
  interface Holder {
    val push: Push
  }

  private val states = kit.account.state
  private val users = states.map { (it as? AccountState.SignedIn)?.userId }
  private val tokens = PushTokens(scope, users, kit.groups::registerPushToken)
  private val mutableAllowed = MutableStateFlow(false)

  /** Whether the system lets the app show notifications, as it last said. */
  val allowed = mutableAllowed.asStateFlow()

  val notifier =
    ChatNotifier(application, kit.database::owner, { groupId -> kit.database.values().members(groupId).first() })

  /** Sets everything up, as the app starts. */
  fun start() {
    Channels.create(application)
    readPermission()
    if (hasFirebase) askToken() else Log.i(TAG, "No Firebase project in this build: no notifications from the server")
    // The device letting go of a user (spec/sync-protocol.md, Sockets): the notifications of the
    // user before go with their data.
    scope.launch { lettingGo(states).collect { notifier.forgetAll() } }
  }

  private val hasFirebase
    get() = FirebaseApp.getApps(application).isNotEmpty()

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

  /** FCM's new token for the device. */
  fun took(token: String) = tokens.took(token)

  /** Reads again whether the app may notify: it may have changed in the system's settings. */
  fun readPermission() {
    val now = NotificationManagerCompat.from(application).areNotificationsEnabled()
    mutableAllowed.value = now
    tokens.allowed(now)
  }

  /** The app came to the front. */
  fun foreground() {
    readPermission()
    if (hasFirebase && !tokens.hasToken) askToken()
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
