package app.pochical

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.browser.auth.AuthTabIntent
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.core.os.bundleOf
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.pochical.kit.AppleAnswer
import app.pochical.kit.AppleWebSignIn
import app.pochical.kit.ProviderToken
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ReceiveChannel

/** Appleで続ける for the pages that offer it, and アカウントを削除 for Apple's code. */
val LocalAppleSignIn = staticCompositionLocalOf<AppleSignIn> { error("No Apple sign-in provided") }

/**
 * Appleで続ける (spec/sync-protocol.md, Signing in): Apple's web page, by way of the server, in an
 * Auth Tab, or in a Custom Tab where the browser has none; never in a WebView, whose page the app
 * could read (RFC 8252).
 *
 * Kept by the app, not the activity, so the page open goes on through an activity made anew, as it
 * is turned: each activity is [attach]ed as it is made, and the one there when the page returns hears
 * it. A sign-in whose page was open as the app's process ended is kept in the activity's saved state
 * and goes on once the activity made in the new process hears the return ([resumed]).
 */
class AppleSignIn(private val web: AppleWebSignIn) {
  private enum class Page {
    /** An Auth Tab hands back its return, or nothing when closed, as its result. */
    AuthTab,

    /**
     * A Custom Tab's return opens the app by its scheme (the manifest's intent filter), coming in as
     * an intent before the activity resumes; resumed without one, the tab was closed.
     */
    CustomTab,
  }

  /** Apple's page open now, for [attempt]; [signingIn] when its answer is a sign-in's, kept should the process end. */
  private class Open(val attempt: AppleWebSignIn.Attempt, val page: Page, val signingIn: Boolean) {
    val returned = CompletableDeferred<Uri?>()
    /** The activity was left for the Custom Tab. */
    var left = false
  }

  private var open: Open? = null

  /** The activity now, which opens the page; attached as it is made, let go of as it ends. */
  private var activity: ComponentActivity? = null
  private var authTab: ActivityResultLauncher<Intent>? = null

  private val resumedSignIns = Channel<suspend () -> ProviderToken?>(Channel.UNLIMITED)

  /**
   * A sign-in whose page was open as the app's process ended, heard of once the activity made anew
   * has its return: what it gives is the person's Apple account, as [signIn]'s.
   */
  val resumed: ReceiveChannel<suspend () -> ProviderToken?> = resumedSignIns

  /** Takes [activity] as the one the page opens from and returns to; called as it is made, before it is created. */
  fun attach(activity: ComponentActivity) {
    val launcher = AuthTabIntent.registerActivityResultLauncher(activity) { result -> returned(result.resultUri.takeIf { result.resultCode == AuthTabIntent.RESULT_OK }, Page.AuthTab) }
    activity.addOnNewIntentListener(::returnedTo)
    activity.savedStateRegistry.registerSavedStateProvider(SAVED_KEY) {
      val kept = open?.takeIf { it.signingIn }
      if (kept == null) Bundle() else bundleOf(NONCE to kept.attempt.kept.nonce, VERIFIER to kept.attempt.kept.verifier, PAGE to kept.page.name)
    }
    activity.lifecycle.addObserver(
      LifecycleEventObserver { _, event ->
        when (event) {
          Lifecycle.Event.ON_CREATE -> {
            this.activity = activity
            authTab = launcher
            restore(activity.savedStateRegistry.consumeRestoredStateForKey(SAVED_KEY))
            // Its process ended while a Custom Tab was open, the activity is made for the return.
            returnedTo(activity.intent)
          }
          Lifecycle.Event.ON_PAUSE -> open?.takeIf { it.page == Page.CustomTab }?.left = true
          Lifecycle.Event.ON_RESUME -> open?.takeIf { it.page == Page.CustomTab && it.left }?.returned?.complete(null)
          Lifecycle.Event.ON_DESTROY ->
            if (this.activity === activity) {
              this.activity = null
              authTab = null
            }
          else -> {}
        }
      }
    )
  }

  /**
   * The person's Apple account: null when they closed the page or cancelled on it;
   * [app.pochical.kit.AppleSignInFailed] when Apple's page or the server failed.
   */
  suspend fun signIn(): ProviderToken? = ask(signingIn = true)?.token

  /**
   * Apple asked once more, for a fresh authorization code, as deleting the account needs one to
   * revoke Apple's tokens with (spec/sync-protocol.md, Deleting an account); null when the person
   * closed the page or cancelled on it.
   */
  suspend fun authorizationCode(): String? = ask(signingIn = false)?.authorizationCode

  private suspend fun ask(signingIn: Boolean): AppleAnswer? {
    val activity = checkNotNull(activity) { "No activity to open Apple's page from" }
    val attempt = web.start()
    open?.returned?.cancel()
    val browser = CustomTabsClient.getPackageName(activity, emptyList())
    val page = if (browser != null && CustomTabsClient.isAuthTabSupported(activity, browser)) Page.AuthTab else Page.CustomTab
    val opened = Open(attempt, page, signingIn)
    open = opened
    when (page) {
      Page.AuthTab -> AuthTabIntent.Builder().build().launch(checkNotNull(authTab), attempt.url, AppleWebSignIn.RETURN_SCHEME)
      Page.CustomTab -> CustomTabsIntent.Builder().build().launchUrl(activity, attempt.url)
    }
    return answerOf(opened)
  }

  /** Apple's answer once [opened]'s page returns; it is no longer open after. */
  private suspend fun answerOf(opened: Open): AppleAnswer? {
    val returned =
      try {
        opened.returned.await()
      } finally {
        if (open === opened) open = null
      }
    return returned?.let { opened.attempt.finish(it) }
  }

  /** A sign-in kept by the activity [saved] was, as its process ended with its page open. */
  private fun restore(saved: Bundle?) {
    if (open != null) return
    val nonce = saved?.getString(NONCE) ?: return
    val verifier = saved.getString(VERIFIER) ?: return
    val page = Page.valueOf(saved.getString(PAGE) ?: return)
    val restored = Open(web.resume(AppleWebSignIn.Kept(nonce, verifier)), page, signingIn = true)
    // It was left for the page, which the activity made now comes back from.
    restored.left = true
    open = restored
    resumedSignIns.trySend { answerOf(restored)?.token }
  }

  /** [intent] opened the app at the open page's return, as a Custom Tab's does; another's, or an old one, is not it. */
  private fun returnedTo(intent: Intent?) {
    val uri = intent?.data ?: return
    if (open?.attempt?.isItsReturn(uri) == true) returned(uri, Page.CustomTab)
  }

  private fun returned(uri: Uri?, page: Page) {
    open?.takeIf { it.page == page }?.returned?.complete(uri)
  }

  private companion object {
    const val SAVED_KEY = "app.pochical.AppleSignIn"
    const val NONCE = "nonce"
    const val VERIFIER = "verifier"
    const val PAGE = "page"
  }
}
