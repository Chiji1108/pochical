package app.pochical.kit

import java.time.LocalDate
import kotlinx.serialization.Serializable
import org.junit.Test

/** When the apps may ask for a review (spec/review.md), as spec/vectors/review.json pins it. */
class ReviewTest {
  @Serializable
  private data class Case(
    override val name: String,
    val opened: List<String>,
    val lastAsked: ReviewHistory.Ask? = null,
    val version: String,
    val troubled: Boolean,
    val expected: Boolean,
  ) : VectorCase

  @Serializable private data class Vectors(val mayAsk: List<Case>)

  @Test
  fun mayAskForAReview() {
    vectors<Vectors>("review").mayAsk.checkEach(expected = { it.expected }) { case ->
      var history: ReviewHistory? = null
      for (day in case.opened) history = ReviewHistory.opened(history, LocalDate.parse(day))
      val today = LocalDate.parse(case.opened.last())
      val kept = history!!.copy(lastAsked = case.lastAsked)
      kept.mayAsk(today, case.version, case.troubled)
    }
  }
}
