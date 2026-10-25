package app.pochical.kit

import app.pochical.design.Review
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import kotlinx.serialization.Serializable

/**
 * What a device keeps of its own use for the store's review prompt (spec/review.md), on the device
 * only, and whether it may ask now: the same reckoning as iOS's ReviewHistory and /design's
 * lib/review.ts, pinned by spec/vectors/review.json. Days are local days, "YYYY-MM-DD".
 */
@Serializable
data class ReviewHistory(
  val firstOpened: String,
  val lastOpened: String,
  /** The separate days the app was opened on. */
  val openDays: Int,
  /** The calendar months those days fall in. */
  val openMonths: Int,
  val lastAsked: Ask? = null,
) {
  /** The day and the app's version of an ask. */
  @Serializable data class Ask(val day: String, val version: String)

  /**
   * Whether to ask now, at a moment the spec allows: just after the person finished putting
   * something on their days. [troubled] says something went wrong since the app came to the front.
   */
  fun mayAsk(today: LocalDate, version: String, troubled: Boolean): Boolean {
    val usedForAWhile =
      daysSince(firstOpened, today) >= Review.minDaysSinceFirstOpen &&
        openDays >= Review.minOpenDays &&
        openMonths >= Review.minOpenMonths
    val askedLongAgo = lastAsked?.let { it.version != version && daysSince(it.day, today) >= Review.minDaysBetweenAsks } ?: true
    return usedForAWhile && askedLongAgo && !troubled
  }

  /** Kept as asked on [today], though the store does not say whether its prompt showed. */
  fun asked(today: LocalDate, version: String): ReviewHistory = copy(lastAsked = Ask(today.toString(), version))

  companion object {
    /** The history after the app was opened on [day]: a day already counted counts once, and a month once. */
    fun opened(history: ReviewHistory?, day: LocalDate): ReviewHistory {
      val key = day.toString()
      if (history == null) return ReviewHistory(key, key, openDays = 1, openMonths = 1)
      if (history.lastOpened == key) return history
      val sameMonth = YearMonth.from(LocalDate.parse(history.lastOpened)) == YearMonth.from(day)
      return history.copy(lastOpened = key, openDays = history.openDays + 1, openMonths = history.openMonths + if (sameMonth) 0 else 1)
    }

    private fun daysSince(day: String, today: LocalDate) = ChronoUnit.DAYS.between(LocalDate.parse(day), today)
  }
}
