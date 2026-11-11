package app.pochical.widgets

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Shader
import android.view.View
import android.widget.FrameLayout
import androidx.compose.ui.unit.DpSize

/** A launcher's widget corners, as Android 12's system_app_widget_background_radius. */
private const val CORNER_DP = 16f

/**
 * This kind by itself as a picture, drawn from [drawn] at [size] through Glance in [context]'s
 * light or dark, in the corners a launcher rounds a widget's to, as the picker shows a placed one:
 * the picker's pictures before Android 15 (WidgetPreviewImages) and the stores' wall of widgets
 * (StoreScreenshots). Called where views may be made: the main thread on a device.
 */
suspend fun PochicalWidget.picture(context: Context, drawn: Drawn, size: DpSize): Bitmap {
  val view = preview(context, drawn, size).apply(context, FrameLayout(context))
  val density = context.resources.displayMetrics.density
  val width = (size.width.value * density).toInt()
  val height = (size.height.value * density).toInt()
  view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
  view.layout(0, 0, width, height)
  val square = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { view.draw(Canvas(it)) }
  val corner = CORNER_DP * density
  return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = BitmapShader(square, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP) }
    Canvas(it).drawRoundRect(0f, 0f, width.toFloat(), height.toFloat(), corner, corner, paint)
  }
}
