package app.pochical

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri

/** Pochical's site, whose pages 設定's ポチカルについて opens, as iOS's Site. */
object Site {
  const val ROOT = "https://pochical.app"

  fun page(path: String): String = "$ROOT/$path"

  /** Google Play's listing, where a review is written (spec/review.md). */
  const val WRITE_REVIEW = "https://play.google.com/store/apps/details?id=app.pochical"
}

/** Google Play's own app, which a link to a listing names so that no browser takes it. */
private const val PLAY_STORE = "com.android.vending"

/**
 * Pochical's listing in the Play Store app, where its review is written, opened as Google has an
 * app link to a listing (developer.android.com/distribute/marketing-tools/linking-to-google-play);
 * on a device with no Play Store, the listing's page as any other.
 */
fun openListing(context: Context) {
  try {
    context.startActivity(Intent(Intent.ACTION_VIEW, Site.WRITE_REVIEW.toUri()).setPackage(PLAY_STORE))
  } catch (_: ActivityNotFoundException) {
    openLink(context, Site.WRITE_REVIEW)
  }
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
