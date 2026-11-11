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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
import app.pochical.SettingsRow
import app.pochical.SettingsSection
import app.pochical.design.TextLimits
import app.pochical.kit.GoingIn
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.MarkPhotoGone
import app.pochical.kit.NewGroupRequest
import app.pochical.kit.fitsGroupMark
import app.pochical.kit.fitsGroupName
import app.pochical.kit.fitsPersonName
import app.pochical.kit.groupEndDay
import app.pochical.kit.groupEndsAt
import app.pochical.people.usualProfile
import app.pochical.kit.guessGroupMark
import app.pochical.kit.nextGroupColor
import app.pochical.pageInsets
import java.time.LocalDate
import java.time.ZoneId

/**
 * グループを作る (/design's NewGroupPage): its name, its mark, its end if it has one, and how the
 * person is called in it.
 * The mark follows the name until one is picked: a fitting emoji, else its first letter in a color
 * the user's other groups do not use yet (spec/sync-protocol.md, Groups). Once the group is made,
 * [onMade] gets its id; the group may reach the device a moment later, on the user's socket.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewGroupPage(onBack: () -> Unit, onMade: (String) -> Unit, making: GoingIn<NewGroupRequest> = LocalGroupCalls.current.making) {
  val values = LocalValues.current
  val groups by remember(values) { values.groups() }.collectAsStateWithLifecycle(emptyList())
  val usualName = usualProfile()?.name.orEmpty()
  val slots = LocalThemeColors.current.marks.size
  // The group being made as the page opens, the page having been left while it was: the page
  // starts from all the call was begun with, the group and how the person appears in it, so it
  // shows what was asked rather than an empty form, and 作る tapped again after a failure asks for
  // the same group under the same request.
  val underWay = remember { making.underWay.value }
  val begun = underWay?.asked
  val profile = rememberJoinProfile(underWay?.let { JoinProfile.asked(it.asked.displayName, it) })
  var name by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue(begun?.name.orEmpty())) }
  // The mark picked by hand, which then stays as the name changes; none while it follows the name.
  var picked by rememberSaveable(stateSaver = MarkSaver) { mutableStateOf<GroupMarkValue?>(null) }
  // What 作る sent last, sent again as it was while nothing on the page has changed, so a retry
  // after a lost answer makes no second group.
  var sent by rememberSaveable(stateSaver = RequestSaver) { mutableStateOf(begun) }
  var failed by remember { mutableStateOf(false) }
  var photoGone by remember { mutableStateOf(false) }
  var editingMark by rememberSaveable { mutableStateOf(false) }
  // The group's end date (spec/sync-protocol.md, A group's end), none unless picked.
  var endDay by rememberSaveable { mutableStateOf(begun?.endsAtMs?.takeIf { it != 0L }?.let { groupEndDay(it, ZoneId.systemDefault()) }) }
  var editingEnd by rememberSaveable { mutableStateOf(false) }
  val busy =
    waitingOn(making, onIn = onMade) { failure ->
      if (failure is MarkPhotoGone) {
        picked = null
        sent = null
        photoGone = true
      } else {
        ReviewPrompt.troubled = true
        failed = true
      }
    }

  // The first color the user's groups do not use yet, for the guess and for a mark picked from an
  // emoji or a photo into an icon or letters.
  val freeColor = nextGroupColor(groups.map { it.mark }, slots)
  // The group's name and mark and the person's name as the page holds them at the moment they are
  // asked for, read from its state: 作る may be tapped before the page is drawn again with the
  // last change, and sends what was typed, never the page as it was last drawn (#1185).
  fun groupName() = name.text.trim()
  fun mark() = picked ?: sent?.takeIf { it.name == groupName() }?.mark ?: guessGroupMark(name.text, freeColor)
  fun myName() = profile.name(usualName)
  // Only what the server takes (spec/vectors/fits.json), so the call is never refused for it.
  fun canMake() = fitsGroupName(groupName()) && fitsGroupMark(mark()) && myName().let { it.isNotEmpty() && fitsPersonName(it) }
  val groupName = groupName()
  val mark = mark()

  fun make() {
    // As the button is off for, should the tap come before it is drawn so.
    if (!canMake()) return
    // The moment the day picked ends on this device: the same day asked again is the same request.
    val endsAtMs = endDay?.let { groupEndsAt(it, ZoneId.systemDefault()) } ?: 0
    val request = NewGroupRequest.asking(groupName(), mark(), myName(), sent, endsAtMs)
    sent = request
    // The kit's from here, a picked photo first and the face once the group is made, whether this
    // page still waits or not; tapped again before the page is drawn busy, the same call.
    making.begin(request, profile.face, profile.goingOn(usualName))
  }

  Scaffold(
    topBar = {
      PageBar(stringResource(R.string.new_group), onBack) {
        ConfirmAction(stringResource(R.string.new_group_make), onClick = ::make, enabled = canMake(), busy = busy)
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
        SettingsSection(modifier = Modifier.padding(bottom = 8.dp)) {
          row { SettingsRow(stringResource(R.string.group_mark), R.drawable.ic_palette, onClick = { editingMark = true }, valueContent = { GroupMarkBadge(mark) }) }
          row { SettingsRow(stringResource(R.string.group_end), R.drawable.ic_event, onClick = { editingEnd = true }, value = groupEndValue(endDay)) }
        }
      }
      item { Footnote(noteWithEnd(stringResource(R.string.new_group_mark_note), ends = endDay != null)) }
      item { JoinProfileSection(profile, groupName, stringResource(R.string.new_group_going)) }
    }
  }
  if (editingMark) {
    GroupMarkPage(groupName, mark, freeColor, onMark = { picked = it }, onClose = { editingMark = false })
  }
  if (editingEnd) NewGroupEndPage(endDay, onDay = { endDay = it }, onClose = { editingEnd = false })
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
