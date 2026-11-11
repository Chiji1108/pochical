package app.pochical.groups

import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pochical.R
import app.pochical.ReviewPrompt
import app.pochical.design.FaceDrawing
import app.pochical.kit.GroupCalls
import app.pochical.kit.PhotoShelf
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException

/**
 * The face of the person joining a group or making one, as picked on that screen: their usual one, one picked here (held on the
 * device under the id it is sent as, `GroupCalls.holdPhoto`), or none.
 */
sealed interface JoinFace {
  data object Usual : JoinFace

  data class Held(val photoId: String) : JoinFace

  data object None : JoinFace
}

/**
 * The choice kept across the activity made anew and the process's death, as the name typed beside
 * it is: a face removed on purpose must not come back as the usual one. A picked photo is kept by
 * its held id, its bytes in the app's cache.
 */
val JoinFaceSaver: Saver<JoinFace, String> =
  Saver(
    save = {
      when (it) {
        JoinFace.Usual -> "usual"
        JoinFace.None -> "none"
        is JoinFace.Held -> "held:${it.photoId}"
      }
    },
    restore = {
      when {
        it == "none" -> JoinFace.None
        it.startsWith("held:") -> JoinFace.Held(it.removePrefix("held:"))
        else -> JoinFace.Usual
      }
    },
  )

/**
 * Someone first asked for their name and photo ([firstAsked]: no usual name and no usual photo yet)
 * starts with one of the drawings in place, picked at random once as the screen opens
 * (spec/sync-protocol.md, Profile): theirs as they go on, as if they had picked it, and theirs to
 * change or take off before that, which never brings one back. [face] is kept across the activity
 * made anew ([JoinFaceSaver]), so the drawing stays as the phone turns.
 */
@Composable
fun StartsWithADrawing(firstAsked: Boolean, face: JoinFace, onFace: (JoinFace) -> Unit) {
  val context = LocalContext.current
  val calls = LocalGroupCalls.current
  val current by rememberUpdatedState(face)
  LaunchedEffect(firstAsked) {
    if (!firstAsked || current != JoinFace.Usual) return@LaunchedEffect
    val held = calls.holdPhoto(faceDrawingJpeg(context, FaceDrawing.all.random()))
    if (current == JoinFace.Usual) onFace(JoinFace.Held(held)) else calls.releasePhoto(held)
  }
}

/**
 * [face] with a way to change it, on the screen it is picked on: a photo or a drawing picked is held
 * on the device until the person goes on, the usual one comes back while there is one, and none
 * stays none.
 */
@Composable
fun JoinFaceEditor(face: JoinFace, onFace: (JoinFace) -> Unit, usualPhoto: String, name: String, modifier: Modifier = Modifier) {
  val calls = LocalGroupCalls.current
  var photoFailed by remember { mutableStateOf(false) }
  if (photoFailed) FailedDialog(stringResource(R.string.mark_photo_failed)) { photoFailed = false }
  val hasPhoto = face is JoinFace.Held || (face == JoinFace.Usual && usualPhoto.isNotEmpty())
  PhotoEditor(
    label = stringResource(R.string.photo_edit),
    shape = PhotoCropShape.Round,
    onPhoto = {
      try {
        onFace(JoinFace.Held(calls.holdPhoto(it)))
      } catch (_: IOException) {
        ReviewPrompt.troubled = true
        photoFailed = true
      }
    },
    modifier = modifier,
    onUsual = if (face == JoinFace.Usual || usualPhoto.isEmpty()) null else ({ onFace(JoinFace.Usual) }),
    onRemove = if (hasPhoto) ({ onFace(JoinFace.None) }) else null,
  ) {
    JoinFacePicture(face, name, usualPhoto, 88.dp)
  }
}

/** The face the group will show: the one picked here, the usual one, or the name's letter. */
@Composable
fun JoinFacePicture(face: JoinFace, name: String, usualPhoto: String, size: Dp) {
  when (face) {
    is JoinFace.Held -> PhotoPicture(face.photoId, PhotoShelf.Mine, Modifier.size(size).clip(CircleShape))
    JoinFace.Usual -> MemberAvatar(name, usualPhoto, PhotoShelf.Mine, size, me = true)
    JoinFace.None -> MemberAvatar(name, "", null, size, me = true)
  }
}

/**
 * The face as the usual one (設定 › プロフィール), for someone who had no usual name, whose name
 * joining or making the group made their usual one; the usual photo, if there is one, stays as it is. Whether it was
 * kept.
 */
suspend fun keepAsUsual(calls: GroupCalls, face: JoinFace): Boolean =
  try {
    when (face) {
      JoinFace.Usual -> Unit
      is JoinFace.Held -> {
        calls.sendHeldPhoto(face.photoId, PhotoShelf.Mine)
        calls.setProfile(name = null, photoId = face.photoId)
      }
      JoinFace.None -> calls.setProfile(name = null, photoId = "")
    }
    true
  } catch (e: CancellationException) {
    throw e
  } catch (_: Exception) {
    false
  }
