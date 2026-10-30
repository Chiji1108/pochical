package app.pochical.kit

import java.time.LocalDate
import java.time.YearMonth
import kotlinx.serialization.Serializable
import org.junit.Test

@Serializable
private data class MonthVectors(
  val weeks: List<Weeks>,
  val summary: List<Summary>,
  val columns: List<Columns>,
  val tones: List<Tones>,
) {
  @Serializable data class Laid(val first: String, val last: String, val weeks: Int)

  @Serializable
  data class Weeks(override val name: String, val month: String, val weekStart: Int, val expected: Laid) : VectorCase

  @Serializable data class Columns(override val name: String, val weekStart: Int, val expected: List<Int>) : VectorCase

  @Serializable data class Colored(val sunday: Boolean, val saturday: Boolean, val holiday: Boolean)

  @Serializable
  data class Tones(override val name: String, val weekday: Int, val holiday: Boolean, val week: Colored, val expected: String) :
    VectorCase

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

// A month's page (spec/vectors/month.json): its whole weeks, its columns' weekdays, how its days
// are colored, and what it counts.
class PageSummaryTest {
  @Test
  fun weeks() =
    vectors<MonthVectors>("month").weeks.checkEach({ it.expected }) { case ->
      val weeks = Period.of(YearMonth.parse(case.month), 1).weeks(case.weekStart)
      check(weeks.all { it.size == 7 }) { "${case.name}: a week of other than seven days" }
      MonthVectors.Laid(weeks.first().first().toString(), weeks.last().last().toString(), weeks.size)
    }

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

  @Test
  fun columns() =
    vectors<MonthVectors>("month").columns.checkEach({ it.expected }) { case ->
      (0 until 7).map { Week(start = case.weekStart).weekdayAt(it) }
    }

  @Test
  fun tones() =
    vectors<MonthVectors>("month").tones.checkEach({ it.expected }) { case ->
      Week(sunday = case.week.sunday, saturday = case.week.saturday, holiday = case.week.holiday)
        .tone(case.weekday, case.holiday)
        .name
        .lowercase()
    }
}
