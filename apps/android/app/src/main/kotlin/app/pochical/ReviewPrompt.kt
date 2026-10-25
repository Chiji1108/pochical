package app.pochical

import android.app.Activity
import android.content.Context
import android.util.Log
import androidx.core.content.edit
import app.pochical.kit.ReviewHistory
import com.google.android.play.core.review.ReviewManagerFactory
import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
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

  /** Where the history is read and kept, away from the main thread. */
  private val io = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  /** The app came to the front today. */
  fun opened(context: Context) {
    troubled = false
    val today = LocalDate.now()
    io.launch { save(context, ReviewHistory.opened(history(context), today)) }
  }

  /** Asks Play for its prompt over [activity] if the person has used Pochical long enough, kept as asked. */
  suspend fun askIfDue(activity: Activity) {
    val version = BuildConfig.VERSION_NAME
    val due =
      withContext(Dispatchers.IO) {
        val history = history(activity) ?: return@withContext false
        if (!history.mayAsk(LocalDate.now(), version, troubled)) return@withContext false
        // Kept as asked first, though Play does not say whether it showed, so it is never asked twice.
        save(activity, history.asked(LocalDate.now(), version))
        true
      }
    if (!due) return
    val manager = ReviewManagerFactory.create(activity)
    try {
      manager.launchReviewFlow(activity, manager.requestReviewFlow().await()).await()
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
        Json.decodeFromString(ReviewHistory.serializer(), it).also { history ->
          (listOf(history.firstOpened, history.lastOpened) + listOfNotNull(history.lastAsked?.day)).forEach(LocalDate::parse)
        }
      } catch (_: SerializationException) {
        // One it cannot read is none: counted again from today.
        null
      } catch (_: DateTimeParseException) {
        null
      }
    }

  private fun save(context: Context, history: ReviewHistory) {
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit { putString(KEY, Json.encodeToString(ReviewHistory.serializer(), history)) }
  }
}
