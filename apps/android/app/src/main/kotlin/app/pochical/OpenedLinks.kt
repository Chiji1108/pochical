package app.pochical

import android.content.Intent
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import app.pochical.kit.openedInviteCode
import java.net.URI
import java.net.URISyntaxException
import java.time.LocalDate
import java.time.format.DateTimeParseException

/** A place in the app a link opening it names. */
sealed interface AppLink {
  /**
   * An invitation: the site's アプリで開く (pochical://invite/{code}) or
   * https://pochical.app/invite/{code}, which the app holds as an App Link (spec/sync-protocol.md,
   * Groups).
   */
  data class Invite(val code: String) : AppLink

  /** A day of the calendar, as a widget opens it: pochical://day/{yyyy-mm-dd} (spec/widgets.md, Opening the app). */
  data class Day(val day: LocalDate) : AppLink

  /** A group's table at a day, or its top: pochical://group/{groupId}, with /day/{yyyy-mm-dd} after it. */
  data class Group(val groupId: String, val day: LocalDate? = null) : AppLink
}

/** The place [url] names, or none for a link the app does not open. */
fun appLink(url: String): AppLink? {
  openedInviteCode(url)?.let { return AppLink.Invite(it) }
  val uri =
    try {
      URI(url)
    } catch (_: URISyntaxException) {
      return null
    }
  if (!uri.scheme.equals("pochical", ignoreCase = true)) return null
  val parts = uri.path.orEmpty().split("/").filter { it.isNotEmpty() }
  return when (uri.host?.lowercase()) {
    "day" -> parts.singleOrNull()?.let(::dayOf)?.let(AppLink::Day)
    "group" ->
      when {
        parts.size == 1 -> AppLink.Group(parts[0])
        parts.size == 3 && parts[1] == "day" -> dayOf(parts[2])?.let { AppLink.Group(parts[0], it) }
        else -> null
      }
    else -> null
  }
}

private fun dayOf(text: String): LocalDate? =
  try {
    LocalDate.parse(text)
  } catch (_: DateTimeParseException) {
    null
  }

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
