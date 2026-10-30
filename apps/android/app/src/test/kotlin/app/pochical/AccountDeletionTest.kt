package app.pochical

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import androidx.activity.ComponentActivity
import app.pochical.kit.AccountState
import app.pochical.kit.AppleWebSignIn
import app.pochical.kit.DeletionFailure
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController

/**
 * アカウントを削除 goes on through an activity made anew while Apple is asked for its code (#985),
 * as a sign-in does. The account's deletion stands in for SyncAccount's, asking Apple as it does
 * and failing as it does when Apple gives no code.
 */
@RunWith(RobolectricTestRunner::class)
class AccountDeletionTest {
  private val apple = AppleSignIn(AppleWebSignIn("http://localhost/".toHttpUrl(), lazyOf(OkHttpClient())))
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  private val account = MutableStateFlow<AccountState>(AccountState.SignedIn("user-1", null))

  /** What Apple answered the deletion, once it did. */
  private val answered = CompletableDeferred<String?>()

  private val deletion =
    AccountDeletion(
      deleteAccount = { appleCode ->
        val code =
          try {
            appleCode()
          } catch (e: Exception) {
            throw DeletionFailure(DeletionFailure.Reason.AppleUnconfirmed, e)
          }
        answered.complete(code)
        code != null
      },
      appleCode = apple::authorizationCode,
      account = account,
      scope = scope,
    )

  @After fun cancel() = scope.cancel()

  private fun activity(saved: Bundle? = null): ActivityController<ComponentActivity> {
    val controller = Robolectric.buildActivity(ComponentActivity::class.java)
    apple.attach(controller.get())
    return controller.create(saved).start().postCreate(saved).resume().visible()
  }

  /**
   * The activity turned while the page is open: its state saved, ended and made anew from it, not yet
   * resumed. Robolectric has no browser with Auth Tabs, so the page is a Custom Tab, and the activity
   * resumed without the page's return finds it closed.
   */
  private fun turn(controller: ActivityController<ComponentActivity>): ActivityController<ComponentActivity> {
    val saved = Bundle()
    controller.pause().stop().saveInstanceState(saved).destroy()
    val turned = Robolectric.buildActivity(ComponentActivity::class.java)
    apple.attach(turned.get())
    return turned.create(saved).start().postCreate(saved)
  }

  private fun idle() = shadowOf(Looper.getMainLooper()).idle()

  @Test
  fun aDeletionWhosePageFailsAfterTheActivityIsTurnedSaysSo() {
    val first = activity()
    deletion.delete()
    val opened = checkNotNull(shadowOf(first.get()).nextStartedActivity?.data) { "No page opened" }
    val returnTo = Uri.parse("pochical://apple-sign-in?state=${opened.getQueryParameter("challenge")}&error=failed")

    val turned = turn(first)
    assertTrue("Still deleting in the activity made anew", deletion.deleting)
    turned.newIntent(Intent(Intent.ACTION_VIEW, returnTo))
    turned.resume()
    idle()

    assertFalse(deletion.deleting)
    assertEquals(DeletionFailure.Reason.AppleUnconfirmed, deletion.failure)
    deletion.failureRead()
    assertNull(deletion.failure)
  }

  @Test
  fun aPageClosedAfterTheActivityIsTurnedDeletesNothingAndSaysNothing() {
    val first = activity()
    deletion.delete()

    val turned = turn(first)
    assertTrue("Still deleting in the activity made anew", deletion.deleting)
    turned.resume()
    idle()

    assertTrue(answered.isCompleted)
    assertNull(answered.getCompleted())
    assertFalse(deletion.deleting)
    assertNull(deletion.failure)
  }

  @Test
  fun aSecondTapWhileDeletingAsksNothingMore() {
    val first = activity()
    deletion.delete()
    shadowOf(first.get()).nextStartedActivity
    deletion.delete()

    assertNull("Apple's page opened once", shadowOf(first.get()).nextStartedActivity)
  }

  @Test
  fun anEndedSessionIsSaidInPlaceOfTheAppNotHere() {
    val ended =
      AccountDeletion({ throw DeletionFailure(DeletionFailure.Reason.SessionEnded) }, { null }, account, scope)
    ended.delete()
    idle()

    assertFalse(ended.deleting)
    assertNull(ended.failure)
  }

  @Test
  fun aFailureGoesWithTheUserTheDeviceLetsGoOf() {
    val failing = AccountDeletion({ throw DeletionFailure(DeletionFailure.Reason.Offline) }, { null }, account, scope)
    failing.delete()
    idle()
    assertEquals(DeletionFailure.Reason.Offline, failing.failure)

    account.value = AccountState.Erasing(AccountState.Erasing.Why.SignedOut, failed = false)
    idle()

    assertNull(failing.failure)
  }
}
