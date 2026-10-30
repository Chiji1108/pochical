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
 * the widget gallery), as `android:previewImage`: the sample week the generated previews show, drawn
 * by the widgets themselves through Glance, in light and in dark (`drawable-night`). Run by
 * `mise run android:widget-previews`, which names where they go (WIDGET_PREVIEWS_OUT, the app's
 * res); skipped in the ordinary test run.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class WidgetPreviewImages {
  /** A Sunday, the sample's settings' first day of the week, so the week reads from today. */
  private val today = LocalDate.of(2026, 10, 25)

  @Test
  fun drawsThePickersPictures() = runTest {
    val out = System.getenv("WIDGET_PREVIEWS_OUT")
    assumeTrue("Only when asked for, by mise run android:widget-previews", out != null)
    val kinds =
      listOf(
        "simple" to SimpleWidget(),
        "next_off" to NextOffWidget(),
        "upcoming" to UpcomingWidget(),
        "calendar" to CalendarWidget(),
        "now" to NowWidget(),
      )
    // Midday, the sample's 日勤 on, as いまのシフト's ring shows it.
    val drawn = Drawn(sampleWidgetEntry(today.atTime(13, 0).atZone(ZoneId.systemDefault()), Week()), DeviceSettings())
    for (dark in listOf(false, true)) {
      val context = RuntimeEnvironment.getApplication().let { app ->
        val configuration = Configuration(app.resources.configuration)
        configuration.uiMode = (configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
          (if (dark) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO)
        app.createConfigurationContext(configuration)
      }
      val folder = File(checkNotNull(out), if (dark) "drawable-night-nodpi" else "drawable-nodpi").apply { mkdirs() }
      for ((name, widget) in kinds) {
        val size = widget.pickerSize
        val views = widget.preview(context, drawn, size)
        val view = views.apply(context, FrameLayout(context))
        File(folder, "widget_preview_$name.png").outputStream().use { picture(view, size, context.resources.displayMetrics.density).compress(Bitmap.CompressFormat.PNG, 100, it) }
      }
    }
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
