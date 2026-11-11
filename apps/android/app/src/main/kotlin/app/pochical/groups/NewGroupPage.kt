package app.pochical.groups

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import android.widget.Toast
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.ConfirmAction
import app.pochical.Footnote
import app.pochical.LimitedTextField
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.ReviewPrompt
import app.pochical.SectionRow
import app.pochical.SettingsRow
import app.pochical.design.TextLimits
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.MarkPhotoGone
import app.pochical.kit.NewGroupRequest
import app.pochical.kit.PhotoShelf
import app.pochical.kit.fitsGroupMark
import app.pochical.kit.fitsGroupName
import app.pochical.kit.fitsPersonName
import app.pochical.people.usualProfile
import app.pochical.kit.guessGroupMark
import app.pochical.kit.nextGroupColor
import app.pochical.pageInsets
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

/**
 * グループを作る (/design's NewGroupPage): its name, its mark and how the person is called in it.
 * The mark follows the name until one is picked: a fitting emoji, else its first letter in a color
 * the user's other groups do not use yet (spec/sync-protocol.md, Groups). Once the group is made,
 * [onMade] gets its id; the group may reach the device a moment later, on the user's socket.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewGroupPage(onBack: () -> Unit, onMade: (String) -> Unit) {
  val calls = LocalGroupCalls.current
  val values = LocalValues.current
  val groups by remember(values) { values.groups() }.collectAsStateWithLifecycle(emptyList())
  val usualName = usualProfile()?.name.orEmpty()
  val context = LocalContext.current
  val resources = LocalResources.current
  // A name of its own for this group, empty following the usual one, and the face for it, sent once
  // the group is made.
  var ownName by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue()) }
  var face by rememberSaveable(stateSaver = JoinFaceSaver) { mutableStateOf<JoinFace>(JoinFace.Usual) }
  val myName = ownName.text.trim().ifEmpty { usualName }
  val slots = LocalThemeColors.current.marks.size
  var name by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue()) }
  // The mark picked by hand, which then stays as the name changes; none while it follows the name.
  var picked by rememberSaveable(stateSaver = MarkSaver) { mutableStateOf<GroupMarkValue?>(null) }
  // What 作る sent last, sent again as it was while nothing on the page has changed, so a retry
  // after a lost answer makes no second group.
  var sent by rememberSaveable(stateSaver = RequestSaver) { mutableStateOf<NewGroupRequest?>(null) }
  var making by remember { mutableStateOf(false) }
  var failed by remember { mutableStateOf(false) }
  var photoGone by remember { mutableStateOf(false) }
  var editingMark by rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  val groupName = name.text.trim()
  // The first color the user's groups do not use yet, for the guess and for a mark picked from an
  // emoji or a photo into an icon or letters.
  val freeColor = nextGroupColor(groups.map { it.mark }, slots)
  val mark =
    picked
      ?: sent?.takeIf { it.name == groupName }?.mark
      ?: guessGroupMark(name.text, freeColor)
  // Only what the server takes (spec/vectors/fits.json), so the call is never refused for it.
  val canMake = fitsGroupName(groupName) && fitsGroupMark(mark) && myName.isNotEmpty() && fitsPersonName(myName)

  fun make() {
    val request = NewGroupRequest.asking(groupName, mark, myName, sent)
    sent = request
    making = true
    // Decided by the page the person saw: making the group makes their name the usual one, which
    // comes back on the user's socket while it is still going.
    val asUsual = usualName.isEmpty()
    scope.launch {
      try {
        // A picked photo goes up first, for the group to take.
        if (request.mark.photoId.isNotEmpty()) calls.sendHeldPhoto(request.mark.photoId, PhotoShelf.Mine)
        val made = calls.create(request)
        // Once the group is made, so one that fails changes nothing.
        if (!keepFace(calls, face, asUsual, made)) {
          ReviewPrompt.troubled = true
          Toast.makeText(context, resources.getString(R.string.join_face_failed), Toast.LENGTH_LONG).show()
        }
        // Still making as the page gives way to the group, so 作る is not there to tap again.
        onMade(made)
        return@launch
      } catch (e: CancellationException) {
        throw e
      } catch (_: MarkPhotoGone) {
        picked = null
        sent = null
        photoGone = true
      } catch (_: Exception) {
        ReviewPrompt.troubled = true
        failed = true
      }
      making = false
    }
  }

  Scaffold(
    topBar = {
      PageBar(stringResource(R.string.new_group), onBack) {
        ConfirmAction(stringResource(R.string.new_group_make), onClick = ::make, enabled = canMake, busy = making)
      }
    },
    contentWindowInsets = pageInsets,
  ) { padding ->
    LazyColumn(contentPadding = padding) {
      item {
        LimitedTextField(
          name,
          { name = it },
          TextLimits.groupName,
          stringResource(R.string.group_name),
          Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
          placeholder = stringResource(R.string.group_name_example),
        )
      }
      item {
        SectionRow(0, 1, Modifier.padding(vertical = 8.dp)) {
          SettingsRow(stringResource(R.string.group_mark), R.drawable.ic_palette, onClick = { editingMark = true }, valueContent = { GroupMarkBadge(mark) })
        }
      }
      item { Footnote(stringResource(R.string.new_group_mark_note)) }
      item { JoinProfileSection(ownName, { ownName = it }, face, { face = it }, groupName, stringResource(R.string.new_group_going)) }
    }
  }
  if (editingMark) {
    GroupMarkPage(groupName, mark, freeColor, onMark = { picked = it }, onClose = { editingMark = false })
  }
  if (failed) {
    AlertDialog(
      onDismissRequest = { failed = false },
      confirmButton = { TextButton(onClick = { failed = false }) { Text(stringResource(R.string.ok)) } },
      title = { Text(stringResource(R.string.new_group_failed)) },
      text = { Text(stringResource(R.string.try_again_online)) },
    )
  }
  if (photoGone) {
    AlertDialog(
      onDismissRequest = { photoGone = false },
      confirmButton = { TextButton(onClick = { photoGone = false }) { Text(stringResource(R.string.ok)) } },
      title = { Text(stringResource(R.string.mark_photo_gone)) },
      text = { Text(stringResource(R.string.mark_photo_gone_body)) },
    )
  }
}
