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
 * the app's cache named from [stem], the one shared before under it gone, read through its
 * FileProvider; whether the sheet opened.
 */
suspend fun sharePicture(context: Context, picture: Bitmap, stem: String, title: String): Boolean =
  shareImage(context, stem, "png", "image/png", title) { picture.compress(Bitmap.CompressFormat.PNG, 100, it) }

/** Shares a chat's photo, its [jpeg] as it came, through Android's share sheet; whether the sheet opened. */
suspend fun sharePhoto(context: Context, jpeg: ByteArray): Boolean = shareImage(context, "photo", "jpg", "image/jpeg", null) { it.write(jpeg) }

private suspend fun shareImage(context: Context, stem: String, extension: String, mimeType: String, title: String?, write: (java.io.OutputStream) -> Unit): Boolean =
  try {
    val file =
      withContext(Dispatchers.IO) {
        val shared = File(context.cacheDir, "shared").apply { mkdirs() }
        shared.listFiles { file -> file.name.startsWith("$stem-") }?.forEach(File::delete)
        File(shared, "$stem-${UUID.randomUUID()}.$extension").also { file -> file.outputStream().use(write) }
      }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.photos", file)
    val send =
      Intent(Intent.ACTION_SEND)
        .setType(mimeType)
        .putExtra(Intent.EXTRA_STREAM, uri)
        .apply { title?.let { putExtra(Intent.EXTRA_TITLE, it) } }
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
  saveImage(context, fileName, "image/png") { picture.compress(Bitmap.CompressFormat.PNG, 100, it) }

/** Saves a chat's photo, its [jpeg] as it came, to the phone's pictures as [fileName]; whether it was. */
suspend fun savePhoto(context: Context, jpeg: ByteArray, fileName: String): Boolean =
  saveImage(context, fileName, "image/jpeg") {
    it.write(jpeg)
    true
  }

/**
 * Saves an image [write] writes to the phone's pictures as [fileName] of [mimeType], through
 * MediaStore, which needs no permission from Android 10 (minSdk); whether it was. One half written
 * is taken out again.
 */
private suspend fun saveImage(context: Context, fileName: String, mimeType: String, write: (java.io.OutputStream) -> Boolean): Boolean =
  try {
    withContext(Dispatchers.IO) {
      val resolver = context.contentResolver
      val details =
        ContentValues().apply {
          put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
          put(MediaStore.Images.Media.MIME_TYPE, mimeType)
          put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES)
          put(MediaStore.Images.Media.IS_PENDING, 1)
        }
      val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, details) ?: return@withContext false
      val written = resolver.openOutputStream(uri)?.use(write) ?: false
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
