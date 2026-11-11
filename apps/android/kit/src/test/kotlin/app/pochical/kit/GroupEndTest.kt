package app.pochical.kit

import app.pochical.v1.change
import app.pochical.v1.groupProfile
import app.pochical.v1.membership
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@Serializable
private data class GroupEndVectors(val endsAt: List<EndsAt>, val endDay: List<EndDay>) {
  @Serializable
  data class EndsAt(val day: String, val zone: String, val expected: Long) : VectorCase {
    override val name
      get() = "$day $zone"
  }

  @Serializable
  data class EndDay(val ms: Long, val zone: String, val expected: String) : VectorCase {
    override val name
      get() = "$ms $zone"
  }
}

/** A group's end as a moment and as each device's day (spec/vectors/group-end.json). */
class GroupEndVectorsTest {
  private val vectors = vectors<GroupEndVectors>("group-end")

  @Test fun endsAt() = vectors.endsAt.checkEach({ it.expected }) { groupEndsAt(LocalDate.parse(it.day), ZoneId.of(it.zone)) }

  @Test fun endDay() = vectors.endDay.checkEach({ LocalDate.parse(it.expected) }) { groupEndDay(it.ms, ZoneId.of(it.zone)) }

  @Test
  fun theDevicePickingADayShowsThatDay() {
    for (case in vectors.endsAt) {
      val zone = ZoneId.of(case.zone)
      assertEquals(case.name, LocalDate.parse(case.day), groupEndDay(groupEndsAt(LocalDate.parse(case.day), zone), zone))
    }
  }

  @Test
  fun anotherEndIsANewRequestAndTheSameOneTheSame() {
    var ids = 0
    val newId = { "request-${++ids}" }
    val mark = GroupMarkValue(emoji = "🍻")
    val first = NewGroupRequest.asking("忘年会", mark, "さくら", last = null, endsAtMs = 0, newId = newId)
    val ending = NewGroupRequest.asking("忘年会", mark, "さくら", last = first, endsAtMs = 1798729200000, newId = newId)
    assertNotEquals(first.id, ending.id)
    assertEquals(1798729200000, ending.endsAtMs)
    assertSame(ending, NewGroupRequest.asking("忘年会", mark, "さくら", last = ending, endsAtMs = 1798729200000, newId = newId))
    assertNotEquals(ending.id, NewGroupRequest.asking("忘年会", mark, "さくら", last = ending, endsAtMs = 1798815600000, newId = newId).id)
  }
}

private const val GROUP = "group-1"
private const val END = 1798729200000

/** The end a group's socket says, as the device keeps it (spec/sync-protocol.md, A group's end). */
@RunWith(RobolectricTestRunner::class)
class GroupEndStoreTest {
  private val database = testDatabase()

  @After fun close() = database.close()

  private fun listed() = change { membership = membership { groupId = GROUP; name = "忘年会"; joinedAtMs = 1 } }

  private fun profile(endsAtMs: Long) = change { groupProfile = groupProfile { name = "忘年会"; this.endsAtMs = endsAtMs } }

  private suspend fun end() = database.values().groupEnd(GROUP).first()

  @Test
  fun theGroupsSocketSetsChangesAndTakesAwayTheEnd() = runTest {
    database.write { take(listOf(listed())) }
    assertEquals(0, end())
    database.write { take(listOf(profile(END)), GROUP) }
    assertEquals(END, end())
    database.write { take(listOf(profile(END + 86_400_000)), GROUP) }
    assertEquals(END + 86_400_000, end())
    database.write { take(listOf(profile(0)), GROUP) }
    assertEquals(0, end())
  }

  @Test
  fun theUsersSocketSayingTheGroupAgainKeepsItsEnd() = runTest {
    database.write {
      take(listOf(listed()))
      take(listOf(profile(END)), GROUP)
      // A Reset of the user's socket lists the groups anew, which says nothing of their ends.
      resetMemberships()
      take(listOf(listed()))
    }
    assertEquals(END, end())
  }

  @Test
  fun theEndGoesWithTheGroupLeftOrEnded() = runTest {
    database.write {
      take(listOf(listed()))
      take(listOf(profile(END)), GROUP)
      take(listOf(change { membership = membership { groupId = GROUP; left = true } }))
    }
    assertEquals(0, end())
  }

  @Test
  fun theEndGoesWithAResetOfTheGroupAndWithTheUser() = runTest {
    database.write {
      take(listOf(listed()))
      take(listOf(profile(END)), GROUP)
      resetGroup(GROUP)
    }
    assertEquals(0, end())
    database.write {
      take(listOf(profile(END)), GROUP)
      eraseUserData()
    }
    assertEquals(0, end())
  }
}
