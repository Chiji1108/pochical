package app.pochical

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import androidx.activity.ComponentActivity
import app.pochical.kit.AppleSignInFailed
import app.pochical.kit.AppleWebSignIn
import app.pochical.kit.ProviderToken
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController

/**
 * Apple's page goes on through an activity made anew (#847): turned while it is open, or with the
 * app's process ended. Robolectric has no browser with Auth Tabs, so the page opens in a Custom Tab,
 * whose return comes in as an intent.
 */
@RunWith(RobolectricTestRunner::class)
class AppleSignInTest {
  private val web = AppleWebSignIn("http://localhost/".toHttpUrl(), OkHttpClient())
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  @After fun cancel() = scope.cancel()

  /** An activity [apple] is attached to as it is made, created from [saved] and [intent]. */
  private fun activity(apple: AppleSignIn, saved: Bundle? = null, intent: Intent? = null): ActivityController<ComponentActivity> {
    val controller = Robolectric.buildActivity(ComponentActivity::class.java, intent)
    apple.attach(controller.get())
    return controller.create(saved).start().postCreate(saved).resume().visible()
  }

  /** Where the page returns to for the sign-in it opened in [controller], Apple's page having failed. */
  private fun failedReturn(controller: ActivityController<ComponentActivity>): Uri {
    val opened = checkNotNull(shadowOf(controller.get()).nextStartedActivity?.data) { "No page opened" }
    val challenge = opened.getQueryParameter("challenge")
    return Uri.parse("pochical://apple-sign-in?state=$challenge&error=failed")
  }

  /** The activity left for the page, its state saved and ended, as when it is turned or its process ends. */
  private fun leave(controller: ActivityController<ComponentActivity>): Bundle {
    val saved = Bundle()
    controller.pause().stop().saveInstanceState(saved).destroy()
    return saved
  }

  private fun idle() = shadowOf(Looper.getMainLooper()).idle()

  private fun <T> Deferred<T>.failure(): Throwable? {
    idle()
    assertTrue("Still waiting for the page", isCompleted)
    return getCompletionExceptionOrNull()
  }

  @Test
  fun aPageOpenAsTheActivityIsTurnedReturnsToTheActivityMadeAnew() {
    val apple = AppleSignIn(web)
    val first = activity(apple)
    val asked = scope.async { apple.signIn() }
    val returnTo = failedReturn(first)
    val saved = leave(first)

    val turned = Robolectric.buildActivity(ComponentActivity::class.java)
    apple.attach(turned.get())
    turned.create(saved).start().postCreate(saved)
    turned.newIntent(Intent(Intent.ACTION_VIEW, returnTo))
    turned.resume()

    assertTrue(asked.failure() is AppleSignInFailed)
  }

  @Test
  fun aPageClosedAfterTheActivityIsTurnedSaysSo() {
    val apple = AppleSignIn(web)
    val first = activity(apple)
    val asked = scope.async { apple.signIn() }
    val saved = leave(first)

    activity(apple, saved)

    assertNull(asked.failure())
    assertNull(asked.getCompleted())
  }

  @Test
  fun aSignInWhosePageWasOpenAsTheProcessEndedGoesOnOnceItReturns() {
    val before = AppleSignIn(web)
    val first = activity(before)
    scope.async { before.signIn() }
    val returnTo = failedReturn(first)
    val saved = leave(first)

    // A new process: the app's sign-in made anew, the activity made for the page's return.
    val apple = AppleSignIn(web)
    activity(apple, saved, Intent(Intent.ACTION_VIEW, returnTo))

    val resumed = apple.resumed.tryReceive().getOrNull()
    assertNotNull(resumed)
    val goingOn = scope.async { resumed!!.invoke() }
    assertTrue(goingOn.failure() is AppleSignInFailed)
  }

  @Test
  fun appleAskedForACodeIsNotKeptPastTheProcess() {
    val before = AppleSignIn(web)
    val first = activity(before)
    scope.async { before.authorizationCode() }
    val saved = leave(first)

    val apple = AppleSignIn(web)
    activity(apple, saved)

    assertFalse(apple.resumed.tryReceive().isSuccess)
  }

  @Test
  fun anotherSignInsReturnIsNotThisOnes() {
    val apple = AppleSignIn(web)
    val first = activity(apple)
    val asked = scope.async<ProviderToken?> { apple.signIn() }
    val returnTo = failedReturn(first)
    first.pause().stop()

    first.newIntent(Intent(Intent.ACTION_VIEW, Uri.parse("pochical://apple-sign-in?state=another&error=failed")))
    first.newIntent(Intent(Intent.ACTION_VIEW, returnTo))
    first.restart().resume()

    assertEquals("Apple's page failed", asked.failure()?.message)
  }
}
