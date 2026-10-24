package app.pochical.kit

import app.pochical.v1.Change
import app.pochical.v1.DayField
import app.pochical.v1.change
import app.pochical.v1.dayValue
import app.pochical.v1.member
import app.pochical.v1.memberDay
import app.pochical.v1.memberPattern
import app.pochical.v1.memberRepeatOrders
import app.pochical.v1.membership
import app.pochical.v1.pattern
import app.pochical.v1.patternValue
import app.pochical.v1.repeatOrder
import app.pochical.v1.repeatOrders
import java.time.LocalDate
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private const val GROUP = "group-1"

@RunWith(RobolectricTestRunner::class)
class GroupMembersTest {
  private val database = testDatabase()

  @After fun close() = database.close()

  private suspend fun inGroup(vararg changes: Change) =
    database.write {
      takeMembership(change { membership = membership { groupId = GROUP; name = "家族"; joinedAtMs = 1 } })
      take(changes.toList(), GROUP)
    }

  private fun joined(userId: String, at: Long, left: Boolean = false) = change {
    member = member {
      this.userId = userId
      displayName = userId
      joinedAtMs = at
      this.left = left
    }
  }

  private fun patternOf(userId: String, id: String, off: Boolean = false) = change {
    memberPattern = memberPattern {
      this.userId = userId
      pattern = patternValue {
        this.id = id
        pattern = pattern {
          name = id
          countsAsOff = off
        }
      }
    }
  }

  private fun dayOf(userId: String, date: String, field: DayField, value: String) = change {
    memberDay = memberDay {
      this.userId = userId
      day = dayValue {
        this.date = date
        this.field = field
        this.value = value
      }
    }
  }

  private fun ordersOf(userId: String, orders: List<VectorOrder>) = change {
    memberRepeatOrders = memberRepeatOrders {
      this.userId = userId
      this.orders = repeatOrders {
        for (order in orders) {
          this.orders += repeatOrder {
            start = order.start
            order.anchor?.let { anchor = it }
            sequence += order.sequence
            holidaysOff = order.holidaysOff
            order.holidayShift?.let { holidayShift = it }
            holidayCountry = "JP"
          }
        }
      }
    }
  }

  /** A member's days come through the group's socket and show as the member's own devices show them. */
  @Test
  fun aMembersDaysShowAsTheirOwn() =
    vectors<RepeatVectors>("repeat").shown.checkEach({ it.expected.byDay() }) { case ->
      runBlocking {
        database.write { resetGroup(GROUP) }
        val days =
          case.own.flatMap { (date, day) ->
            listOfNotNull(
              day.shift?.let { dayOf("sakura", date, DayField.DAY_FIELD_PATTERN, it) },
              day.start?.let { dayOf("sakura", date, DayField.DAY_FIELD_START, it) },
              day.end?.let { dayOf("sakura", date, DayField.DAY_FIELD_END, it) },
            )
          }
        inGroup(joined("sakura", 1), *case.patterns.map { patternOf("sakura", it) }.toTypedArray(), ordersOf("sakura", case.orders), *days.toTypedArray())
        val from = LocalDate.parse(case.from)
        val through = LocalDate.parse(case.to)
        val member = database.values().groupMembers(GROUP, from, through).first().single()
        member.calendar.shown(from, through).mapValues { (_, day) -> day.shift }
      }
    }

  @Test
  fun everyoneInTheGroupInTheOrderTheyJoinedNotThoseWhoLeft() = runTest {
    inGroup(joined("yuki", 2), joined("sakura", 1), joined("gone", 3, left = true))
    val day = LocalDate.parse("2026-10-03")

    assertEquals(listOf("sakura", "yuki"), database.values().groupMembers(GROUP, day, day).first().map { it.userId })
  }
}
