package app.pochical.groups

import android.content.Intent
import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OpenedInvitesTest {
  private fun opening(link: String) = Intent(Intent.ACTION_VIEW, Uri.parse(link))

  @Test
  fun anInvitationsLinkWaitsForTheScreensOnce() {
    val invites = OpenedInvites()
    invites.take(opening("https://pochical.app/invite/Toko2345"))
    assertEquals("Toko2345", invites.consume())
    assertNull("taken once", invites.consume())
  }

  @Test
  fun otherLinksOpenNothing() {
    val invites = OpenedInvites()
    invites.take(opening("pochical://apple-sign-in?code=x"))
    invites.take(Intent(Intent.ACTION_MAIN))
    invites.take(null)
    assertNull(invites.consume())
  }

  @Test
  fun theSitesOpenInTheAppOpensItsInvitation() {
    val invites = OpenedInvites()
    invites.take(opening("pochical://invite/Toko2345"))
    assertEquals("Toko2345", invites.pending)
  }
}
