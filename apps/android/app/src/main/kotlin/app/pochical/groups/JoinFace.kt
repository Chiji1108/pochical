package app.pochical.groups

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.pochical.Footnote
import app.pochical.LimitedTextField
import app.pochical.SectionHeader
import app.pochical.SectionRow
import app.pochical.SettingsRow
import app.pochical.design.TextLimits
import app.pochical.people.usualProfile
import kotlinx.coroutines.launch
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
 * あなたの名前と写真, or このグループでのあなた for someone with a usual name: how the person will appear
 * in the group they are joining or making (/design's GroupProfileRow), a row of the face and the name
 * the group will show, saying whether they are the usual ones, that opens the page changing them
 * (/design's GroupProfilePage). The screen keeps [ownName] and [face], each across the activity made
 * anew, and sends them as the person goes on; [going] starts the page's note with what going on is
 * (参加すると、 or 作ると、), and [groupName] is empty while a group being made has no name.
 *
 * Someone first asked for their name and photo, with no usual name and no usual photo yet, starts
 * with one of the drawings in place, picked at random once as the screen opens
 * (spec/sync-protocol.md, Profile): theirs as they go on, as if they had picked it, and theirs to
 * change or take off before that, which never brings one back.
 */
@Composable
fun JoinProfileSection(
  ownName: TextFieldValue,
  onOwnName: (TextFieldValue) -> Unit,
  face: JoinFace,
  onFace: (JoinFace) -> Unit,
  groupName: String,
  going: String,
) {
  val context = LocalContext.current
  val calls = LocalGroupCalls.current
  val scope = rememberCoroutineScope()
  val profile = usualProfile()
  val usualName = profile?.name.orEmpty()
  val usualPhoto = profile?.photoId.orEmpty()
  val name = ownName.text.trim().ifEmpty { usualName }
  // The page stays open as the phone turns.
  var editing by rememberSaveable { mutableStateOf(false) }

  val firstAsked = profile?.let { it.name.isEmpty() && it.photoId.isEmpty() } == true
  val current by rememberUpdatedState(face)
  LaunchedEffect(firstAsked) {
    if (!firstAsked || current != JoinFace.Usual) return@LaunchedEffect
    val held = calls.holdPhoto(faceDrawingJpeg(context, FaceDrawing.all.random()))
    if (current == JoinFace.Usual) onFace(JoinFace.Held(held)) else calls.releasePhoto(held)
  }

  SectionHeader(stringResource(if (usualName.isEmpty()) R.string.join_you_usual else R.string.group_me))
  SectionRow(0, 1) {
    SettingsRow(
      name.ifEmpty { stringResource(R.string.join_name_needed) },
      icon = null,
      onClick = { editing = true },
      leading = { JoinFacePicture(face, name, usualPhoto, 32.dp) },
      // The usual name typed again is still the usual one, as the group takes it. With no usual
      // name yet, these become the usual ones.
      value = stringResource(if (usualName.isEmpty() || (name == usualName && face == JoinFace.Usual)) R.string.usual_same else R.string.group_only),
      oneLine = true,
    )
  }
  if (editing) {
    JoinProfileDialog(
      note =
        if (usualName.isEmpty()) stringResource(R.string.join_you_usual_note, going)
        else stringResource(R.string.join_you_note, going, groupName.ifEmpty { stringResource(R.string.this_group) }, usualName),
      usualName = usualName,
      ownName = ownName,
      onOwnName = onOwnName,
      face = face,
      // A photo picked here and let go of, by another or by none, goes from the device.
      onFace = { chosen ->
        (face as? JoinFace.Held)?.takeIf { chosen != face }?.let { scope.launch { calls.releasePhoto(it.photoId) } }
        onFace(chosen)
      },
      usualPhoto = usualPhoto,
      name = name,
      onClose = { editing = false },
    )
  }
}

/** The page [JoinProfileSection]'s row opens: the face and a name of its own, with [note] under them. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun JoinProfileDialog(
  note: String,
  usualName: String,
  ownName: TextFieldValue,
  onOwnName: (TextFieldValue) -> Unit,
  face: JoinFace,
  onFace: (JoinFace) -> Unit,
  usualPhoto: String,
  name: String,
  onClose: () -> Unit,
) {
  Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    Scaffold(
      topBar = {
        TopAppBar(
          title = { Text(stringResource(if (usualName.isEmpty()) R.string.join_you_usual else R.string.group_me)) },
          navigationIcon = { IconButton(onClick = onClose) { Icon(painterResource(R.drawable.ic_close), stringResource(R.string.close)) } },
        )
      }
    ) { padding ->
      Column(Modifier.consumeWindowInsets(padding).imePadding().verticalScroll(rememberScrollState()).padding(padding), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        JoinFaceEditor(face, onFace, usualPhoto, name, Modifier.padding(top = 16.dp))
        LimitedTextField(
          ownName,
          onOwnName,
          TextLimits.personName,
          stringResource(R.string.name),
          Modifier.fillMaxWidth().padding(horizontal = 16.dp),
          placeholder = usualName.ifEmpty { stringResource(R.string.person_name_example) },
        )
        Footnote(note)
      }
    }
  }
}

/**
 * [face] with a way to change it, on the screen it is picked on: a photo or a drawing picked is held
 * on the device until the person goes on, the usual one comes back while there is one, and none
 * stays none.
 */
@Composable
private fun JoinFaceEditor(face: JoinFace, onFace: (JoinFace) -> Unit, usualPhoto: String, name: String, modifier: Modifier = Modifier) {
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
private fun JoinFacePicture(face: JoinFace, name: String, usualPhoto: String, size: Dp) {
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
private suspend fun keepAsUsual(calls: GroupCalls, face: JoinFace): Boolean =
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

/**
 * The face picked on the screen, kept now the person is in the group [groupId]: someone who had no
 * usual name ([asUsual]), whose name joining or making the group made the usual one, keeps the face
 * as theirs everywhere too, which the group then shows as it shows anyone's usual ones; anyone
 * else's face, or one not kept as usual, is the group's own. A photo held for it goes from the
 * device once kept. Whether it was kept.
 */
suspend fun keepFace(calls: GroupCalls, face: JoinFace, asUsual: Boolean, groupId: String): Boolean {
  val kept =
    (asUsual && keepAsUsual(calls, face)) ||
      try {
        when (face) {
          JoinFace.Usual -> Unit
          is JoinFace.Held -> {
            calls.sendHeldPhoto(face.photoId, PhotoShelf.Group(groupId))
            calls.setGroupPhoto(groupId, usual = false, photoId = face.photoId)
          }
          JoinFace.None -> calls.setGroupPhoto(groupId, usual = false)
        }
        true
      } catch (e: CancellationException) {
        throw e
      } catch (_: Exception) {
        false
      }
  (face as? JoinFace.Held)?.let { calls.releasePhoto(it.photoId) }
  return kept
}
