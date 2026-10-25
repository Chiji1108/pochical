package app.pochical

import android.content.Intent
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import app.pochical.kit.AppLink
import app.pochical.kit.appLink

/** The place a link opening the app names, waiting for the screens to open it. */
@Stable
class OpenedLinks {
  /** The last place a link opened, until the screens take it. */
  var pending by mutableStateOf<AppLink?>(null)
    private set

  /** Notes the place [intent] opens the app on, if it names one. */
  fun take(intent: Intent?) {
    intent?.dataString?.let(::appLink)?.let { pending = it }
  }

  /** The place waiting, taken once. */
  fun consume(): AppLink? = pending.also { pending = null }
}

val LocalOpenedLinks = staticCompositionLocalOf { OpenedLinks() }
