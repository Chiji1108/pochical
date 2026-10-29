package app.pochical.kit

import android.util.Log
import app.pochical.v1.MarkLook
import app.pochical.v1.markLook
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

/**
 * The shape the user's groups should draw their marks in, when it is not what the account last said
 * (spec/sync-protocol.md, Profile): the look the account keeps among the [preferences], never the
 * device's own before it has taken the account's. The account's word unset is the app's default.
 */
internal fun markLookToSend(preferences: List<PreferenceRow>, profile: ProfileRow?): MarkLook? {
  val look = preferences.find { it.key == "look" }?.let { lookOf(it.value) } ?: return null
  val kept = profile?.takeIf { it.markStyle.isNotEmpty() }?.let { markLook(it.markStyle, it.markFill) } ?: Look().markLook
  return look.markLook.takeIf { it != kept }
}

private val Look.markLook: MarkLook
  get() = markLook(style.id, fill)

private fun markLook(style: String, fill: Boolean): MarkLook = markLook {
  this.style = style
  this.fill = fill
}

/**
 * Tells the account the shape the user's marks are drawn in whenever it is not what the account
 * last said, so their groups draw them so: as the user changes their スタイル, as they sign in, and
 * again at each start while a send has not gone through. Offline, it goes at the next start or
 * change; the account's word coming back on the socket clears it.
 */
internal fun CoroutineScope.syncMarkLook(values: Values, users: Flow<String?>, send: suspend (MarkLook) -> Unit) = launch {
  combine(values.preferences(), values.profile(), users) { preferences, profile, user ->
      user?.let { markLookToSend(preferences, profile) }
    }
    .distinctUntilChanged()
    .collectLatest { look ->
      look ?: return@collectLatest
      try {
        send(look)
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        Log.i("MarkLookSync", "The marks' shape was not taken, sent again at the next start or change: $e")
      }
    }
}
