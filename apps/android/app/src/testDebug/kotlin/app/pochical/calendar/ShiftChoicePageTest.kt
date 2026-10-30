package app.pochical.calendar

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.PochicalTheme
import app.pochical.kit.DeviceSettings
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ShiftChoicePageTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun anotherShiftKeepsTheDaysMemoAndPeopleButNotItsHours() {
    val today = LocalDate.now()
    val day = today.withDayOfMonth(8)
    val test = sampleDays(today)
    val days = test.days
    val someone = days.addCoworker("佐藤")
    days.set(day, DayEntry("day", end = "20:00", people = listOf(someone.id)))
    test.awaitCalendar(compose) { it.shown(day, day)[day]?.people?.isNotEmpty() == true }
    var backs = 0
    val settings = DeviceSettings()
    compose.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalOwnDays provides days,
      ) {
        PochicalTheme(settings) { ShiftChoicePage(day, onBack = { backs++ }) }
      }
    }
    compose.onNodeWithText("夜勤").performClick()
    compose.waitForIdle()
    val calendar = test.awaitCalendar(compose) { it.shown(day, day)[day]?.shift == "night" }
    assertEquals(DayEntry("night", people = listOf(someone.id)), calendar.shown(day, day)[day])
    assertEquals("棚卸し", calendar.note(day))
    assertEquals(1, backs)
    test.close()
  }
}
