package app.pochical.kit

import java.time.LocalDate
import kotlinx.serialization.Serializable
import org.junit.Test

@Serializable
private data class StylePreviewVectors(val sequence: List<Run>, val days: List<Days>, val samples: List<Run>) {
  @Serializable data class Pattern(val id: String, val countsAsOff: Boolean = false, val nextDay: String? = null)

  @Serializable data class Run(override val name: String, val patterns: List<Pattern>, val expected: List<String>) : VectorCase

  @Serializable
  data class Days(override val name: String, val patterns: List<Pattern>, val days: Int, val expected: List<String?>) : VectorCase
}

private fun StylePreviewVectors.Pattern.row() = PatternRow(id, id, "⭐️", id, "star", 0, null, null, countsAsOff, nextDay, false)

class StylePreviewTest {
  private val vectors = vectors<StylePreviewVectors>("style-preview")

  @Test fun sequence() = vectors.sequence.checkEach({ it.expected }) { sampleSequence(it.patterns.map { p -> p.row() }) }

  @Test
  fun days() =
    vectors.days.checkEach({ it.expected }) { case ->
      val first = LocalDate.of(2026, 10, 4)
      val days = (0 until case.days).map { first.plusDays(it.toLong()) }
      val shown = stylePreviewDays(days, case.patterns.map { it.row() })
      days.map { shown[it] }
    }

  @Test fun samples() = vectors.samples.checkEach({ it.expected }) { styleSamples(it.patterns.map { p -> p.row() }) }
}
