package app.pochical.calendar

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import app.pochical.DeviceSettings
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.PochicalTheme
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
    val days = SampleDays(today)
    val someone = days.addCoworker("佐藤")
    days.set(day, DayEntry("day", end = "20:00", people = listOf(someone.id)))
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
    assertEquals(DayEntry("night", people = listOf(someone.id)), days.calendar.value.shown(day, day)[day])
    assertEquals("棚卸し", days.calendar.value.note(day))
    assertEquals(1, backs)
  }
}
