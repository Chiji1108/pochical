package app.pochical

import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// A picture the app made (a month's, an invitation's QR code) shared or saved to the phone's
// pictures, one way for every picture.

/**
 * Shares [picture] through Android's share sheet titled [title], a file of its own each time in
 * the app's cache named from [stem], read through its FileProvider; whether the sheet opened.
 */
suspend fun sharePicture(context: Context, picture: Bitmap, stem: String, title: String): Boolean =
  try {
    val file =
      withContext(Dispatchers.IO) {
        val shared = File(context.cacheDir, "shared").apply { mkdirs() }
        File(shared, "$stem-${UUID.randomUUID()}.png").also { file -> file.outputStream().use { picture.compress(Bitmap.CompressFormat.PNG, 100, it) } }
      }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.photos", file)
    val send =
      Intent(Intent.ACTION_SEND)
        .setType("image/png")
        .putExtra(Intent.EXTRA_STREAM, uri)
        .putExtra(Intent.EXTRA_TITLE, title)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    // The grant reaches the sheet, for its preview, and the app picked only through ClipData.
    send.clipData = ClipData.newRawUri(null, uri)
    context.startActivity(Intent.createChooser(send, null))
    true
  } catch (e: CancellationException) {
    throw e
  } catch (_: Exception) {
    false
  }

/** Saves [picture] to the phone's pictures as [fileName] (MediaStore, no permission needed); whether it was. */
suspend fun savePicture(context: Context, picture: Bitmap, fileName: String): Boolean =
  try {
    withContext(Dispatchers.IO) {
      val resolver = context.contentResolver
      val details =
        ContentValues().apply {
          put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
          put(MediaStore.Images.Media.MIME_TYPE, "image/png")
          put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES)
          put(MediaStore.Images.Media.IS_PENDING, 1)
        }
      val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, details) ?: return@withContext false
      val written = resolver.openOutputStream(uri)?.use { picture.compress(Bitmap.CompressFormat.PNG, 100, it) } ?: false
      if (written) {
        resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
      } else {
        resolver.delete(uri, null, null)
      }
      written
    }
  } catch (e: CancellationException) {
    throw e
  } catch (_: Exception) {
    false
  }
