package app.pochical.chat

import android.content.Context
import android.graphics.ImageDecoder
import android.net.Uri
import android.util.Base64
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.clickable
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.design.Radius
import app.pochical.kit.PhotoShrinking
import app.pochical.kit.ShrunkPhoto
import app.pochical.kit.newId
import coil3.compose.AsyncImage
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// The photos picked for the next send (spec/chat.md, Photos), waiting above the composer until sent:
// shrunk as they are picked, each kept in the app's cache meanwhile, so the composer holds only
// their ids and a rotation keeps them.

/** A photo picked and shrunk, waiting above the composer: its file is in the cache under [id]. */
data class PickedPhoto(val id: String, val width: Int, val height: Int, val thumbHash: String, val small: Boolean) {
  /** Its fields as the composer's saved state keeps them. */
  fun saved(): List<Any> = listOf(id, width, height, thumbHash, small)

  companion object {
    fun restored(saved: List<*>) = PickedPhoto(saved[0] as String, saved[1] as Int, saved[2] as Int, saved[3] as String, saved[4] as Boolean)
  }
}

/** Where picked photos wait to be sent, the system free to empty it. */
private fun pickedDir(context: Context) = File(context.cacheDir, "picked-photos").apply { mkdirs() }

private fun pickedFile(context: Context, id: String, small: Boolean = false) = File(pickedDir(context), if (small) "$id.small.jpg" else "$id.jpg")

/** What came of picking: the photos shrunk, and whether any could not be read. */
class Picked(val photos: List<PickedPhoto>, val unreadable: Boolean)

/** Shrinks the photos at [uris] to send, keeping each in the cache; one the phone cannot read is left out. */
suspend fun pickPhotos(context: Context, uris: List<Uri>): Picked =
  withContext(Dispatchers.Default) {
    val shrunk = uris.map { uri -> runCatching { PhotoShrinking.shrink(ImageDecoder.createSource(context.contentResolver, uri)) }.getOrNull() }
    val photos =
      shrunk.filterNotNull().map { photo ->
        val id = newId()
        pickedFile(context, id).writeBytes(photo.jpeg)
        photo.small?.let { pickedFile(context, id, small = true).writeBytes(it) }
        PickedPhoto(id, photo.width, photo.height, Base64.encodeToString(photo.thumbHash, Base64.NO_WRAP), photo.small != null)
      }
    Picked(photos, unreadable = shrunk.any { it == null })
  }

/** The picked photos as they are sent; null when the system emptied the cache of one meanwhile. */
suspend fun shrunkPhotos(context: Context, photos: List<PickedPhoto>): List<ShrunkPhoto>? =
  withContext(Dispatchers.IO) {
    photos.map { photo ->
      val jpeg = pickedFile(context, photo.id).takeIf { it.exists() }?.readBytes() ?: return@withContext null
      val small = if (photo.small) pickedFile(context, photo.id, small = true).takeIf { it.exists() }?.readBytes() else null
      ShrunkPhoto(jpeg, photo.width, photo.height, Base64.decode(photo.thumbHash, Base64.NO_WRAP), small)
    }
  }

/** Lets go of picked photos, sent or taken out. */
suspend fun dropPicked(context: Context, photos: List<PickedPhoto>) {
  withContext(Dispatchers.IO) {
    for (photo in photos) {
      pickedFile(context, photo.id).delete()
      pickedFile(context, photo.id, small = true).delete()
    }
  }
}

/** The photos waiting above the composer (/design's PhotoTray), 64 squares each with × to take it out. */
@Composable
fun PhotoTray(context: Context, photos: List<PickedPhoto>, onRemove: (PickedPhoto) -> Unit) {
  val colors = LocalThemeColors.current
  val shape = RoundedCornerShape(Radius.md)
  val tray = stringResource(R.string.chat_photo_tray)
  LazyRow(
    Modifier.fillMaxWidth().semantics { contentDescription = tray },
    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp),
    horizontalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    itemsIndexed(photos, key = { _, photo -> photo.id }) { index, photo ->
      Box(Modifier.animateItem()) {
        AsyncImage(
          pickedFile(context, photo.id),
          contentDescription = null,
          Modifier.size(64.dp).clip(shape).background(colors.fillTertiary).border(1.dp, colors.borderDefault, shape),
          contentScale = ContentScale.Crop,
        )
        // On a photo's shade, ringed in the page's ground so it stands off the picture.
        val remove = stringResource(R.string.chat_photo_remove, index + 1)
        Box(
          Modifier.align(Alignment.TopEnd)
            .offset(6.dp, (-6).dp)
            .size(22.dp)
            .background(colors.mediaShade, CircleShape)
            .border(2.dp, colors.backgroundBase, CircleShape)
            .clip(CircleShape)
            .clickable { onRemove(photo) }
            .semantics {
              contentDescription = remove
              role = Role.Button
            },
          contentAlignment = Alignment.Center,
        ) {
          Icon(painterResource(R.drawable.ic_close), contentDescription = null, Modifier.size(12.dp), tint = colors.mediaText)
        }
      }
    }
  }
}
