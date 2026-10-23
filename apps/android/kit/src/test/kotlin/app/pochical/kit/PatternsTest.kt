package app.pochical.kit

import app.pochical.v1.Change
import app.pochical.v1.change
import app.pochical.v1.pattern
import app.pochical.v1.patternOrder
import app.pochical.v1.patternValue
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Only saved is the kit's: the rest is the patterns' logic, which comes with their screens.
@Serializable
private data class PatternsVectors(val saved: List<Saved>) {
  @Serializable
  data class Saved(
    override val name: String,
    val patterns: List<String>,
    val id: String,
    val expected: List<String>,
  ) : VectorCase
}

@RunWith(RobolectricTestRunner::class)
class PatternsTest {
  @Test
  fun saved() = runTest {
    val failed = mutableListOf<String>()
    for (case in vectors<PatternsVectors>("patterns").saved) {
      val database = testDatabase()
      database.write {
        for (id in case.patterns) {
          takeOwn(change { pattern = patternValue { this.id = id; pattern = pattern { name = id } } })
        }
        takeOwn(change { patternOrder = patternOrder { ids += case.patterns } })
      }
      OwnEdits(database).savePattern(case.id, pattern { name = "${case.id}!" })
      val shown = database.values().patterns().first().map { it.id }
      // A new one's order goes to the server as an edit of its own, so every device lists them alike.
      val sent =
        database.write { outbox() }
          .map { Change.parseFrom(it.change) }
          .lastOrNull { it.kindCase == Change.KindCase.PATTERN_ORDER }
          ?.patternOrder
          ?.idsList
      val expectedSent = if (case.id in case.patterns) null else case.expected
      if (shown != case.expected || sent != expectedSent) {
        failed += "${case.name}: expected ${case.expected} sent as $expectedSent, got $shown sent as $sent"
      }
      database.close()
    }
    assertEquals("", failed.joinToString("\n"))
  }

  @Test
  fun twoNewPatternsListInTheOrderTheyWereMade() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    edits.savePattern("zz-first", pattern { name = "日勤" })
    edits.savePattern("aa-second", pattern { name = "夜勤" })
    assertEquals(listOf("zz-first", "aa-second"), database.values().patterns().first().map { it.id })
    database.close()
  }
}
