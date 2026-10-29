package app.pochical

import app.pochical.calendar.TestDays
import app.pochical.kit.DeviceSettings
import app.pochical.kit.ShiftPeriod
import java.time.LocalDate
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** はじめの設定's end (spec/shift-patterns.md, The first run). */
@RunWith(RobolectricTestRunner::class)
class OnboardingTest {
  @Test
  fun theRemindersAreOfferedThoughThePageGoesAsThePatternsLand() = runBlocking {
    TestDays().use { test ->
      var settings = DeviceSettings()
      // The page that asked goes as soon as the patterns are kept, its scope with it, before
      // anything after the write resumes there.
      val page =
        launch(Dispatchers.Default, start = CoroutineStart.UNDISPATCHED) {
          beginFirstRun(test.days, { change -> settings = change(settings) }, listOf("duty", "offDuty", "off"), listOf("duty", "offDuty", "off"), LocalDate.now())
        }
      withTimeout(5_000) { test.days.calendar.first { it.patterns.isNotEmpty() } }
      page.cancel()

      assertTrue(settings.reminderOfferWaiting)
    }
  }

  @Test
  fun aRostersPeriodIsKeptThoughThePageGoesAsThePatternsLand() = runBlocking {
    TestDays().use { test ->
      var settings = DeviceSettings()
      val page =
        launch(Dispatchers.Default, start = CoroutineStart.UNDISPATCHED) {
          beginFirstRun(test.days, { change -> settings = change(settings) }, listOf("day", "off"), emptyList(), LocalDate.now(), ShiftPeriod() to ShiftPeriod(15))
        }
      withTimeout(5_000) { test.days.calendar.first { it.patterns.isNotEmpty() } }
      page.cancel()

      assertEquals(ShiftPeriod(15), settings.period)
    }
  }
}
