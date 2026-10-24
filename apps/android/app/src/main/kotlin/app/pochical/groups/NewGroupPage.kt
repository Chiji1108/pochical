package app.pochical.groups

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import app.pochical.Footnote
import app.pochical.LimitedTextField
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.characterCount
import app.pochical.design.TextLimits
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.MarkPhotoGone
import app.pochical.kit.NewGroupRequest
import app.pochical.kit.PhotoShelf
import app.pochical.kit.guessGroupMark
import app.pochical.kit.nextGroupColor
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
  val groups by remember(values) { values.groups() }.collectAsState(emptyList())
  val usualName = remember(values) { values.profile() }.collectAsState(null).value?.name.orEmpty()
  val slots = LocalThemeColors.current.marks.size
  var name by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue()) }
  var myName by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue()) }
  var myNameTouched by rememberSaveable { mutableStateOf(false) }
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

  // The field starts with the usual name (設定 › プロフィール) until the person types their own.
  LaunchedEffect(usualName) { if (!myNameTouched) myName = TextFieldValue(usualName) }

  val groupName = name.text.trim()
  // The first color the user's groups do not use yet, for the guess and for a mark picked from an
  // emoji or a photo into an icon or letters.
  val freeColor = nextGroupColor(groups.map { it.mark }, slots)
  val mark =
    picked
      ?: sent?.takeIf { it.name == groupName }?.mark
      ?: guessGroupMark(name.text, freeColor)
  val canMake =
    groupName.isNotEmpty() && myName.text.isNotBlank() && characterCount(name.text) <= TextLimits.groupName &&
      characterCount(myName.text) <= TextLimits.personName

  fun make() {
    val request = NewGroupRequest.asking(groupName, mark, myName.text.trim(), sent)
    sent = request
    making = true
    scope.launch {
      try {
        // A picked photo goes up first, for the group to take.
        if (request.mark.photoId.isNotEmpty()) calls.sendHeldPhoto(request.mark.photoId, PhotoShelf.Mine)
        // Still making as the page gives way to the group, so 作る is not there to tap again.
        onMade(calls.create(request))
        return@launch
      } catch (e: CancellationException) {
        throw e
      } catch (_: MarkPhotoGone) {
        picked = null
        sent = null
        photoGone = true
      } catch (_: Exception) {
        failed = true
      }
      making = false
    }
  }

  Scaffold(
    topBar = {
      PageBar(stringResource(R.string.new_group), onBack) {
        if (making) {
          CircularProgressIndicator(Modifier.padding(end = 16.dp).size(24.dp))
        } else {
          TextButton(onClick = ::make, enabled = canMake) { Text(stringResource(R.string.new_group_make)) }
        }
      }
    }
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
        ListItem(
          headlineContent = { Text(stringResource(R.string.group_mark)) },
          trailingContent = { GroupMarkBadge(mark) },
          modifier = Modifier.clickable { editingMark = true },
        )
      }
      item {
        LimitedTextField(
          myName,
          {
            myName = it
            myNameTouched = true
          },
          TextLimits.personName,
          stringResource(R.string.group_my_name),
          Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
          placeholder = stringResource(R.string.person_name_example),
        )
      }
      item { Footnote(stringResource(R.string.new_group_mark_note)) }
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
