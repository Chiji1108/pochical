package app.pochical.groups

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pochical.Footnote
import app.pochical.LimitedTextField
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.ReviewPrompt
import app.pochical.SectionHeader
import app.pochical.characterCount
import app.pochical.rememberKeptField
import app.pochical.design.TextLimits
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.GroupRow
import app.pochical.kit.MarkPhotoGone
import app.pochical.kit.PhotoShelf
import app.pochical.notifications.GroupChatNotifications
import app.pochical.kit.directThread
import app.pochical.kit.nextGroupColor
import app.pochical.chat.ProfileOf
import app.pochical.chat.ReportAndBlock
import app.pochical.chat.ReportAndBlockState
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

/**
 * グループの設定 (/design's GroupSettingsPage): the group's name and mark, how the person appears in
 * it, its chat's 通知, who is in it with a way to invite more, and leaving. Someone else's row opens their sheet,
 * whose このグループから外す takes them out, asked first.
 */
@Composable
fun GroupSettingsPage(
  groupId: String,
  onBack: () -> Unit,
  onEdit: () -> Unit,
  onProfile: () -> Unit,
  onInvite: () -> Unit,
  onLeft: () -> Unit,
  /** メッセージを送る on a member's profile: the one-to-one chat with them. */
  onMessage: (threadId: String) -> Unit,
) {
  val calls = LocalGroupCalls.current
  val resources = LocalResources.current
  val scope = rememberCoroutineScope()
  val snackbar = remember { SnackbarHostState() }
  val members = members(groupId).filter { !it.left }
  val meId = rememberMeId()
  val me = members.firstOrNull { it.userId == meId }
  var confirmingLeave by remember { mutableStateOf(false) }
  var leaving by remember { mutableStateOf(false) }
  var failed by remember { mutableStateOf<String?>(null) }
  val reportAndBlock = remember { ReportAndBlockState() }
  val values = LocalValues.current
  val blockRows by remember(values) { values.blocks() }.collectAsState(emptyList())
  val blocked = remember(blockRows) { blockRows.map { it.userId }.toSet() }
  var confirmingRemove by remember { mutableStateOf<GroupMemberRow?>(null) }

  GroupPage(groupId, stringResource(R.string.group_settings), onBack) { group ->
    Scaffold(topBar = { PageBar(stringResource(R.string.group_settings), onBack) }, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
    LazyColumn(contentPadding = padding) {
      item { SectionHeader(stringResource(R.string.group)) }
      item {
        ListItem(
          headlineContent = { Text(group.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
          leadingContent = { GroupMarkBadge(group.mark, shelf = PhotoShelf.Group(groupId)) },
          trailingContent = { Text(stringResource(R.string.edit)) },
          modifier = Modifier.clickable(onClick = onEdit),
        )
      }
      item { Footnote(stringResource(R.string.group_settings_note)) }
      item { SectionHeader(stringResource(R.string.group_me)) }
      item {
        ListItem(
          headlineContent = { Text(me?.displayName.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis) },
          leadingContent = { MemberAvatar(me?.displayName.orEmpty(), me?.photoId.orEmpty(), PhotoShelf.Group(groupId), 28.dp, me = true) },
          trailingContent = {
            Text(stringResource(if (me?.ownName == true || me?.ownPhoto == true) R.string.group_only else R.string.usual_same))
          },
          modifier = Modifier.clickable(enabled = me != null, onClick = onProfile),
        )
      }
      item { SectionHeader(stringResource(R.string.settings_notifications)) }
      item { GroupChatNotifications(groupId, snackbar) }
      item { SectionHeader(stringResource(R.string.group_members)) }
      items(members, key = { it.userId }) { member ->
        val mine = member.userId == meId
        MemberRow(
          member,
          groupId,
          if (mine) Modifier else Modifier.clickable { reportAndBlock.profileOf = ProfileOf.of(member) },
          me = mine,
        )
      }
      item {
        ListItem(
          headlineContent = { Text(stringResource(R.string.invite), color = MaterialTheme.colorScheme.secondary) },
          leadingContent = { Icon(painterResource(R.drawable.ic_person_add), contentDescription = null, tint = MaterialTheme.colorScheme.secondary) },
          modifier = Modifier.clickable(onClick = onInvite),
        )
      }
      item {
        ListItem(
          headlineContent = {
            if (leaving) CircularProgressIndicator(Modifier.size(20.dp))
            else Text(stringResource(R.string.group_leave), color = MaterialTheme.colorScheme.error)
          },
          modifier = Modifier.padding(top = 16.dp).clickable(enabled = !leaving) { confirmingLeave = true },
        )
      }
    }
    }

    ReportAndBlock(
      reportAndBlock,
      blocked,
      groupId,
      group.name,
      group.mark,
      snackbar,
      messaging = { person -> meId?.let { me -> { onMessage(directThread(me, person.id)) } } },
      onRemove = { person -> confirmingRemove = members.firstOrNull { it.userId == person.id } },
    )
    confirmingRemove?.let { person ->
      AlertDialog(
        onDismissRequest = { confirmingRemove = null },
        title = { Text(stringResource(R.string.member_remove_title, person.displayName)) },
        text = { Text(stringResource(R.string.member_remove_body, person.displayName, group.name)) },
        confirmButton = {
          TextButton(
            onClick = {
              confirmingRemove = null
              scope.launch {
                try {
                  calls.remove(groupId, person.userId)
                  snackbar.showSnackbar(resources.getString(R.string.member_removed, person.displayName))
                } catch (e: CancellationException) {
                  throw e
                } catch (_: Exception) {
                  ReviewPrompt.troubled = true
                  failed = resources.getString(R.string.member_not_removed, person.displayName)
                }
              }
            }
          ) {
            Text(stringResource(R.string.member_remove_confirm), color = MaterialTheme.colorScheme.error)
          }
        },
        dismissButton = { TextButton(onClick = { confirmingRemove = null }) { Text(stringResource(R.string.cancel)) } },
      )
    }
    if (confirmingLeave) {
      AlertDialog(
        onDismissRequest = { confirmingLeave = false },
        title = { Text(stringResource(R.string.group_leave_title)) },
        text = { Text(stringResource(R.string.group_leave_body, group.name)) },
        confirmButton = {
          TextButton(
            onClick = {
              confirmingLeave = false
              leaving = true
              scope.launch {
                try {
                  calls.leave(groupId)
                  onLeft()
                } catch (e: CancellationException) {
                  throw e
                } catch (_: Exception) {
                  ReviewPrompt.troubled = true
                  failed = resources.getString(R.string.group_not_left)
                }
                leaving = false
              }
            }
          ) {
            Text(stringResource(R.string.group_leave_confirm), color = MaterialTheme.colorScheme.error)
          }
        },
        dismissButton = { TextButton(onClick = { confirmingLeave = false }) { Text(stringResource(R.string.cancel)) } },
      )
    }
    failed?.let { FailedDialog(it) { failed = null } }
  }
}

/**
 * グループを編集 (/design's GroupEditPage): its name and mark, which everyone in it sees, kept as a
 * draft until 保存.
 */
@Composable
fun GroupEditPage(groupId: String, onBack: () -> Unit) {
  GroupPage(groupId, stringResource(R.string.group_edit), onBack) { group -> EditForm(group, onBack) }
}

@Composable
private fun EditForm(group: GroupRow, onBack: () -> Unit) {
  val calls = LocalGroupCalls.current
  val resources = LocalResources.current
  val scope = rememberCoroutineScope()
  val groupId = group.id
  val values = LocalValues.current
  val groups by remember(values) { values.groups() }.collectAsState(emptyList())
  // The color an emoji or a photo turned into an icon or letters starts in: the first the user's
  // other groups do not use, this one not counting.
  val freeColor = nextGroupColor(groups.filter { it.id != groupId }.map { it.mark }, LocalThemeColors.current.marks.size)
  var name by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue(group.name)) }
  var mark by rememberSaveable(stateSaver = MarkSaver) { mutableStateOf<GroupMarkValue?>(group.mark) }
  var editingMark by rememberSaveable { mutableStateOf(false) }
  var saving by remember { mutableStateOf(false) }
  var failed by remember { mutableStateOf(false) }
  var photoGone by remember { mutableStateOf(false) }
  val shown = mark ?: group.mark
  val trimmed = name.text.trim()
  val canSave = trimmed.isNotEmpty() && characterCount(name.text) <= TextLimits.groupName && (trimmed != group.name || shown != group.mark)

  fun save() {
    saving = true
    scope.launch {
      try {
        // A newly picked photo goes up first, for the group to take.
        if (shown.photoId.isNotEmpty() && shown.photoId != group.mark.photoId) calls.sendHeldPhoto(shown.photoId, PhotoShelf.Mine)
        calls.rename(groupId, trimmed, shown)
        onBack()
      } catch (e: CancellationException) {
        throw e
      } catch (_: MarkPhotoGone) {
        mark = group.mark
        photoGone = true
      } catch (_: Exception) {
        ReviewPrompt.troubled = true
        failed = true
      }
      saving = false
    }
  }

  Scaffold(
    topBar = {
      PageBar(stringResource(R.string.group_edit), onBack) {
        if (saving) CircularProgressIndicator(Modifier.padding(end = 16.dp).size(24.dp))
        else TextButton(onClick = ::save, enabled = canSave) { Text(stringResource(R.string.save)) }
      }
    }
  ) { padding ->
    Column(Modifier.padding(padding)) {
      LimitedTextField(
        name,
        { name = it },
        TextLimits.groupName,
        stringResource(R.string.group_name),
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        placeholder = stringResource(R.string.group_name_example),
      )
      ListItem(
        headlineContent = { Text(stringResource(R.string.group_mark)) },
        trailingContent = { GroupMarkBadge(shown, shelf = PhotoShelf.Group(groupId)) },
        modifier = Modifier.clickable { editingMark = true },
      )
    }
  }
  if (editingMark) GroupMarkPage(trimmed, shown, freeColor, onMark = { mark = it }, onClose = { editingMark = false }, shelf = PhotoShelf.Group(groupId))
  if (failed) FailedDialog(resources.getString(R.string.not_saved)) { failed = false }
  if (photoGone) {
    AlertDialog(
      onDismissRequest = { photoGone = false },
      title = { Text(stringResource(R.string.mark_photo_gone)) },
      text = { Text(stringResource(R.string.mark_photo_gone_body)) },
      confirmButton = { TextButton(onClick = { photoGone = false }) { Text(stringResource(R.string.ok)) } },
    )
  }
}

/**
 * このグループでのあなた (/design's GroupProfilePage): how the person appears in the group, which its
 * members see: a photo and a name of its own, or, left empty, their usual ones, which it then
 * follows (spec/sync-protocol.md, Profile). The photo is kept as it is picked, the name as the field,
 * the page or the app is left, to its end whether the page is still there or not. Neither tells the
 * group's chat.
 */
@Composable
fun GroupProfilePage(groupId: String, onBack: () -> Unit) {
  val resources = LocalResources.current
  var failed by remember { mutableStateOf(false) }
  GroupPage(groupId, stringResource(R.string.group_me), onBack) { group ->
    val meId = rememberMeId()
    val me = members(groupId).firstOrNull { it.userId == meId }
    Scaffold(topBar = { PageBar(stringResource(R.string.group_me), onBack) }) { padding ->
      if (me == null) {
        CircularProgressIndicator(Modifier.padding(padding).padding(24.dp))
      } else {
        ProfileForm(group.name, me, Modifier.padding(padding)) {
          ReviewPrompt.troubled = true
          failed = true
        }
      }
    }
  }
  if (failed) FailedDialog(resources.getString(R.string.not_saved)) { failed = false }
}

@Composable
private fun ProfileForm(groupName: String, me: GroupMemberRow, modifier: Modifier, onFailed: () -> Unit) {
  val calls = LocalGroupCalls.current
  val values = LocalValues.current
  val scope = rememberCoroutineScope()
  val groupId = me.groupId
  val usualName = remember(values) { values.profile() }.collectAsState(null).value?.name.orEmpty()
  val kept = if (me.ownName) me.displayName else ""
  val name =
    rememberKeptField(kept, fits = { characterCount(it) <= TextLimits.personName && !(it.isEmpty() && usualName.isEmpty()) }) {
      calls.keepDisplayName(groupId, it)
    }

  suspend fun change(making: suspend () -> Unit) {
    try {
      making()
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      onFailed()
    }
  }

  Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
    PhotoEditor(
      label = stringResource(R.string.photo_edit),
      shape = PhotoCropShape.Round,
      onPhoto = { jpeg ->
        change { calls.setGroupPhoto(groupId, usual = false, photoId = calls.sendPhoto(jpeg, PhotoShelf.Group(groupId))) }
      },
      modifier = Modifier.padding(top = 16.dp),
      onUsual = if (me.ownPhoto) ({ change { calls.setGroupPhoto(groupId, usual = true) } }) else null,
      onRemove = { change { calls.setGroupPhoto(groupId, usual = false) } },
    ) {
      MemberAvatar(me.displayName, me.photoId, PhotoShelf.Group(groupId), 88.dp, me = true)
    }
    LimitedTextField(
      name.field.value,
      { name.field.value = it },
      TextLimits.personName,
      stringResource(R.string.name),
      Modifier.fillMaxWidth().padding(horizontal = 16.dp).onFocusChanged { if (!it.isFocused) name.keep() },
      placeholder = usualName.ifEmpty { stringResource(R.string.person_name_example) },
    )
    if (name.failed) {
      Text(
        stringResource(R.string.name_not_saved),
        Modifier.padding(horizontal = 16.dp),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium,
      )
    } else {
      Footnote(
        if (usualName.isEmpty()) stringResource(R.string.group_me_note, groupName)
        else stringResource(R.string.group_me_note_usual, groupName, usualName)
      )
    }
  }
}
