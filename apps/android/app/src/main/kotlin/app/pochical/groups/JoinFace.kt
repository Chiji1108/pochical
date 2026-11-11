package app.pochical.groups

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.Footnote
import app.pochical.LimitedTextField
import app.pochical.LocalAccount
import app.pochical.R
import app.pochical.ReviewPrompt
import app.pochical.SectionHeader
import app.pochical.SectionRow
import app.pochical.SettingsRow
import app.pochical.rememberLeavingForGood
import app.pochical.design.FaceDrawing
import app.pochical.design.TextLimits
import app.pochical.kit.GroupCalls
import app.pochical.kit.GoingIn
import app.pochical.kit.JoinFace
import app.pochical.kit.PhotoShelf
import app.pochical.kit.SocketState
import app.pochical.kit.profileAsking
import app.pochical.people.usualProfile
import java.io.IOException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext

/**
 * How the person will appear in the group they are joining or making, as that screen keeps it
 * until they go on ([rememberJoinProfile]): a name of its own for the group ([ownName], empty
 * following the usual one), the [face], and whether the two become the usual ones ([asUsual]).
 */
@Stable
class JoinProfile(ownName: TextFieldValue = TextFieldValue(), face: JoinFace = JoinFace.Usual, asUsual: Boolean? = null) {
  var ownName by mutableStateOf(ownName)
  var face by mutableStateOf(face)

  /**
   * Whether the name and face asked become the usual ones, the person having no usual name:
   * decided once, when the device knows the account's ([profileAsking]), else as they first go
   * on, and kept through every retry, so neither the screen's words nor what a retry keeps changes
   * as the name going on made usual comes back. Null until then.
   */
  var asUsual by mutableStateOf(asUsual)

  /** The name the group will show: its own, else the usual one. */
  fun name(usualName: String): String = ownName.text.trim().ifEmpty { usualName }

  /** Going on: whether the name and face become the usual ones, decided now by what the screen shows if it was not yet. */
  fun goingOn(usualName: String): Boolean = (asUsual ?: usualName.isEmpty()).also { asUsual = it }

  companion object {
    /**
     * The profile a call into a group was begun with, the person appearing as [displayName]: what
     * the screen opened again while the call is under way starts from, so it shows and sends again
     * the name and face that were asked ([rememberJoinProfile]'s `begun`).
     */
    fun asked(displayName: String, call: GoingIn.Call<*>) = JoinProfile(TextFieldValue(displayName), call.face, call.asUsual)

    /**
     * Kept across the activity made anew and the process's death: a face removed on purpose must
     * not come back as the usual one, nor a drawing be picked again. A picked photo is kept by its
     * held id, its bytes in the app's cache.
     */
    val Saver: Saver<JoinProfile, Any> =
      listSaver(
        save = {
          val scope = this
          val face =
            when (val face = it.face) {
              JoinFace.Usual -> "usual"
              JoinFace.None -> "none"
              is JoinFace.Held -> "held:${face.photoId}"
            }
          listOf(with(TextFieldValue.Saver) { scope.save(it.ownName) }, face, it.asUsual)
        },
        restore = { saved ->
          val face = saved[1] as String
          JoinProfile(
            ownName = saved[0]?.let(TextFieldValue.Saver::restore) ?: TextFieldValue(),
            face =
              when {
                face == "none" -> JoinFace.None
                face.startsWith("held:") -> JoinFace.Held(face.removePrefix("held:"))
                else -> JoinFace.Usual
              },
            asUsual = saved[2] as Boolean?,
          )
        },
      )
  }
}

/**
 * The screen's [JoinProfile], for its [JoinProfileSection] to show and for it to send as the person
 * goes on.
 *
 * Someone first asked for their name and photo, with no usual name and no usual photo yet, starts
 * with one of the drawings in place, picked at random once (spec/sync-protocol.md, Profile): theirs
 * as they go on, as if they had picked it, and theirs to change or take off before that, which never
 * brings one back. That they have none is known only once the user's socket has caught up, never
 * from a database that holds no profile yet, as a device just signed in to an account in use holds
 * none until then; before that the row shows the usual ones as it reads them and nothing is put in
 * place. A drawing that cannot be drawn or held is none put in place.
 *
 * A photo held for the face is let go of by the screen as it is left for good, in turn
 * ([GroupCalls.letGoOfPhoto]), not as the phone turns; it goes from the device once the call into
 * the group begun with it, and a screen opened again that took it up, have let go of it too.
 */
@Composable
fun rememberJoinProfile(begun: JoinProfile? = null): JoinProfile {
  val context = LocalContext.current
  val calls = LocalGroupCalls.current
  val leavingForGood = rememberLeavingForGood()
  // A photo held for the face of a call under way is held by the screen that takes it up too.
  val profile = rememberSaveable(saver = JoinProfile.Saver) { begun?.also { (it.face as? JoinFace.Held)?.let { held -> calls.holdPhotoAgain(held.photoId) } } ?: JoinProfile() }
  val usual = usualProfile()
  val userSocket by LocalAccount.current.userSocket.collectAsStateWithLifecycle(SocketState.Closed)
  val asking = usual?.let { profileAsking(userSocket, it) }
  LaunchedEffect(asking) {
    if (asking == null || profile.asUsual != null) return@LaunchedEffect
    // Held whole even as the screen goes, so what is held is always either the face or let go of.
    val drawing = if (asking.drawing) withContext(NonCancellable) { faceDrawingJpeg(context, FaceDrawing.all.random())?.let { held(calls, it) } } else null
    if (isActive && profile.asUsual == null) {
      profile.asUsual = asking.asUsual
      if (drawing != null && profile.face == JoinFace.Usual) return@LaunchedEffect run { profile.face = drawing }
    }
    drawing?.let { calls.letGoOfPhoto(it.photoId) }
  }
  DisposableEffect(profile) {
    onDispose {
      if (leavingForGood()) (profile.face as? JoinFace.Held)?.let { calls.letGoOfPhoto(it.photoId) }
    }
  }
  return profile
}

/** [jpeg] held on the device as a face picked before going on; null when the device could not keep it. */
private suspend fun held(calls: GroupCalls, jpeg: ByteArray): JoinFace.Held? =
  try {
    JoinFace.Held(calls.holdPhoto(jpeg))
  } catch (_: IOException) {
    null
  }

/**
 * あなたの名前と写真, or このグループでのあなた for someone with a usual name: how the person will appear
 * in the group they are joining or making (/design's GroupProfileRow), a row of the face and the name
 * the group will show, saying for someone with a usual name whether they are the usual ones, that
 * opens the page changing them (/design's GroupProfilePage). [going] starts the page's note with
 * what going on is (参加すると、 or 作ると、), and [groupName] is empty while a group being made has no
 * name.
 */
@Composable
fun JoinProfileSection(profile: JoinProfile, groupName: String, going: String) {
  val calls = LocalGroupCalls.current
  val usual = usualProfile()
  val usualName = usual?.name.orEmpty()
  val usualPhoto = usual?.photoId.orEmpty()
  val name = profile.name(usualName)
  // With no usual name yet, the name and face are asked as the usual ones, not this group's alone:
  // as decided, else as the usual name read so far has it.
  val asUsual = profile.asUsual ?: usualName.isEmpty()
  // The page stays open as the phone turns.
  var editing by rememberSaveable { mutableStateOf(false) }

  val title = stringResource(if (asUsual) R.string.join_you_usual else R.string.group_me)
  val note =
    if (asUsual) stringResource(R.string.join_you_usual_note, going)
    else stringResource(R.string.join_you_note, going, groupName.ifEmpty { stringResource(R.string.this_group) }, usualName)
  SectionHeader(title)
  SectionRow(0, 1) {
    SettingsRow(
      name.ifEmpty { stringResource(R.string.join_name_needed) },
      icon = null,
      onClick = { editing = true },
      leading = { JoinFacePicture(profile.face, name, usualPhoto, 32.dp) },
      // The usual name typed again is still the usual one, as the group takes it. With no usual
      // name yet there is no usual one to be the same as: the row says nothing there.
      value = if (asUsual) null else stringResource(if (name == usualName && profile.face == JoinFace.Usual) R.string.usual_same else R.string.group_only),
      oneLine = true,
    )
  }
  // What going on does with these, said under the row as its page says it.
  if (asUsual) Footnote(note)
  if (editing) {
    JoinProfileDialog(
      title = title,
      note = note,
      usualName = usualName,
      ownName = profile.ownName,
      onOwnName = { profile.ownName = it },
      face = profile.face,
      // A photo picked here and let go of, by another or by none, goes from the device.
      onFace = { chosen ->
        (profile.face as? JoinFace.Held)?.takeIf { chosen != it }?.let { calls.letGoOfPhoto(it.photoId) }
        profile.face = chosen
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
  title: String,
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
          title = { Text(title) },
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
    onPhoto = { jpeg ->
      val picked = held(calls, jpeg)
      if (picked != null) {
        onFace(picked)
      } else {
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
