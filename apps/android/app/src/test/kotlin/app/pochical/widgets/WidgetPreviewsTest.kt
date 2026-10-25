package app.pochical.widgets

import androidx.test.core.app.ApplicationProvider
import android.content.Context
import app.pochical.kit.DeviceSettings
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class WidgetPreviewsTest {
  private val context = ApplicationProvider.getApplicationContext<Context>()

  @Test
  fun aPreviewTheSystemRefusedIsTriedAgainAndOneItTookIsNot() = runTest {
    val settings = flowOf(DeviceSettings())
    var tries = 0
    // Refused, as the system refuses more than a few an hour: tried again on the next launch.
    followForWidgetPreviews(context, settings) { tries++; false }
    followForWidgetPreviews(context, settings) { tries++; true }
    assertEquals(2, tries)
    // Taken: not published again in the same settings.
    followForWidgetPreviews(context, settings) { tries++; true }
    assertEquals(2, tries)
    // Other settings draw it anew.
    followForWidgetPreviews(context, flowOf(DeviceSettings(themeId = "other"))) { tries++; true }
    assertEquals(3, tries)
  }
}
