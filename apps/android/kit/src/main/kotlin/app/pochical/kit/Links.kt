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

  /**
   * A day of the calendar: pochical://day/{yyyy-mm-dd}, as a widget opens it (spec/widgets.md,
   * Opening the app), or the site's https://pochical.app/day/{yyyy-mm-dd}, which the app holds as an
   * App Link, as a device calendar's event carries it (spec/calendar.md).
   */
  data class Day(val day: LocalDate) : AppLink

  /** A group's table at a day, or its top: pochical://group/{groupId}, with /day/{yyyy-mm-dd} after it. */
  data class Group(val groupId: String, val day: LocalDate? = null) : AppLink

  /** Today, worked out as the screens open it: pochical://today, the launcher's 今日のシフト (spec/shortcuts.md). */
  data object Today : AppLink

  /**
   * The next day off, today on a day off, as 次の休み not set to anyone opens it, worked out from
   * the days as the screens open it: pochical://next-off, the launcher's 次の休み (spec/shortcuts.md).
   */
  data object NextOff : AppLink

  /**
   * A chat, at ここから新着, as its notification's tap opens it (spec/chat.md, Notifications): a
   * group's, or the chat with Pochical's people. No link names one; the notification's intent does.
   */
  data class Chat(val groupId: String, val threadId: String) : AppLink
}

/** The link that opens the app on a day (spec/widgets.md, Opening the app). */
fun dayLink(day: LocalDate): String = "pochical://day/$day"

/** The site, whose invitations' and days' links the app holds as App Links. */
internal const val SITE_HOST = "pochical.app"

/** Where the site's links to a day begin. */
const val SITE_DAY_LINKS = "https://$SITE_HOST/day/"

/**
 * The site's link to a day, which opens the app on it as [dayLink] does, and elsewhere the site's
 * page saying so: for text another app shows, which makes it a link, as a device calendar's event
 * notes (spec/calendar.md).
 */
fun siteDayLink(day: LocalDate): String = "$SITE_DAY_LINKS$day"

/**
 * The place [url] names, or none for a link the app does not open. As iOS's openedGroup, a group
 * link whose day cannot be read opens the group's top.
 */
fun appLink(url: String): AppLink? {
  openedInviteCode(url)?.let { return AppLink.Invite(it) }
  val uri = parsed(url) ?: return null
  val parts = uri.path.orEmpty().split("/").filter { it.isNotEmpty() }
  if (uri.scheme.equals("https", ignoreCase = true) && uri.host.equals(SITE_HOST, ignoreCase = true)) {
    return parts.takeIf { it.size == 2 && it[0] == "day" }?.let { dayOf(it[1]) }?.let(AppLink::Day)
  }
  if (!uri.scheme.equals("pochical", ignoreCase = true)) return null
  return when (uri.host?.lowercase()) {
    "today" -> AppLink.Today.takeIf { parts.isEmpty() }
    "next-off" -> AppLink.NextOff.takeIf { parts.isEmpty() }
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
