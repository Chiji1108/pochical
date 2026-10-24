package app.pochical.notifications

import android.util.Log
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

/**
 * Keeps the server told of the device's FCM token (spec/sync-protocol.md, Push): sent under each
 * user the device goes on as, and again whenever FCM gives a new one, while notifications are
 * allowed. One the server could not take is sent again as the app next comes to the front. Signing
 * out and deleting the account need nothing here: the server drops a session's tokens with it.
 */
class PushTokens(
  scope: CoroutineScope,
  /** The user the device is signed in as, null while it is no one or changing. */
  users: Flow<String?>,
  private val register: suspend (token: String) -> Unit,
) {
  private val token = MutableStateFlow<String?>(null)
  private val allowed = MutableStateFlow(false)
  /** Counts the times the app came to the front after a token was not taken. */
  private val tries = MutableStateFlow(0)
  @Volatile private var failed = false

  init {
    scope.launch {
      combine(users.distinctUntilChanged(), token, allowed, tries) { user, token, allowed, _ ->
          if (user != null && token != null && allowed) token else null
        }
        .collectLatest { token ->
          if (token == null) return@collectLatest
          failed =
            try {
              register(token)
              false
            } catch (e: CancellationException) {
              throw e
            } catch (e: Exception) {
              Log.i(TAG, "The push token was not taken, sent again in the foreground: $e")
              true
            }
        }
    }
  }

  /** The token FCM gives, as the app starts or anew. */
  fun took(token: String) {
    this.token.value = token
  }

  /** Whether the system lets the app notify, as it says now. */
  fun allowed(now: Boolean) {
    allowed.value = now
  }

  /** The app came to the front: a token the server did not take is sent again. */
  fun foreground() {
    if (failed) tries.value += 1
  }

  private companion object {
    const val TAG = "PushTokens"
  }
}
