package app.pochical.groups

import android.content.Context
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import app.pochical.ListSheet
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.design.FaceDrawing
import coil3.SingletonImageLoader
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.allowHardware
import coil3.toBitmap

/**
 * イラストを選ぶ: the drawings a face can be in place of a photo (spec/sync-protocol.md, Profile),
 * round as a face shows them, in rows of four. Picking one closes it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FaceDrawingSheet(onPick: (FaceDrawing) -> Unit, onDismiss: () -> Unit) {
  ListSheet(onDismiss, title = stringResource(R.string.photo_drawing)) {
    FaceDrawing.all.chunked(PER_ROW).forEach { row ->
      item(key = row.first().id) {
        Row(Modifier.padding(horizontal = 24.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
          row.forEach { drawing ->
            AsyncImage(
              drawing.picture,
              contentDescription = drawing.name,
              Modifier.weight(1f).aspectRatio(1f).clip(CircleShape).clickable(role = Role.Button) {
                onPick(drawing)
                onDismiss()
              },
            )
          }
        }
      }
    }
  }
}

/**
 * [drawing] as a picture at the size a face is kept (chatRules.pictureMaxEdge), to go the way a photo
 * does; null when it could not be drawn, as a photo that cannot be read is none.
 */
suspend fun faceDrawingJpeg(context: Context, drawing: FaceDrawing): ByteArray? {
  val request = ImageRequest.Builder(context).data(drawing.picture).size(Chat.pictureMaxEdge).allowHardware(false).build()
  return SingletonImageLoader.get(context).execute(request).image?.let { faceJpeg(it.toBitmap()) }
}

/** How many drawings a row holds. */
private const val PER_ROW = 4
