package app.pochical

import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.browser.auth.AuthTabIntent
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.pochical.kit.AppleWebSignIn
import app.pochical.kit.ProviderToken
import kotlinx.coroutines.CompletableDeferred

/** Appleで続ける for the pages that offer it, made with the activity. */
val LocalAppleSignIn = staticCompositionLocalOf<AppleSignIn> { error("No Apple sign-in provided") }

/**
 * Appleで続ける (spec/sync-protocol.md, Signing in): Apple's web page, by way of the server, in an
 * Auth Tab, or in a Custom Tab where the browser has none; never in a WebView, whose page the app
 * could read (RFC 8252). Made with [activity], before it is created, as its result launcher must be.
 */
class AppleSignIn(private val activity: ComponentActivity, private val web: AppleWebSignIn) {
  /** The page open now, and where what it returns to goes. */
  private sealed interface Open {
    val returned: CompletableDeferred<Uri?>
  }

  /** An Auth Tab hands back its return, or nothing when closed, as its result. */
  private class InAuthTab(override val returned: CompletableDeferred<Uri?>) : Open

  /**
   * A Custom Tab's return opens the app by its scheme (the manifest's intent filter), coming in as
   * a new intent before the activity resumes; resumed without one, the tab was closed.
   */
  private class InCustomTab(override val returned: CompletableDeferred<Uri?>) : Open {
    var left = false
  }

  private var open: Open? = null

  private val authTab =
    AuthTabIntent.registerActivityResultLauncher(activity) { result ->
      (open as? InAuthTab)?.returned?.complete(result.resultUri.takeIf { result.resultCode == AuthTabIntent.RESULT_OK })
    }

  init {
    activity.addOnNewIntentListener { intent ->
      val uri = intent.data
      if (uri?.scheme == AppleWebSignIn.RETURN_SCHEME && uri.host == AppleWebSignIn.RETURN_HOST) {
        (open as? InCustomTab)?.returned?.complete(uri)
      }
    }
    activity.lifecycle.addObserver(
      LifecycleEventObserver { _, event ->
        val customTab = open as? InCustomTab ?: return@LifecycleEventObserver
        when (event) {
          Lifecycle.Event.ON_PAUSE -> customTab.left = true
          Lifecycle.Event.ON_RESUME -> if (customTab.left) customTab.returned.complete(null)
          else -> {}
        }
      }
    )
  }

  /**
   * The person's Apple account: null when they closed the page or cancelled on it;
   * [app.pochical.kit.AppleSignInFailed] when Apple's page or the server failed.
   */
  suspend fun signIn(): ProviderToken? {
    val attempt = web.start()
    val returned = browse(attempt.url) ?: return null
    return attempt.finish(returned)
  }

  private suspend fun browse(url: Uri): Uri? {
    open?.returned?.cancel()
    val returned = CompletableDeferred<Uri?>()
    val browser = CustomTabsClient.getPackageName(activity, emptyList())
    if (browser != null && CustomTabsClient.isAuthTabSupported(activity, browser)) {
      open = InAuthTab(returned)
      AuthTabIntent.Builder().build().launch(authTab, url, AppleWebSignIn.RETURN_SCHEME)
    } else {
      open = InCustomTab(returned)
      CustomTabsIntent.Builder().build().launchUrl(activity, url)
    }
    try {
      return returned.await()
    } finally {
      if (open?.returned === returned) open = null
    }
  }
}
