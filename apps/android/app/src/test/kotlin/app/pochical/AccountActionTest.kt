package app.pochical

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import androidx.activity.ComponentActivity
import app.pochical.kit.AccountState
import app.pochical.kit.AppleWebSignIn
import app.pochical.kit.DeletionFailure
import app.pochical.kit.NotSignedIn
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import java.io.IOException
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
 * ログアウト and アカウントを削除 go on through an activity made anew (#985, #1057), as a sign-in
 * does. The account's calls stand in for SyncAccount's: the deletion asks Apple as it does and fails as
 * it does when Apple gives no code, and signing out waits on [signedOut] as on the outbox and server.
 */
@RunWith(RobolectricTestRunner::class)
class AccountActionTest {
  private val apple = AppleSignIn(AppleWebSignIn("http://localhost/".toHttpUrl(), lazyOf(OkHttpClient())))
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  private val account = MutableStateFlow<AccountState>(AccountState.SignedIn("user-1", null))

  /** What Apple answered the deletion, once it did. */
  private val answered = CompletableDeferred<String?>()

  /** How the server answered signing out, once it does. */
  private val signedOut = CompletableDeferred<Unit>()

  private fun actions(deleteAccount: suspend () -> Unit = ::deleteWithApple) =
    AccountActions(signOut = { signedOut.await() }, deleteAccount = deleteAccount, account = account, scope = scope)

  private suspend fun deleteWithApple() {
    val code =
      try {
        apple.authorizationCode()
      } catch (e: Exception) {
        throw DeletionFailure(DeletionFailure.Reason.AppleUnconfirmed, e)
      }
    answered.complete(code)
  }

  private val actions = actions()
  private val deletion = actions.deletion
  private val signOut = actions.signOut

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
    deletion.run()
    val opened = checkNotNull(shadowOf(first.get()).nextStartedActivity?.data) { "No page opened" }
    val returnTo = Uri.parse("pochical://apple-sign-in?state=${opened.getQueryParameter("challenge")}&error=failed")

    val turned = turn(first)
    assertTrue("Still deleting in the activity made anew", deletion.running)
    turned.newIntent(Intent(Intent.ACTION_VIEW, returnTo))
    turned.resume()
    idle()

    assertFalse(deletion.running)
    assertEquals(DeletionFailure.Reason.AppleUnconfirmed, deletion.failure)
    deletion.failureRead()
    assertNull(deletion.failure)
  }

  @Test
  fun aPageClosedAfterTheActivityIsTurnedDeletesNothingAndSaysNothing() {
    val first = activity()
    deletion.run()

    val turned = turn(first)
    assertTrue("Still deleting in the activity made anew", deletion.running)
    turned.resume()
    idle()

    assertTrue(answered.isCompleted)
    assertNull(answered.getCompleted())
    assertFalse(deletion.running)
    assertNull(deletion.failure)
  }

  @Test
  fun aSecondTapWhileDeletingAsksNothingMore() {
    val first = activity()
    deletion.run()
    shadowOf(first.get()).nextStartedActivity
    deletion.run()

    assertNull("Apple's page opened once", shadowOf(first.get()).nextStartedActivity)
  }

  @Test
  fun anEndedSessionIsSaidInPlaceOfTheAppNotHere() {
    val ended = actions { throw DeletionFailure(DeletionFailure.Reason.SessionEnded) }.deletion
    ended.run()
    idle()

    assertFalse(ended.running)
    assertNull(ended.failure)
  }

  @Test
  fun aFailureGoesWithTheUserTheDeviceLetsGoOf() {
    val failing = actions { throw DeletionFailure(DeletionFailure.Reason.Offline) }.deletion
    failing.run()
    idle()
    assertEquals(DeletionFailure.Reason.Offline, failing.failure)

    account.value = AccountState.Erasing(AccountState.Erasing.Why.SignedOut, failed = false)
    idle()

    assertNull(failing.failure)
  }

  @Test
  fun aSignOutGoesOnThroughAnActivityMadeAnewAndSaysItFailed() {
    val first = activity()
    signOut.run()
    turn(first).resume()
    idle()
    assertTrue("Still signing out in the activity made anew", signOut.running)
    assertTrue("No other change offered meanwhile", actions.running)

    signedOut.completeExceptionally(IOException("offline"))
    idle()

    assertFalse(signOut.running)
    assertEquals(Unit, signOut.failure)
    signOut.failureRead()
    assertNull(signOut.failure)
  }

  @Test
  fun aSecondTapWhileSigningOutAsksNothingMore() {
    var asked = 0
    val counting = AccountActions({ asked++; signedOut.await() }, {}, account, scope).signOut
    counting.run()
    counting.run()
    idle()

    assertEquals(1, asked)
  }

  @Test
  fun aSignOutWhoseSessionTheServerDoesNotKnowIsSaidInPlaceOfTheApp() {
    signedOut.completeExceptionally(NotSignedIn())
    signOut.run()
    idle()

    assertFalse(signOut.running)
    assertNull(signOut.failure)
  }

  @Test
  fun aSignOutFailureGoesWithTheEndedSession() {
    signedOut.completeExceptionally(IOException("offline"))
    signOut.run()
    idle()
    assertEquals(Unit, signOut.failure)

    account.value = AccountState.SessionEnded
    idle()

    assertNull(signOut.failure)
  }
}
