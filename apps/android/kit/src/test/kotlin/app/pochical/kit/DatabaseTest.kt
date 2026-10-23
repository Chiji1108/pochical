package app.pochical.kit

import app.pochical.design.SyncLimits
import app.pochical.v1.Change
import app.pochical.v1.ClientFrame
import app.pochical.v1.DayField
import app.pochical.v1.change
import app.pochical.v1.dayValue
import app.pochical.v1.groupMark
import app.pochical.v1.hlc
import app.pochical.v1.member
import app.pochical.v1.memberDay
import app.pochical.v1.membership
import app.pochical.v1.pattern
import app.pochical.v1.patternValue
import app.pochical.v1.repeatOrder
import app.pochical.v1.repeatOrders
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** A day's field as the server sends it, set at [ms] by [device]. */
private fun serverDay(
  date: String,
  value: String?,
  ms: Long,
  device: String = "ipad",
  field: DayField = DayField.DAY_FIELD_PATTERN,
  cursor: Long = 0,
): Change = change {
  this.cursor = cursor
  day = dayValue {
    this.date = date
    this.field = field
    if (value != null) this.value = value
    hlc = hlc {
      physicalMs = ms
      deviceId = device
    }
  }
}

/** A new job's order from [start], edited on this device at [now]. */
private suspend fun SyncDao.startOrder(start: String, now: Long) {
  val orders = repeatOrders {
    this.orders += repeatOrder {
      this.start = start
      sequence += listOf("day", "off")
      holidayCountry = "JP"
    }
    hlc = nextClock(now)
  }
  edit(change { repeatOrders = orders }, "order", clearFrom = start)
}

@RunWith(RobolectricTestRunner::class)
class DatabaseTest {
  private val database = testDatabase()

  @After fun close() = database.close()

  @Test
  fun aWaitingNewOrderHidesOnlyWhatWasSetBeforeIt() = runTest {
    database.write {
      takeOwn(serverDay("2026-11-03", "night", ms = 1_000))
      startOrder("2026-11-01", now = 5_000)
      assertNull(day("2026-11-03")?.pattern)

      takeOwn(serverDay("2026-11-04", "off", ms = 2_000))
      takeOwn(serverDay("2026-11-05", "night", ms = 9_000))
      takeOwn(serverDay("2026-11-04", "memo", ms = 2_000, field = DayField.DAY_FIELD_NOTE))
      assertNull("set before the order", day("2026-11-04")?.pattern)
      assertEquals("a memo stays", "memo", day("2026-11-04")?.note)
      assertEquals("set after the order", "night", day("2026-11-05")?.pattern)

      // Acknowledged without the server's clears, as when newer orders won.
      acknowledge(listOf("order"))
      assertEquals("night", day("2026-11-03")?.pattern)
      assertEquals("off", day("2026-11-04")?.pattern)
      assertEquals("night", day("2026-11-05")?.pattern)
    }
  }

  @Test
  fun aRestampedOrderTakesBackWhatItsNewClockComesAfter() = runTest {
    database.write {
      startOrder("2026-11-01", now = 5_000)
      takeOwn(serverDay("2026-11-05", "night", ms = 9_000))
      assertEquals("night", day("2026-11-05")?.pattern)

      // CODE_CLOCK_AHEAD: the waiting order takes a clock after the 9_000 day.
      restamp(now = 20_000)
      assertNull(day("2026-11-05")?.pattern)
    }
  }

  @Test
  fun changesMoveTheCursorAndTheClock() = runTest {
    database.write {
      take(listOf(serverDay("2026-10-01", "day", ms = 50_000, cursor = 7), serverDay("2026-10-02", "day", ms = 1, cursor = 9)))
      assertEquals(9L, state().cursor)
      // The next edit orders after the change taken, whatever the device's own time.
      val next = nextClock(now = 10)
      assertEquals(50_000L, next.physicalMs)
      assertEquals(1, next.counter)
    }
  }

  @Test
  fun aResetDropsTheServersValuesAndRewindsTheCursor() = runTest {
    database.write {
      take(listOf(serverDay("2026-10-01", "day", ms = 1, cursor = 4)))
      reset()
      assertEquals(0L, state().cursor)
      assertNull(day("2026-10-01"))
    }
  }

  @Test
  fun aGroupLeftGoesWithWhatTheDeviceHeldOfIt() = runTest {
    database.write {
      take(listOf(change {
        membership = membership {
          groupId = "g"
          name = "家族"
          mark = groupMark { emoji = "🏠" }
          joinedAtMs = 1
        }
      }))
      take(
        listOf(
          change { member = member { userId = "u"; displayName = "母"; joinedAtMs = 1 } },
          change {
            cursor = 3
            memberDay = memberDay { userId = "u"; day = serverDay("2026-10-01", "night", ms = 1).day }
          },
          change {
            cursor = 4
            memberDay = memberDay {
              userId = "u"
              day = serverDay("2026-10-01", "private", ms = 1, field = DayField.DAY_FIELD_NOTE).day
            }
          },
        ),
        groupId = "g",
      )
      assertEquals(4L, cursorOf("g"))
    }
    assertEquals(listOf("家族"), database.values().groups().first().map { it.name })
    assertEquals(
      listOf(MemberDayRow("g", "u", "2026-10-01", pattern = "night")),
      database.values().memberDays("g", "2026-10-01", "2026-10-31").first(),
    )

    database.write { take(listOf(change { membership = membership { groupId = "g"; left = true } })) }
    assertEquals(emptyList<GroupRow>(), database.values().groups().first())
    assertEquals(emptyList<MemberDayRow>(), database.values().memberDays("g", "2026-10-01", "2026-10-31").first())
    assertEquals(emptyList<GroupMemberRow>(), database.values().members("g").first())
    assertEquals(0L, database.write { cursorOf("g") })
  }

  @Test
  fun aGroupsFrameAfterTheUserLeftItIsDropped() = runTest {
    database.write {
      take(listOf(change { member = member { userId = "u"; displayName = "母" } }), groupId = "gone")
      assertEquals(0L, cursorOf("gone"))
    }
    assertEquals(emptyList<GroupMemberRow>(), database.values().members("gone").first())
  }

  @Test
  fun theOutboxGoesInFramesOfOneKindEach() = runTest {
    val frames = database.write {
      for (date in listOf("2026-10-01", "2026-10-02")) {
        edit(serverDay(date, "day", ms = 1), "day-$date")
      }
      edit(change { pattern = patternValue { id = "p"; pattern = pattern { name = "日勤" } } }, "pattern")
      edit(serverDay("2026-10-03", "day", ms = 1), "day-3")
      frames(after = 0)
    }
    assertEquals(
      listOf(ClientFrame.KindCase.DAY_EDITS, ClientFrame.KindCase.PATTERN_EDITS, ClientFrame.KindCase.DAY_EDITS),
      frames.first.map { it.kindCase },
    )
    assertEquals(listOf("day-2026-10-01", "day-2026-10-02"), frames.first[0].dayEdits.editsList.map { it.opId })
    assertEquals(4L, frames.second)
    assertEquals(emptyList<ClientFrame>(), database.write { frames(after = frames.second) }.first)
  }

  @Test
  fun aFrameHoldsNoMoreThanEditsPerFrame() = runTest {
    val frames = database.write {
      repeat(SyncLimits.editsPerFrame + 1) { edit(serverDay("2026-10-01", "day", ms = it.toLong()), "op-$it") }
      frames(after = 0).first
    }
    assertEquals(listOf(SyncLimits.editsPerFrame, 1), frames.map { it.dayEdits.editsCount })
  }

  @Test
  fun aDatabaseIsClaimedByItsFirstUserAlone() = runTest {
    database.write {
      assertTrue(claim("alice"))
      assertTrue(claim("alice"))
      assertFalse(claim("bob"))
    }
  }
}

@RunWith(RobolectricTestRunner::class)
class SyncSchemaTest {
  @Test
  fun aDeviceSyncedUnderAnOlderSchemaTakesEverythingAgainKeepingItsValues() = runTest {
    val context = RuntimeEnvironment.getApplication()
    AppDatabase.open(context).run {
      write {
        take(listOf(serverDay("2026-10-01", "day", ms = 1, cursor = 12)))
        take(listOf(change { membership = membership { groupId = "g"; joinedAtMs = 1 } }))
        take(listOf(change { cursor = 5; member = member { userId = "u" } }), groupId = "g")
        assertEquals(5L, cursorOf("g"))
        upsert(state().copy(schema = SYNC_SCHEMA - 1))
      }
      close()
    }
    AppDatabase.open(context).run {
      write {
        assertEquals(0L, state().cursor)
        assertEquals(SYNC_SCHEMA, state().schema)
        assertEquals(0L, cursorOf("g"))
        assertEquals("day", day("2026-10-01")?.pattern)
      }
      close()
    }
  }
}
