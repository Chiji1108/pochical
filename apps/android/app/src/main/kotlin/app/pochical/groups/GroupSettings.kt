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
import app.pochical.RowEnd
import app.pochical.SectionHeader
import app.pochical.SectionRow
import app.pochical.SettingsPage
import app.pochical.SettingsRow
import app.pochical.SettingsSection
import app.pochical.characterCount
import app.pochical.chat.ProfileOf
import app.pochical.chat.ReportAndBlock
import app.pochical.chat.ReportAndBlockState
import app.pochical.design.TextLimits
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.GroupRow
import app.pochical.kit.MarkPhotoGone
import app.pochical.kit.PhotoShelf
import app.pochical.kit.directThread
import app.pochical.kit.nextGroupColor
import app.pochical.notifications.GroupChatNotifications
import app.pochical.rememberKeptField
import app.pochical.sectionRows
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

  GroupPage(groupId, stringResource(R.string.group_settings), onBack, loading = { title -> SettingsPage(title, onBack) { padding -> PageLoading(padding) } }) { group ->
    SettingsPage(stringResource(R.string.group_settings), onBack, snackbar = snackbar) { padding ->
      LazyColumn(contentPadding = padding) {
        item {
          SettingsSection(stringResource(R.string.group), footnote = stringResource(R.string.group_settings_note)) {
            row {
              SettingsRow(
                group.name,
                icon = null,
                onClick = onEdit,
                oneLine = true,
                leading = { GroupMarkBadge(group.mark, shelf = PhotoShelf.Group(groupId)) },
                value = stringResource(R.string.edit),
              )
            }
          }
        }
        item {
          SettingsSection(stringResource(R.string.group_me)) {
            row {
              SettingsRow(
                me?.displayName.orEmpty(),
                icon = null,
                onClick = onProfile,
                oneLine = true,
                leading = { MemberAvatar(me?.displayName.orEmpty(), me?.photoId.orEmpty(), PhotoShelf.Group(groupId), 32.dp, me = true) },
                value = stringResource(if (me?.ownName == true || me?.ownPhoto == true) R.string.group_only else R.string.usual_same),
                enabled = me != null,
              )
            }
          }
        }
        item { GroupChatNotifications(groupId, snackbar) }
        item { SectionHeader(stringResource(R.string.group_members)) }
        // A whole group's people, composed as they scroll into sight, then メンバーを招待.
        sectionRows(members, key = { it.userId }, extra = 1) { member ->
          val mine = member.userId == meId
          SettingsRow(
            if (mine) stringResource(R.string.member_me, member.displayName) else member.displayName,
            icon = null,
            onClick = if (mine) null else ({ reportAndBlock.profileOf = ProfileOf.of(member) }),
            leading = { MemberAvatar(member.displayName, member.photoId, PhotoShelf.Group(groupId), 32.dp, me = mine) },
            end = RowEnd.None,
            oneLine = true,
          )
        }
        item(key = "invite") {
          SectionRow(members.size, members.size + 1) { SettingsRow(stringResource(R.string.invite), R.drawable.ic_person_add, onClick = onInvite) }
        }
        item {
          SettingsSection(modifier = Modifier.padding(top = 24.dp)) {
            row {
              SettingsRow(
                stringResource(R.string.group_leave),
                R.drawable.ic_logout,
                onClick = { confirmingLeave = true },
                end = RowEnd.None,
                valueContent = if (leaving) ({ CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) }) else null,
                enabled = !leaving,
                danger = true,
              )
            }
          }
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
