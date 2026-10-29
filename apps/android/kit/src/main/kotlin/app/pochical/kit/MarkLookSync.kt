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
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * The shape the user's groups should draw their marks in, when it is not what the account last said
 * (spec/sync-protocol.md, Profile; spec/vectors/preferences.json, markLookToSend): the [look] the
 * account keeps among the preferences ([accountLook]), never the device's own before it has taken
 * the account's. The account's word unset, or on a shape this app does not know, is the app's
 * default.
 */
internal fun markLookToSend(look: Look?, profile: ProfileRow?): MarkLook? {
  look ?: return null
  val said = profile?.let { row -> MarkStyle.entries.find { it.id == row.markStyle }?.let { markLook(it, row.markFill) } }
  return look.markLook.takeIf { it != (said ?: Look().markLook) }
}

private val Look.markLook: MarkLook
  get() = markLook(style, fill)

private fun markLook(style: MarkStyle, fill: Boolean): MarkLook = markLook {
  this.style = style.id
  this.fill = fill
}

/**
 * Tells the account the shape the user's marks are drawn in whenever it is not what the account
 * last said, so their groups draw them so: as the user changes their スタイル, and each time the
 * user's socket has caught up while a send has not gone through, so after the account's word has
 * been taken, and again once the network comes back. The account's word coming back on the socket
 * clears it.
 */
internal fun CoroutineScope.syncMarkLook(
  /** The look the account keeps ([accountLook]). */
  look: Flow<Look?>,
  profile: Flow<ProfileRow?>,
  userSocket: Flow<SocketState>,
  send: suspend (MarkLook) -> Unit,
) = launch {
  val current = userSocket.map { it == SocketState.Current }.distinctUntilChanged()
  combine(look.distinctUntilChanged(), profile, current) { look, profile, current -> if (current) markLookToSend(look, profile) else null }
    .distinctUntilChanged()
    .collectLatest { toSend ->
      toSend ?: return@collectLatest
      try {
        send(toSend)
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        Log.i("MarkLookSync", "The marks' shape was not taken, sent again as the socket next catches up: $e")
      }
    }
}
