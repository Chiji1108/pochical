package app.pochical.kit

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

  /**
   * A chat, at ここから新着, as its notification's tap opens it (spec/chat.md, Notifications): a
   * group's, or the chat with Pochical's people. No link names one; the notification's intent does.
   */
  data class Chat(val groupId: String, val threadId: String) : AppLink
}

/**
 * The place [url] names, or none for a link the app does not open. As iOS's openedGroup, a group
 * link whose day cannot be read opens the group's top.
 */
fun appLink(url: String): AppLink? {
  openedInviteCode(url)?.let { return AppLink.Invite(it) }
  val uri = parsed(url) ?: return null
  if (!uri.scheme.equals("pochical", ignoreCase = true)) return null
  val parts = uri.path.orEmpty().split("/").filter { it.isNotEmpty() }
  return when (uri.host?.lowercase()) {
    "day" -> parts.singleOrNull()?.let(::dayOf)?.let(AppLink::Day)
    "group" -> {
      val groupId = parts.firstOrNull() ?: return null
      AppLink.Group(groupId, parts.takeIf { it.size == 3 && it[1] == "day" }?.let { dayOf(it[2]) })
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
