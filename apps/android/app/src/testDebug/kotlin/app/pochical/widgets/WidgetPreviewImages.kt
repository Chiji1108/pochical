package app.pochical.widgets

import android.content.res.Configuration
import android.graphics.Bitmap
import app.pochical.kit.DeviceSettings
import app.pochical.kit.Week
import java.io.File
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Draws the pictures the widget picker shows of each kind before Android 15 (spec/widgets.md, In
 * the widget gallery), as `android:previewImage`: each by itself through Glance, with the sample
 * week the generated previews show, in light and in dark (`drawable-night`), into the app's res
 * (WIDGET_PREVIEWS_OUT) by `mise run android:widget-previews`; skipped in the ordinary test run.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class WidgetPreviewImages {
  /** A Sunday, the sample's settings' first day of the week, so the week reads from today; midday, the sample's 日勤 on, as いまのシフト's ring shows it. */
  private val at = LocalDate.of(2026, 10, 25).atTime(13, 0).atZone(ZoneId.systemDefault())

  private val kinds =
    listOf(
      "simple" to SimpleWidget(),
      "next_off" to NextOffWidget(),
      "upcoming" to UpcomingWidget(),
      "calendar" to CalendarWidget(),
      "now" to NowWidget(),
    )

  @Test
  fun drawsThePickersPictures() = runTest {
    val out = System.getenv("WIDGET_PREVIEWS_OUT")
    assumeTrue("Only when asked for, by mise run android:widget-previews", out != null)
    val drawn = Drawn(sampleWidgetEntry(at, Week()), DeviceSettings())
    for (dark in listOf(false, true)) {
      val context = RuntimeEnvironment.getApplication().let { app ->
        val configuration = Configuration(app.resources.configuration)
        configuration.uiMode = (configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
          (if (dark) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO)
        app.createConfigurationContext(configuration)
      }
      for ((name, widget) in kinds) {
        val file = File(checkNotNull(out), "${if (dark) "drawable-night-nodpi" else "drawable-nodpi"}/widget_preview_$name.png")
        file.parentFile?.mkdirs()
        file.outputStream().use { widget.picture(context, drawn, widget.pickerSize).compress(Bitmap.CompressFormat.PNG, 100, it) }
      }
    }
  }
}
