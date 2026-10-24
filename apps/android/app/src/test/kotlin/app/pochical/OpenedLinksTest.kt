package app.pochical

import android.content.Intent
import android.net.Uri
import org.robolectric.RuntimeEnvironment
import app.pochical.notifications.ChatNotifier
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
    assertEquals(Opened.Invite("Toko2345"), links.consume())
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
  fun theSitesOpenInTheAppOpensItsInvitation() {
    val links = OpenedLinks()
    links.take(opening("pochical://invite/Toko2345"))
    assertEquals(Opened.Invite("Toko2345"), links.pending)
  }

  @Test
  fun aChatsNotificationOpensItsChat() {
    val links = OpenedLinks()
    links.take(
      Intent(RuntimeEnvironment.getApplication(), MainActivity::class.java)
        .setAction(ChatNotifier.ACTION_OPEN_CHAT)
        .putExtra(ChatNotifier.EXTRA_GROUP_ID, "g1")
        .putExtra(ChatNotifier.EXTRA_THREAD_ID, "group")
    )
    assertEquals(Opened.Chat("g1", "group"), links.consume())
  }
}
