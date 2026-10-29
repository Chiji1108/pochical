package app.pochical.kit

import java.time.LocalDate
import java.time.YearMonth
import kotlinx.serialization.Serializable
import org.junit.Test

// シフトの期間's pages (spec/vectors/periods.json); `written` is the app's, which writes days.
@Serializable
private data class PeriodVectors(
  val containing: List<Containing>,
  val stepped: List<Stepped>,
  val picked: List<Picked>,
  val weeks: List<Weeks>,
) {
  @Serializable
  data class Containing(override val name: String, val start: Int, val day: String, val expected: List<String>) : VectorCase

  @Serializable
  data class Stepped(override val name: String, val start: Int, val page: List<String>, val by: Int, val expected: List<String>) :
    VectorCase

  @Serializable
  data class Picked(override val name: String, val start: Int, val month: String, val expected: List<String>) : VectorCase

  @Serializable data class Drawn(val first: String, val last: String, val weeks: Int)

  @Serializable
  data class Weeks(override val name: String, val start: Int, val weekStart: Int, val page: List<String>, val expected: Drawn) :
    VectorCase
}

private val Period.pair: List<String>
  get() = listOf(first.toString(), last.toString())

private fun period(days: List<String>) = Period(LocalDate.parse(days[0]), LocalDate.parse(days[1]))

class PeriodsTest {
  private val cases = vectors<PeriodVectors>("periods")

  @Test
  fun containing() = cases.containing.checkEach({ it.expected }) { ShiftPeriod(it.start).pageHolding(LocalDate.parse(it.day)).pair }

  @Test
  fun stepped() = cases.stepped.checkEach({ it.expected }) { period(it.page).stepped(it.by, it.start).pair }

  @Test
  fun picked() = cases.picked.checkEach({ it.expected }) { ShiftPeriod(it.start).page(YearMonth.parse(it.month)).pair }

  @Test
  fun weeks() =
    cases.weeks.checkEach({ it.expected }) { case ->
      val weeks = period(case.page).weeks(case.weekStart)
      check(weeks.all { it.size == 7 })
      PeriodVectors.Drawn(weeks.first().first().toString(), weeks.last().last().toString(), weeks.size)
    }
}
