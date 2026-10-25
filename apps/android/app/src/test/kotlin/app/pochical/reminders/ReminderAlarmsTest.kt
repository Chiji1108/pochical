package app.pochical.reminders

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.Application
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ContentProvider
import app.pochical.kit.OwnCalendar
import app.pochical.kit.OwnDay
import app.pochical.kit.PatternRow
import app.pochical.kit.Reminder
import dev.zacsweers.metrox.android.MetroAppComponentProviders
import dev.zacsweers.metrox.android.MetroApplication
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.reflect.KClass
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * An application without the app's graph, so the app's own reminders, which keep the same one alarm
 * from its database, do not set it under the test.
 */
class PlainApplication : Application(), MetroApplication {
  override val appComponentProviders =
    object : MetroAppComponentProviders {
      override val activityProviders = emptyMap<KClass<out Activity>, () -> Activity>()
      override val providerProviders = emptyMap<KClass<out ContentProvider>, () -> ContentProvider>()
      override val receiverProviders = emptyMap<KClass<out BroadcastReceiver>, () -> BroadcastReceiver>()
      override val serviceProviders = emptyMap<KClass<out Service>, () -> Service>()
    }
}

@Config(application = PlainApplication::class)
@RunWith(RobolectricTestRunner::class)
class ReminderAlarmsTest {
  private val application = RuntimeEnvironment.getApplication()
  private val zone = ZoneId.of("Asia/Tokyo")
  private var now = at(2026, 11, 1, 20, 0)

  private val calendar =
    OwnCalendar(
      listOf(PatternRow("day", "日勤", "", "", "", 0, "09:00", "18:00", false, null, false)),
      mapOf(LocalDate.of(2026, 11, 2) to OwnDay("day"), LocalDate.of(2026, 11, 3) to OwnDay("day")),
      emptyList(),
    )

  private fun at(year: Int, month: Int, day: Int, hour: Int, minute: Int) = ZonedDateTime.of(year, month, day, hour, minute, 0, 0, zone)

  private fun TestScope.alarms() =
    ReminderAlarms(
      application,
      flowOf(calendar),
      flowOf(listOf(Reminder("evening", kind = Reminder.Kind.DayBefore("21:00")))),
      MutableStateFlow(true),
      this,
      clock = { now },
    )

  private fun TestScope.wake(alarms: ReminderAlarms, firedAt: ZonedDateTime? = null) {
    alarms.woke(firedAt?.toInstant()?.toEpochMilli()) {}
    advanceUntilIdle()
  }

  private val nextAlarm: ZonedDateTime?
    get() =
      shadowOf(application.getSystemService(AlarmManager::class.java)).peekNextScheduledAlarm()?.let {
        Instant.ofEpochMilli(it.triggerAtMs).atZone(zone)
      }

  private val shown
    get() = shadowOf(application.getSystemService(NotificationManager::class.java)).allNotifications.map { it.extras.getString("android.title") }

  @Test
  fun aReminderDueThatTheSystemHasNotBroughtStaysWhenTheNextIsSet() = runTest {
    shadowOf(application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    val alarms = alarms()
    wake(alarms)
    assertEquals(at(2026, 11, 1, 21, 0), nextAlarm)

    // Inexact, the system has not brought it at 21:05 as the days change: it is kept, not replaced.
    now = at(2026, 11, 1, 21, 5)
    wake(alarms)
    assertEquals(at(2026, 11, 1, 21, 0), nextAlarm)

    // Brought late, it is shown, and the next one set.
    now = at(2026, 11, 1, 21, 40)
    wake(alarms, firedAt = at(2026, 11, 1, 21, 0))
    assertEquals(listOf("明日は日勤"), shown)
    assertEquals(at(2026, 11, 2, 21, 0), nextAlarm)
  }

  @Test
  fun aReminderChangedBeforeItsAlarmMovesTheAlarm() = runTest {
    val reminders = MutableStateFlow(listOf(Reminder("evening", kind = Reminder.Kind.DayBefore("21:00"))))
    val alarms = ReminderAlarms(application, flowOf(calendar), reminders, MutableStateFlow(true), backgroundScope, clock = { now })
    alarms.start()
    runCurrent()
    assertEquals(at(2026, 11, 1, 21, 0), nextAlarm)

    // Set for 21:00, the reminder is moved to 20:30 at 20:05: the alarm goes with it.
    now = at(2026, 11, 1, 20, 5)
    reminders.value = listOf(Reminder("evening", kind = Reminder.Kind.DayBefore("20:30")))
    runCurrent()
    assertEquals(at(2026, 11, 1, 20, 30), nextAlarm)
  }

  @Test
  fun anAlarmBroughtAgainShowsNothingAgain() = runTest {
    shadowOf(application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    val alarms = alarms()
    wake(alarms)
    now = at(2026, 11, 1, 21, 0)
    wake(alarms, firedAt = at(2026, 11, 1, 21, 0))
    assertEquals(listOf("明日は日勤"), shown)
    application.getSystemService(NotificationManager::class.java).cancelAll()

    wake(alarms, firedAt = at(2026, 11, 1, 21, 0))
    assertEquals(emptyList<String>(), shown)
    assertEquals(at(2026, 11, 2, 21, 0), nextAlarm)
  }

  @Test
  fun broughtMoreThanAnHourLateItIsNotShown() = runTest {
    shadowOf(application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    val alarms = alarms()
    wake(alarms)
    now = at(2026, 11, 1, 22, 30)
    wake(alarms, firedAt = at(2026, 11, 1, 21, 0))
    assertEquals(emptyList<String>(), shown)
    assertEquals(at(2026, 11, 2, 21, 0), nextAlarm)
  }

  @Test
  fun oneMoreThanAnHourLateIsLetGo() = runTest {
    val alarms = alarms()
    wake(alarms)
    assertEquals(at(2026, 11, 1, 21, 0), nextAlarm)

    // The device was off past it: as it starts again, the next one is set instead.
    now = at(2026, 11, 1, 22, 30)
    wake(alarms)
    assertEquals(at(2026, 11, 2, 21, 0), nextAlarm)
  }

  @Test
  fun searchesFromTheAlarmSetWhileItIsDue() {
    val now = 10 * LATE_MOST_MILLIS
    assertEquals(now, searchFrom(0, now))
    assertEquals(now, searchFrom(now + 1, now))
    assertEquals(now - 2, searchFrom(now - 1, now))
    assertEquals(now - LATE_MOST_MILLIS - 1, searchFrom(now - LATE_MOST_MILLIS, now))
    assertEquals(now, searchFrom(now - LATE_MOST_MILLIS - 1, now))
  }
}
