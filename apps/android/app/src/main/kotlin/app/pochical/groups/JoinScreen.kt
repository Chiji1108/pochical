package app.pochical.groups

import android.content.res.Resources
import android.graphics.BitmapFactory
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.Footnote
import app.pochical.LimitedTextField
import app.pochical.ListSheet
import app.pochical.MarkFrame
import app.pochical.MarkFrameSize
import app.pochical.R
import app.pochical.ReviewPrompt
import app.pochical.SectionHeader
import app.pochical.SectionRow
import app.pochical.SettingsRow
import app.pochical.design.GROUP_MAX_MEMBERS
import app.pochical.design.Metrics
import app.pochical.design.TextLimits
import app.pochical.kit.InviteDetails
import app.pochical.kit.InviteFailure
import app.pochical.kit.PhotoShelf
import app.pochical.kit.characterCount
import app.pochical.rowColors
import app.pochical.segmentShapes
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

/**
 * The face a group shows of the person joining it: their usual one, one picked here (held on the
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
 * 参加の画面 (/design's JoinScreen), opened by an invitation's link or its QR code: the group, its
 * mark and name, and who is in it; then how the person will appear in it, and at the foot what
 * joining shares over 参加する. A screen of its own, as LINE's invitations are; only × turns it
 * down. Joined, the group opens ([onGroup]); an invitation to a group the person is in already opens
 * it at once, saying so, however it was opened.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JoinScreen(code: String, onClose: () -> Unit, onGroup: (String) -> Unit) {
  val calls = LocalGroupCalls.current
  val values = LocalValues.current
  val resources = LocalResources.current
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val profile by remember(values) { values.profile() }.collectAsStateWithLifecycle(null)
  val usualName = profile?.name.orEmpty()
  val usualPhoto = profile?.photoId.orEmpty()
  var details by remember { mutableStateOf<InviteDetails?>(null) }
  var loadError by remember { mutableStateOf<InviteFailure.Reason?>(null) }
  var loads by remember { mutableStateOf(0) }
  // A name of its own for this group; empty follows the usual one.
  var ownName by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue()) }
  var face by rememberSaveable(stateSaver = JoinFaceSaver) { mutableStateOf<JoinFace>(JoinFace.Usual) }
  var joining by remember { mutableStateOf(false) }
  var joinError by remember { mutableStateOf<InviteFailure.Reason?>(null) }
  var showingMembers by remember { mutableStateOf(false) }
  var editingProfile by remember { mutableStateOf(false) }
  val myName = ownName.text.trim().ifEmpty { usualName }

  LaunchedEffect(code, loads) {
    try {
      val read = calls.invite(code)
      if (read.alreadyMember) {
        Toast.makeText(context, resources.getString(R.string.join_already_in, read.name), Toast.LENGTH_LONG).show()
        onGroup(read.groupId)
      } else {
        details = read
      }
    } catch (e: InviteFailure) {
      loadError = e.reason
    }
  }

  /** A photo picked here and let go of, by another, by none, or by closing, goes from the device. */
  fun letGo(picked: JoinFace) {
    if (picked is JoinFace.Held) scope.launch { calls.releasePhoto(picked.photoId) }
  }

  fun close() {
    letGo(face)
    onClose()
  }
  BackHandler(onBack = ::close)

  fun join() {
    joining = true
    scope.launch {
      try {
        val groupId = calls.join(code, myName)
        // Once in the group: someone with no usual name yet keeps these as theirs everywhere, which
        // the group then shows as it shows anyone's usual ones; anyone else's face is the group's.
        val faced = if (usualName.isEmpty()) keepAsUsual(calls, myName, face) else setFace(calls, face, groupId)
        (face as? JoinFace.Held)?.let { calls.releasePhoto(it.photoId) }
        if (!faced) {
          ReviewPrompt.troubled = true
          // Said past this screen, which gives way to the group at once.
          Toast.makeText(context, resources.getString(R.string.join_face_failed), Toast.LENGTH_LONG).show()
        }
        onGroup(groupId)
      } catch (e: InviteFailure) {
        ReviewPrompt.troubled = true
        joinError = e.reason
      }
      joining = false
    }
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = {},
        navigationIcon = { IconButton(onClick = ::close) { Icon(painterResource(R.drawable.ic_close), stringResource(R.string.close)) } },
      )
    }
  ) { padding ->
    val shown = details
    when {
      shown != null ->
        Column(Modifier.padding(padding).fillMaxSize()) {
          Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            Invitation(shown, code) { showingMembers = true }
            SectionHeader(stringResource(if (usualName.isEmpty()) R.string.join_you_usual else R.string.group_me))
            SectionRow(0, 1) {
              SettingsRow(
                myName.ifEmpty { stringResource(R.string.join_name_needed) },
                icon = null,
                onClick = { editingProfile = true },
                leading = { JoinFacePicture(face, myName, usualPhoto, 32.dp) },
                value =
                  stringResource(
                    if (usualName.isEmpty() || (myName == usualName && face == JoinFace.Usual)) R.string.usual_same else R.string.group_only
                  ),
                oneLine = true,
              )
            }
          }
          Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
          ) {
            Text(
              if (shown.full) stringResource(R.string.join_full_body, GROUP_MAX_MEMBERS) else stringResource(R.string.join_shares),
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
              textAlign = TextAlign.Center,
            )
            val canJoin = !shown.full && myName.isNotEmpty() && characterCount(myName) <= TextLimits.personName
            Button(onClick = ::join, enabled = canJoin && !joining, modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.control)) {
              if (joining) CircularProgressIndicator(Modifier.size(20.dp)) else Text(stringResource(R.string.join))
            }
          }
        }
      loadError != null -> Unusable(loadError!!, Modifier.padding(padding)) {
        loadError = null
        loads += 1
      }
      else -> CircularProgressIndicator(Modifier.padding(padding).padding(32.dp))
    }
  }

  if (showingMembers) details?.let { MembersSheet(it, code) { showingMembers = false } }
  if (editingProfile) {
    JoinProfileDialog(
      groupName = details?.name.orEmpty(),
      usualName = usualName,
      ownName = ownName,
      onOwnName = { ownName = it },
      face = face,
      onFace = { chosen ->
        if (chosen != face) letGo(face)
        face = chosen
      },
      usualPhoto = usualPhoto,
      myName = myName,
      onClose = { editingProfile = false },
    )
  }
  joinError?.let { reason ->
    AlertDialog(
      onDismissRequest = { joinError = null },
      title = { Text(stringResource(if (reason == InviteFailure.Reason.Full) R.string.join_full else R.string.join_failed)) },
      text = { Text(inviteMessage(reason)) },
      confirmButton = { TextButton(onClick = { joinError = null }) { Text(stringResource(R.string.ok)) } },
    )
  }
}

/** The group's mark with room around it, its name, and who is in it, which opens them all. */
@Composable
private fun Invitation(details: InviteDetails, code: String, onMembers: () -> Unit) {
  Column(
    Modifier.fillMaxWidth().padding(top = 32.dp, bottom = 12.dp, start = 16.dp, end = 16.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    MarkFrame { GroupMarkView(details.mark, MarkFrameSize, shelf = PhotoShelf.Invitation(code)) }
    Text(
      details.name,
      Modifier.padding(bottom = 12.dp).semantics { heading() },
      style = MaterialTheme.typography.headlineMedium,
      textAlign = TextAlign.Center,
      maxLines = 3,
    )
    Column(Modifier.clickable(onClick = onMembers).padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      Row(horizontalArrangement = Arrangement.spacedBy((-8).dp)) {
        details.members.take(5).forEach { member ->
          MemberAvatar(
            member.name,
            member.photoId,
            PhotoShelf.Invitation(code),
            32.dp,
            Modifier.border(2.dp, MaterialTheme.colorScheme.surface, CircleShape),
          )
        }
      }
      // Its chevron says the line opens who they are.
      Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
          memberLine(LocalResources.current, details.members.map { it.name }),
          Modifier.weight(1f, fill = false),
          style = MaterialTheme.typography.bodySmall,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
        Icon(
          painterResource(R.drawable.ic_chevron_right),
          contentDescription = null,
          Modifier.size(16.dp),
          tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
    }
  }
}

/**
 * Who is in a group, by name while that stays short (/design's memberLine): with every name there
 * it gives the count too, so nobody wonders whether the list holds more (spec/vectors/groups.json,
 * memberLine).
 */
fun memberLine(resources: Resources, names: List<String>): String =
  when {
    names.size == 1 -> resources.getString(R.string.join_members_one, names[0])
    names.size <= NAMED_MEMBERS -> resources.getString(R.string.join_members_few, names.joinToString("、"), names.size)
    else -> resources.getString(R.string.join_members_many, names.take(NAMED_MEMBERS - 1).joinToString("、"), names.size - (NAMED_MEMBERS - 1))
  }

/** How many members the line names, all of them then counted too. */
private const val NAMED_MEMBERS = 3

/** The invitation could not be read: a link that no longer works, as the site says it, or no connection, to try again. */
@Composable
private fun Unusable(reason: InviteFailure.Reason, modifier: Modifier, onRetry: () -> Unit) {
  Column(
    modifier.fillMaxSize().padding(horizontal = 32.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text(
      stringResource(if (reason == InviteFailure.Reason.Unusable) R.string.join_unusable else R.string.join_unread),
      style = MaterialTheme.typography.titleLarge,
      textAlign = TextAlign.Center,
    )
    Text(inviteMessage(reason), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    if (reason != InviteFailure.Reason.Unusable) {
      TextButton(onClick = onRetry) {
        Icon(painterResource(R.drawable.ic_refresh), contentDescription = null)
        Text(stringResource(R.string.check_again), Modifier.padding(start = 8.dp))
      }
    }
  }
}

@Composable
private fun inviteMessage(reason: InviteFailure.Reason): String =
  when (reason) {
    InviteFailure.Reason.Unusable -> stringResource(R.string.join_unusable_body)
    InviteFailure.Reason.Full -> stringResource(R.string.join_full_body, GROUP_MAX_MEMBERS)
    InviteFailure.Reason.Failed -> stringResource(R.string.join_unread_body)
  }

/** Everyone in the group before joining: names and faces only, as shifts are seen once both are in it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MembersSheet(details: InviteDetails, code: String, onDismiss: () -> Unit) {
  ListSheet(onDismiss, stringResource(R.string.join_members_title, details.members.size)) {
    item { Text(details.name, Modifier.padding(horizontal = 24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
    itemsIndexed(details.members) { _, member ->
      ListItem(
        headlineContent = { Text(member.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingContent = { MemberAvatar(member.name, member.photoId, PhotoShelf.Invitation(code), 28.dp) },
      )
    }
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
 * このグループでのあなた before joining (/design's GroupProfilePage on the join screen), or あなたの名前と写真
 * for someone with no usual name yet: the face and a name of its own, kept here and sent as the
 * person joins.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun JoinProfileDialog(
  groupName: String,
  usualName: String,
  ownName: TextFieldValue,
  onOwnName: (TextFieldValue) -> Unit,
  face: JoinFace,
  onFace: (JoinFace) -> Unit,
  usualPhoto: String,
  myName: String,
  onClose: () -> Unit,
) {
  val calls = LocalGroupCalls.current
  var photoFailed by remember { mutableStateOf(false) }
  if (photoFailed) FailedDialog(stringResource(R.string.mark_photo_failed)) { photoFailed = false }
  Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    Scaffold(
      topBar = {
        TopAppBar(
          title = { Text(stringResource(if (usualName.isEmpty()) R.string.join_you_usual else R.string.group_me)) },
          navigationIcon = { IconButton(onClick = onClose) { Icon(painterResource(R.drawable.ic_close), stringResource(R.string.close)) } },
        )
      }
    ) { padding ->
      Column(Modifier.padding(padding).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
          modifier = Modifier.padding(top = 16.dp),
          onUsual = if (face == JoinFace.Usual || usualPhoto.isEmpty()) null else ({ onFace(JoinFace.Usual) }),
          onRemove = if (hasPhoto) ({ onFace(JoinFace.None) }) else null,
        ) {
          JoinFacePicture(face, myName, usualPhoto, 88.dp)
        }
        LimitedTextField(
          ownName,
          onOwnName,
          TextLimits.personName,
          stringResource(R.string.name),
          Modifier.fillMaxWidth().padding(horizontal = 16.dp),
          placeholder = usualName.ifEmpty { stringResource(R.string.person_name_example) },
        )
        Footnote(
          if (usualName.isEmpty()) stringResource(R.string.join_you_usual_note)
          else stringResource(R.string.join_you_note, groupName, usualName)
        )
      }
    }
  }
}

/**
 * The name and face as the usual ones (設定 › プロフィール), for someone who has none yet: whether
 * they were kept.
 */
private suspend fun keepAsUsual(calls: app.pochical.kit.GroupCalls, name: String, face: JoinFace): Boolean =
  try {
    val photoId = (face as? JoinFace.Held)?.photoId?.also { calls.sendHeldPhoto(it, PhotoShelf.Mine) }.orEmpty()
    calls.setProfile(name, photoId)
    true
  } catch (e: CancellationException) {
    throw e
  } catch (_: Exception) {
    false
  }

/** The face picked here, set now the person is in the group; the usual one needs nothing. Whether it was. */
private suspend fun setFace(calls: app.pochical.kit.GroupCalls, face: JoinFace, groupId: String): Boolean =
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
