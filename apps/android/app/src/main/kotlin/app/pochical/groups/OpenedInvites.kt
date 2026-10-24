package app.pochical.groups

import android.content.Intent
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import app.pochical.kit.openedInviteCode

/**
 * The invitation a link opening the app carries, waiting for the screens to open its join screen:
 * the site's アプリで開く (pochical://invite/{code}) or https://pochical.app/invite/{code}, which the
 * app holds as an App Link (spec/sync-protocol.md, Groups).
 */
@Stable
class OpenedInvites {
  /** The code of the last invitation opened, until the screens take it. */
  var pending by mutableStateOf<String?>(null)
    private set

  /** Notes the invitation [intent] opens the app with, if it is one. */
  fun take(intent: Intent?) {
    intent?.dataString?.let(::openedInviteCode)?.let { pending = it }
  }

  /** The code waiting, taken once. */
  fun consume(): String? = pending.also { pending = null }
}

val LocalOpenedInvites = staticCompositionLocalOf { OpenedInvites() }
