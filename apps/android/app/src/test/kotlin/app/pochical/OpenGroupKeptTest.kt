package app.pochical

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.test.core.app.ActivityScenario
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.shadows.ShadowLooper

/** The group open in グループ is open again once the app is closed, a force-quit included (#1281). */
@RunWith(RobolectricTestRunner::class)
class OpenGroupKeptTest {
  private lateinit var navigator: RootNavigator

  /** The app started afresh, as after a force-quit: an activity with nothing saved to restore. */
  private fun start(): ActivityScenario<ComponentActivity> =
    ActivityScenario.launch(ComponentActivity::class.java).onActivity { activity ->
      activity.setContent { navigator = rememberRootNavigator() }
    }.also { ShadowLooper.idleMainLooper() }

  @Test
  fun theGroupPickedIsOpenAgainInAnAppStartedAfresh() {
    start().use {
      assertEquals("none is picked at first, so the first group shows", null, navigator.openGroup)
      it.onActivity { navigator.pickGroup("second") }
      ShadowLooper.idleMainLooper()
    }

    start().use { assertEquals("second", navigator.openGroup) }
  }
}
