package app.pochical.kit

import app.pochical.v1.Change
import app.pochical.v1.DayField
import app.pochical.v1.change
import app.pochical.v1.dayValue
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@Serializable
private data class LocalEditsVectors(val cases: List<Case>) {
  /** Each step an event and what the device shows after it, read by the key it names. */
  @Serializable data class Case(override val name: String, val steps: List<JsonObject>) : VectorCase
}

/** A database of the device's own, in memory. */
internal fun testDatabase(): AppDatabase = AppDatabase.open(RuntimeEnvironment.getApplication(), inMemory = true)

/** A change to one day's pattern, the value the vectors follow; null clears it. */
private fun dayChange(value: String?): Change = change {
  day = dayValue {
    date = "2026-10-01"
    field = DayField.DAY_FIELD_PATTERN
    if (value != null) this.value = value
  }
}

@RunWith(RobolectricTestRunner::class)
class LocalEditsTest {
  @Test
  fun localEdits() = runTest {
    val cases = vectors<LocalEditsVectors>("local-edits").cases
    val failed = mutableListOf<String>()
    for (case in cases) {
      val database = testDatabase()
      for ((index, step) in case.steps.withIndex()) {
        val shown = database.write {
          when {
            "edit" in step -> {
              val edit = step.getValue("edit").jsonObject
              val value = edit.getValue("value").let { if (it is JsonNull) null else it.jsonPrimitive.content }
              edit(dayChange(value), edit.getValue("op").jsonPrimitive.content)
            }
            "change" in step -> {
              val value = step.getValue("change").let { if (it is JsonNull) null else it.jsonPrimitive.content }
              takeOwn(dayChange(value))
            }
            "acked" in step -> acknowledge(step.getValue("acked").jsonArray.map { it.jsonPrimitive.content })
            "reset" in step -> reset()
            else -> error("${case.name}: a step of no event")
          }
          day("2026-10-01")?.pattern
        }
        val expected = step.getValue("shows").let { if (it is JsonNull) null else it.jsonPrimitive.content }
        if (shown != expected) failed += "${case.name}, step ${index + 1}: expected $expected, got $shown"
      }
      database.close()
    }
    assertEquals("", failed.joinToString("\n"))
  }
}
