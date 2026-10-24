package app.pochical.groups

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import app.pochical.R
import java.io.File
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.max
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * A face's or a mark's photo with a way to change it (/design's PhotoEditor): [label] opens a menu
 * of 写真を撮る, through the camera app, and 写真を選ぶ, through the system's Photo Picker, each then
 * cut in [PhotoCrop] to [shape] before [onPhoto] gets it, so a photo taken is cut as one picked;
 * いつもの写真に戻す ([onUsual]) and 写真を削除 ([onRemove]) when given.
 */
@Composable
fun PhotoEditor(
  label: String,
  shape: PhotoCropShape,
  onPhoto: suspend (ByteArray) -> Unit,
  modifier: Modifier = Modifier,
  onUsual: (suspend () -> Unit)? = null,
  onRemove: (suspend () -> Unit)? = null,
  picture: @Composable () -> Unit,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var menu by remember { mutableStateOf(false) }
  var cropping by remember { mutableStateOf<Bitmap?>(null) }
  var working by remember { mutableStateOf(false) }
  var unreadable by remember { mutableStateOf(false) }
  // Where the camera app writes, kept across the process's death while it is open.
  var taking by rememberSaveable { mutableStateOf<String?>(null) }

  fun crop(uri: Uri) {
    scope.launch {
      try {
        cropping = readPhoto(context, uri)
      } catch (e: CancellationException) {
        throw e
      } catch (_: Exception) {
        unreadable = true
      }
    }
  }

  val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(::crop) }
  val take =
    rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { taken ->
      val file = taking?.let(::File)
      taking = null
      if (taken && file != null) crop(Uri.fromFile(file))
    }

  fun change(action: suspend () -> Unit) {
    scope.launch {
      working = true
      try {
        action()
      } finally {
        working = false
      }
    }
  }

  Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
    Box(contentAlignment = Alignment.Center) {
      picture()
      if (working) CircularProgressIndicator()
    }
    Box {
      TextButton(onClick = { menu = true }, enabled = !working, modifier = Modifier.padding(top = 4.dp)) { Text(label) }
      DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
        DropdownMenuItem(
          text = { Text(stringResource(R.string.photo_take)) },
          leadingIcon = { Icon(painterResource(R.drawable.ic_photo_camera), contentDescription = null) },
          onClick = {
            menu = false
            val file = cameraFile(context)
            taking = file.path
            take.launch(FileProvider.getUriForFile(context, "${context.packageName}.photos", file))
          },
        )
        DropdownMenuItem(
          text = { Text(stringResource(R.string.photo_pick)) },
          leadingIcon = { Icon(painterResource(R.drawable.ic_photo_library), contentDescription = null) },
          onClick = {
            menu = false
            pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
          },
        )
        onUsual?.let { usual ->
          DropdownMenuItem(
            text = { Text(stringResource(R.string.photo_usual)) },
            onClick = {
              menu = false
              change(usual)
            },
          )
        }
        onRemove?.let { remove ->
          DropdownMenuItem(
            text = { Text(stringResource(R.string.photo_remove)) },
            onClick = {
              menu = false
              change(remove)
            },
          )
        }
      }
    }
  }

  cropping?.let { photo ->
    PhotoCrop(photo, shape) { jpeg ->
      cropping = null
      if (jpeg != null) change { onPhoto(jpeg) }
    }
  }
  if (unreadable) {
    AlertDialog(
      onDismissRequest = { unreadable = false },
      confirmButton = { TextButton(onClick = { unreadable = false }) { Text(stringResource(R.string.ok)) } },
      title = { Text(stringResource(R.string.photo_unreadable)) },
    )
  }
}

/** A new file in the app's cache for the camera app to write a photo to, shared through the app's FileProvider. */
private fun cameraFile(context: Context): File =
  File(context.cacheDir, "camera").apply { mkdirs() }.let { File(it, "${UUID.randomUUID()}.jpg") }

/**
 * The photo at [uri], turned upright and no larger than needed to cut a face from: its shorter side
 * at most [READ_EDGE], as a crop is never kept larger than chatRules.pictureMaxEdge.
 */
private suspend fun readPhoto(context: Context, uri: Uri): Bitmap =
  withContext(Dispatchers.IO) {
    ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
      decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
      val shorter = minOf(info.size.width, info.size.height)
      if (shorter > READ_EDGE) {
        val ratio = READ_EDGE.toFloat() / shorter
        decoder.setTargetSize(max(1, (info.size.width * ratio).toInt()), max(1, (info.size.height * ratio).toInt()))
      }
    }
  }.also { if (uri.scheme == "file") uri.path?.let { File(it).delete() } }

/** Room to zoom in a few times before a crop's square falls under chatRules.pictureMaxEdge. */
private const val READ_EDGE = 2048
