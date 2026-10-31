package app.pochical

import android.content.Intent
import android.net.Uri
import app.pochical.kit.AppLink
import app.pochical.kit.appLink
import app.pochical.notifications.ChatNotifier
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OpenedLinksTest {
  private fun opening(link: String) = Intent(Intent.ACTION_VIEW, Uri.parse(link))

  @Test
  fun anInvitationsLinkWaitsForTheScreensOnce() {
    val links = OpenedLinks()
    links.take(opening("https://pochical.app/invite/Toko2345"))
    assertEquals(AppLink.Invite("Toko2345"), links.consume())
    assertNull("taken once", links.consume())
  }

  @Test
  fun otherLinksOpenNothing() {
    val links = OpenedLinks()
    links.take(opening("pochical://apple-sign-in?code=x"))
    links.take(Intent(Intent.ACTION_MAIN))
    links.take(null)
    assertNull(links.consume())
  }

  @Test
  fun aChatsNotificationOpensTheChat() {
    val links = OpenedLinks()
    links.take(
      Intent(ChatNotifier.ACTION_OPEN_CHAT)
        .putExtra(ChatNotifier.EXTRA_GROUP_ID, "g1")
        .putExtra(ChatNotifier.EXTRA_THREAD_ID, "direct:u1:u2")
    )
    assertEquals(AppLink.Chat("g1", "direct:u1:u2"), links.consume())
    // One naming no chat opens nothing.
    links.take(Intent(ChatNotifier.ACTION_OPEN_CHAT))
    assertNull(links.consume())
  }

  @Test
  fun theSitesOpenInTheAppOpensItsInvitation() {
    val links = OpenedLinks()
    links.take(opening("pochical://invite/Toko2345"))
    assertEquals(AppLink.Invite("Toko2345"), links.pending)
  }

  @Test
  fun readsTheDaysAndGroupsAWidgetOpens() {
    val day = LocalDate.of(2026, 9, 24)
    assertEquals(AppLink.Day(day), appLink("pochical://day/2026-09-24"))
    assertEquals(AppLink.Group("g1"), appLink("pochical://group/g1"))
    assertEquals(AppLink.Group("g1", day), appLink("pochical://group/g1/day/2026-09-24"))
    // A day it cannot read opens the group's top, as on iOS.
    assertEquals(AppLink.Group("g1"), appLink("pochical://group/g1/week/2026-09-24"))
    assertEquals(AppLink.Group("g1"), appLink("pochical://group/g1/day/2026-13-01"))
  }

  @Test
  fun aCalendarEventsLinkOpensItsDay() {
    val links = OpenedLinks()
    links.take(opening("https://pochical.app/day/2026-09-24?by=u7Hk2Qx"))
    assertEquals(AppLink.Day(LocalDate.of(2026, 9, 24)), links.consume())
    assertEquals(AppLink.Day(LocalDate.of(2026, 9, 24)), appLink("https://Pochical.app/day/2026-09-24/"))
  }

  @Test
  fun readsTheLaunchersShortcuts() {
    assertEquals(AppLink.Today, appLink("pochical://today"))
    assertEquals(AppLink.NextOff, appLink("pochical://next-off"))
  }

  @Test
  fun leavesWhatItDoesNotOpen() {
    val urls =
      listOf(
        "pochical://today/2026-09-24",
        "pochical://next-off/2026-09-24",
        "pochical://day/",
        "pochical://day/2026-13-01",
        "pochical://group/",
        "https://example.com/day/2026-09-24",
        "https://pochical.app/day/2026-13-01",
        "https://pochical.app/day/",
        "https://pochical.app/today",
        "https://pochical.app/group/g1",
        "http://pochical.app/day/2026-09-24",
      )
    for (url in urls) assertNull(url, appLink(url))
  }
}
