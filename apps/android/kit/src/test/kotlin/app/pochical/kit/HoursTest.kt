package app.pochical.kit

import kotlinx.serialization.Serializable
import org.junit.Test

@Serializable
private data class TimeChangeVectors(val cases: List<Case>) {
  @Serializable data class Expected(val early: Boolean, val late: Boolean)

  @Serializable
  data class Case(
    override val name: String,
    val time: List<String>? = null,
    val start: String? = null,
    val end: String? = null,
    val expected: Expected?,
  ) : VectorCase
}

@Serializable
private data class WidgetDayVectors(val day: List<Day>) {
  @Serializable data class Expected(val time: String?)

  @Serializable
  data class Day(
    override val name: String,
    val time: List<String>? = null,
    val start: String? = null,
    val end: String? = null,
    val expected: Expected,
  ) : VectorCase
}

class HoursTest {
  @Test
  fun saysHowADaysHoursMoved() =
    vectors<TimeChangeVectors>("time-change").cases.checkEach({ it.expected }) { case ->
      val standard = case.time?.let { (start, end) -> ShiftTime(start, end) }
      timeChange(case.start, case.end, standard)?.let { TimeChangeVectors.Expected(it.early, it.late) }
    }

  @Test
  fun writesHoursAsTheScreensDo() =
    vectors<WidgetDayVectors>("widgets").day.filter { it.time != null }.checkEach({ it.expected.time }) { case ->
      val (start, end) = checkNotNull(case.time)
      hoursText(case.start ?: start, case.end ?: end)
    }
}
