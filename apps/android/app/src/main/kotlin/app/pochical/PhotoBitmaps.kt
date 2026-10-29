package app.pochical

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Shader
import androidx.core.graphics.createBitmap
import app.pochical.chat.Picture
import app.pochical.kit.PhotoShelf
import coil3.ImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import kotlinx.coroutines.withTimeoutOrNull

/**
 * A photo as a picture of [side] pixels a side, for what draws outside the app's screens (a
 * notification's face, a widget's): as the app's one image loader ([loader]) has it, or fetches it
 * from [shelf], within [waitMs]; none if it does not come in time.
 */
suspend fun photoBitmap(context: Context, loader: ImageLoader, photoId: String, shelf: PhotoShelf, side: Int, waitMs: Long): Bitmap? {
  if (photoId.isEmpty()) return null
  val request = ImageRequest.Builder(context).data(Picture(photoId, shelf)).size(side).allowHardware(false).build()
  val result = withTimeoutOrNull(waitMs) { loader.execute(request) } as? SuccessResult ?: return null
  return result.image.toBitmap()
}

/** [picture] cut to [side] pixels with corners of [corner] pixels, the middle of it kept: a circle at half the side. */
fun cutPicture(picture: Bitmap, side: Int, corner: Float): Bitmap {
  val cut = createBitmap(side, side)
  val scale = side.toFloat() / minOf(picture.width, picture.height)
  val shader =
    BitmapShader(picture, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
      setLocalMatrix(
        android.graphics.Matrix().apply {
          setScale(scale, scale)
          postTranslate((side - picture.width * scale) / 2, (side - picture.height * scale) / 2)
        }
      )
    }
  Canvas(cut).drawRoundRect(0f, 0f, side.toFloat(), side.toFloat(), corner, corner, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader })
  return cut
}
