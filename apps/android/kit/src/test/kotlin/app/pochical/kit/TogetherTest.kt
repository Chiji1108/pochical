package app.pochical.kit

import java.time.LocalDate
import kotlinx.serialization.Serializable
import org.junit.Test

@Serializable
private data class TogetherVectors(val together: List<Case>) {
  @Serializable data class Member(val days: Map<String, String>)

  @Serializable data class Expected(val days: List<String>, val unsure: Boolean)

  @Serializable
  data class Case(
    override val name: String,
    val members: List<Member>,
    val from: String,
    val to: String,
    val expected: Expected,
  ) : VectorCase
}

class TogetherTest {
  @Test
  fun together() =
    vectors<TogetherVectors>("together").together.checkEach({ Together(it.expected.days.map(LocalDate::parse), it.expected.unsure) }) {
      together(
        it.members.map { member -> member.days.entries.associate { (day, kind) -> LocalDate.parse(day) to (kind == "off") } },
        LocalDate.parse(it.from),
        LocalDate.parse(it.to),
      )
    }
}
