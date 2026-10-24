package app.pochical.kit

import java.time.LocalDate
import kotlinx.serialization.Serializable
import org.junit.Test

@Serializable
private data class MonthVectors(val summary: List<Summary>) {
  @Serializable data class Pattern(val id: String, val countsAsOff: Boolean, val archived: Boolean = false)

  @Serializable data class Count(val id: String, val days: Int)

  @Serializable data class Expected(val daysOff: Int, val counts: List<Count>, val unfilled: Int)

  @Serializable
  data class Summary(
    override val name: String,
    val first: String,
    val last: String,
    val patterns: List<Pattern>,
    val shown: Map<String, String>,
    val expected: Expected,
  ) : VectorCase
}

class PageSummaryTest {
  @Test
  fun summary() =
    vectors<MonthVectors>("month").summary.checkEach({ it.expected }) { case ->
      val patterns =
        case.patterns.map { PatternRow(it.id, it.id, "⭐️", it.id, "star", 0, null, null, it.countsAsOff, null, it.archived) }
      val summary =
        PageSummary.of(
          LocalDate.parse(case.first),
          LocalDate.parse(case.last),
          case.shown.mapKeys { LocalDate.parse(it.key) },
          patterns,
        )
      MonthVectors.Expected(summary.daysOff, summary.counts.map { (id, days) -> MonthVectors.Count(id, days) }, summary.unfilled)
    }
}
