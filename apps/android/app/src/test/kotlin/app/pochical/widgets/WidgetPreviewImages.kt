package app.pochical.widgets

import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Shader
import android.view.View
import android.widget.FrameLayout
import androidx.compose.ui.unit.DpSize
import app.pochical.design.Theme
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
 * Draws the widgets by themselves through Glance, with the sample week the generated previews show,
 * where a run names a folder for them; skipped in the ordinary test run.
 * - The pictures the widget picker shows of each kind before Android 15 (spec/widgets.md, In the
 *   widget gallery), as `android:previewImage`, in light and in dark (`drawable-night`):
 *   `mise run android:widget-previews`, into the app's res (WIDGET_PREVIEWS_OUT).
 * - The stores' wall of widgets (#806), each kind at each size it offers, in 墨 and light:
 *   `mise run store:shots:android`, into STORE_WIDGETS_OUT.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class WidgetPreviewImages {
  /** A Sunday, the sample's settings' first day of the week, so the week reads from today. */
  private val today = LocalDate.of(2026, 10, 25)

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
    for (dark in listOf(false, true)) {
      val folder = File(checkNotNull(out), if (dark) "drawable-night-nodpi" else "drawable-nodpi")
      for ((name, widget) in kinds) draw(widget, widget.pickerSize, DeviceSettings(), dark, File(folder, "widget_preview_$name.png"))
    }
  }

  @Test
  fun drawsTheStoresPictures() = runTest {
    val out = System.getenv("STORE_WIDGETS_OUT")
    assumeTrue("Only when asked for, by mise run store:shots:android", out != null)
    val sizes = mapOf(SMALL to "small", MEDIUM to "medium", LARGE to "large")
    val sumi = DeviceSettings(themeId = Theme.Sumi.id)
    for ((name, widget) in kinds) {
      for (size in widget.previews) draw(widget, size, sumi, dark = false, File(checkNotNull(out), "$name-${sizes.getValue(size)}.png"))
    }
  }

  /** [widget] at [size] in [settings], light or [dark], as the PNG [file]. */
  private suspend fun draw(widget: PochicalWidget, size: DpSize, settings: DeviceSettings, dark: Boolean, file: File) {
    val context = RuntimeEnvironment.getApplication().let { app ->
      val configuration = Configuration(app.resources.configuration)
      configuration.uiMode = (configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
        (if (dark) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO)
      app.createConfigurationContext(configuration)
    }
    // Midday, the sample's 日勤 on, as いまのシフト's ring shows it.
    val drawn = Drawn(sampleWidgetEntry(today.atTime(13, 0).atZone(ZoneId.systemDefault()), Week()), settings)
    val view = widget.preview(context, drawn, size).apply(context, FrameLayout(context))
    file.parentFile?.mkdirs()
    file.outputStream().use { picture(view, size, context.resources.displayMetrics.density).compress(Bitmap.CompressFormat.PNG, 100, it) }
  }

  private companion object {
    /** A launcher's widget corners, as Android 12's system_app_widget_background_radius. */
    const val CORNER_DP = 16f
  }

  /** [view] laid out at [size] and drawn. */
  private fun picture(view: View, size: DpSize, density: Float): Bitmap {
    val width = (size.width.value * density).toInt()
    val height = (size.height.value * density).toInt()
    view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
    view.layout(0, 0, width, height)
    val drawn = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { view.draw(Canvas(it)) }
    // In the corners a launcher rounds a widget's to, as the picker shows a placed one.
    val corner = CORNER_DP * density
    return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also {
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = BitmapShader(drawn, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP) }
      Canvas(it).drawRoundRect(0f, 0f, width.toFloat(), height.toFloat(), corner, corner, paint)
    }
  }
}
