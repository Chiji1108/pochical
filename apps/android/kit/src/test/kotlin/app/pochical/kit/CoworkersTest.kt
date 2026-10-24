package app.pochical.kit

import app.pochical.v1.Change
import app.pochical.v1.DayField
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CoworkersTest {
  private val database = testDatabase()
  private val edits = OwnEdits(database)
  private val values = database.values()

  @After fun close() = database.close()

  @Test
  fun theListKeepsTheOrderItWasPutIn() = runTest {
    edits.addCoworker("佐藤", id = "satou")
    edits.addCoworker("鈴木", id = "suzuki")
    edits.addCoworker("高橋", id = "takahashi")

    edits.orderCoworkers(listOf("takahashi", "satou", "suzuki"))

    assertEquals(listOf("高橋", "佐藤", "鈴木"), values.coworkers().first().map { it.name })
  }

  @Test
  fun someoneDeletedLeavesTheListAndItsOrder() = runTest {
    edits.addCoworker("佐藤", id = "satou")
    edits.addCoworker("鈴木", id = "suzuki")

    edits.deleteCoworker("satou")
    edits.addCoworker("高橋", id = "takahashi")

    assertEquals(listOf("鈴木", "高橋"), values.coworkers().first().map { it.name })
  }

  @Test
  fun aRenameOfSomeoneGoneDoesNotBringThemBack() = runTest {
    edits.addCoworker("佐藤", id = "satou")
    edits.deleteCoworker("satou")

    edits.renameCoworker("satou", "佐藤さん")

    assertEquals(emptyList<CoworkerRow>(), values.coworkers().first())
    assertEquals(0, database.write { outbox() }.count { Change.parseFrom(it.change).coworker.name == "佐藤さん" })
  }

  @Test
  fun eachPersonCountsTheDaysThatNoteThem() = runTest {
    edits.addCoworker("佐藤", id = "satou")
    edits.addCoworker("鈴木", id = "suzuki")
    edits.setDay("2026-10-01", DayField.DAY_FIELD_PEOPLE, "satou suzuki")
    edits.setDay("2026-10-02", DayField.DAY_FIELD_PEOPLE, "satou")

    assertEquals(mapOf("satou" to 2, "suzuki" to 1), values.coworkerDays().first())
  }
}
