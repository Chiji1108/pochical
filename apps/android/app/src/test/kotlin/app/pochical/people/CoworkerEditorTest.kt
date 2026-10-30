package app.pochical.people

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.navigation3.runtime.NavBackStack
import app.pochical.kit.DeviceSettings
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.PageNavigation
import app.pochical.PochicalTheme
import app.pochical.RootNavigator
import app.pochical.RootPage
import app.pochical.RootTab
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.TestDays
import app.pochical.groups.LocalValues
import app.pochical.kit.ownCalendar
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CoworkerEditorTest {
  @get:Rule val compose = createComposeRule()

  private val test = TestDays()
  private val navigator = RootNavigator(NavBackStack(RootPage.Coworkers, RootPage.CoworkerEditor("satou")), mutableStateOf(RootTab.Settings))
  private val owner =
    object : LifecycleOwner {
      override val lifecycle = LifecycleRegistry.createUnsafe(this).apply { currentState = Lifecycle.State.RESUMED }
    }
  private var open by mutableStateOf(true)

  @After fun close() = test.close()

  /** 佐藤's page, open until [open] is turned off, as leaving it takes it away. */
  private fun showSatou() {
    runBlocking { test.edits.addCoworker("佐藤", id = "satou") }
    test.awaitCalendar(compose) { it.coworkers.isNotEmpty() }
    val settings = DeviceSettings()
    compose.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalOwnDays provides test.days,
        LocalValues provides test.database.values(),
      ) {
        PochicalTheme(settings) { if (open) CoworkerEditorPage("satou", PageNavigation(navigator, owner.lifecycle)) }
      }
    }
    compose.waitUntil { compose.onAllNodes(hasText("佐藤")).fetchSemanticsNodes().isNotEmpty() }
  }

  /** The names kept once every edit the page made is written. */
  private fun coworkersOnceWritten(): List<String> = runBlocking {
    test.days.daysShowing("none")
    test.database.ownCalendar().first().coworkers.map { it.name }
  }

  @Test
  fun aRenameFromAnotherDeviceIsNotUndoneByLeavingTheFieldAsItWas() {
    showSatou()
    runBlocking { test.edits.renameCoworker("satou", "佐藤 花子") }
    compose.waitUntil { compose.onAllNodes(hasSetTextAction() and hasText("佐藤 花子")).fetchSemanticsNodes().isNotEmpty() }

    open = false
    compose.waitForIdle()

    assertEquals(listOf("佐藤 花子"), coworkersOnceWritten())
  }
}
