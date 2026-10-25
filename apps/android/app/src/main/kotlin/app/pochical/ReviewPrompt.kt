package app.pochical

import android.app.Activity
import android.content.Context
import android.util.Log
import androidx.core.content.edit
import app.pochical.kit.ReviewHistory
import com.google.android.play.core.review.ReviewManagerFactory
import com.google.android.play.core.ktx.launchReview
import com.google.android.play.core.ktx.requestReview
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/**
 * Google Play's review prompt (spec/review.md), as iOS's ReviewPrompt: this device's use, kept in its
 * own preferences and never synced, and whether now is a time to ask. The calendar asks just after
 * the person finished putting something on their days; Play decides itself whether its prompt shows.
 */
object ReviewPrompt {
  private const val FILE = "review"
  private const val KEY = "history"

  /** Something went wrong since the app came to the front: a change refused, an error shown. */
  @Volatile var troubled = false

  /** The app came to the front today. */
  fun opened(context: Context) {
    troubled = false
    save(context, ReviewHistory.opened(history(context), LocalDate.now()))
  }

  /** Asks Play for its prompt over [activity] if the person has used Pochical long enough, kept as asked. */
  suspend fun askIfDue(activity: Activity) {
    val history = history(activity) ?: return
    val version = BuildConfig.VERSION_NAME
    if (!history.mayAsk(LocalDate.now(), version, troubled)) return
    // Kept as asked first, though Play does not say whether it showed, so it is never asked twice.
    save(activity, history.asked(LocalDate.now(), version))
    val manager = ReviewManagerFactory.create(activity)
    try {
      manager.launchReview(activity, manager.requestReview())
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      // Play not reached, or not the store this came from: nothing shows, as when Play decides so.
      Log.i("PochicalReview", "The review prompt was not shown: $e")
    }
  }

  private fun history(context: Context): ReviewHistory? =
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null)?.let {
      try {
        Json.decodeFromString(ReviewHistory.serializer(), it)
      } catch (_: SerializationException) {
        // A shape kept before this build's: counted again from today.
        null
      }
    }

  private fun save(context: Context, history: ReviewHistory) {
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit { putString(KEY, Json.encodeToString(ReviewHistory.serializer(), history)) }
  }
}
