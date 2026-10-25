package app.pochical

import android.content.ActivityNotFoundException
import android.content.Context
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri

/** Pochical's site, whose pages 設定's ポチカルについて opens, as iOS's Site. */
object Site {
  const val ROOT = "https://pochical.app"

  fun page(path: String): String = "$ROOT/$path"

  /** Google Play's listing, where a review is written, which there is none of before release (spec/review.md). */
  val writeReview: String? = null
}

/**
 * A page opened in the system's browser sheet over the app (Custom Tabs, as iOS's SafariView): a
 * link of a chat's (spec/chat.md, In a message) or a page of the site.
 */
fun openLink(context: Context, url: String) {
  try {
    CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, url.toUri())
  } catch (_: ActivityNotFoundException) {
    // No browser on the device to open it (a work profile with every one turned off): nothing opens.
  }
}
