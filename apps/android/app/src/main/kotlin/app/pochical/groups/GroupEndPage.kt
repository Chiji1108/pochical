package app.pochical.groups

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.ConfirmAction
import app.pochical.R
import app.pochical.ReviewPrompt
import app.pochical.RowEnd
import app.pochical.SettingsRow
import app.pochical.SettingsSection
import app.pochical.SettingsSwitchRow
import app.pochical.calendar.monthDayText
import app.pochical.calendar.rememberToday
import app.pochical.kit.groupEndDay
import app.pochical.kit.groupEndsAt
import app.pochical.pageInsets
import app.pochical.repeat.DayPickerDialog
import java.time.LocalDate
import java.time.ZoneId
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

// A group's end (spec/sync-protocol.md, A group's end): one moment for everyone, which each device
// shows and picks as a day by its own clock and time zone.

/** A group's end as the device holds it: the day it shows for it, none for a group with no end. */
@JvmInline value class GroupEnd(val day: LocalDate?)

/**
 * The end of the group [groupId] as the device shows it, following the group as anyone changes it;
 * null until it is read.
 */
@Composable
fun groupEnd(groupId: String): GroupEnd? {
  val values = LocalValues.current
  val endsAtMs by remember(values, groupId) { values.groupEnd(groupId) }.collectAsStateWithLifecycle(null)
  return endsAtMs?.let { ms -> GroupEnd(if (ms == 0L) null else groupEndDay(ms, ZoneId.systemDefault())) }
}

/** A group's end in a row: the day, or なし. */
@Composable
fun groupEndValue(day: LocalDate?): String = day?.monthDayText(rememberToday()) ?: stringResource(R.string.none)

/**
 * 終了日, from グループの設定: the group's end as a draft until 保存, which any member may set, change
 * or take away as any member renames the group. Someone else's change meanwhile leaves the draft,
 * which 保存 then sends: the last to save wins, as for the name.
 */
@Composable
fun GroupEndPage(groupId: String, onBack: () -> Unit) {
  GroupPage(groupId, stringResource(R.string.group_end), onBack) {
    val end = groupEnd(groupId)
    if (end == null) Scaffold(topBar = { PageBar(stringResource(R.string.group_end), onBack) }) { padding -> PageLoading(padding) }
    else EndForm(groupId, end.day, onBack)
  }
}

@Composable
private fun EndForm(groupId: String, current: LocalDate?, onBack: () -> Unit) {
  val calls = LocalGroupCalls.current
  val scope = rememberCoroutineScope()
  var saving by remember { mutableStateOf(false) }
  var failed by remember { mutableStateOf(false) }
  GroupEndForm(current, onBack, saving) { day ->
    saving = true
    scope.launch {
      try {
        calls.setEnd(groupId, day?.let { groupEndsAt(it, ZoneId.systemDefault()) } ?: 0)
        onBack()
      } catch (e: CancellationException) {
        throw e
      } catch (_: Exception) {
        ReviewPrompt.troubled = true
        failed = true
      }
      saving = false
    }
  }
  if (failed) FailedDialog(stringResource(R.string.group_end_not_changed)) { failed = false }
}

/**
 * 終了日 over グループを作る, in a full-screen dialog as its アイコン is: the same page, whose 保存 keeps
 * the day for 作る to send with the rest.
 */
@Composable
fun NewGroupEndPage(day: LocalDate?, onDay: (LocalDate?) -> Unit, onClose: () -> Unit) {
  Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    GroupEndForm(day, onClose, saving = false, Modifier.fillMaxSize()) {
      onDay(it)
      onClose()
    }
  }
}

/**
 * 終了日's page: 終了日をつける, and with it on the day, picked on the system's date picker from today
 * on (today's end is always still to come), starting at [current] or, for a new end, a month from
 * today. 保存 is there once the day shown, or none, is not [current], and gives it to [onSave];
 * going back keeps nothing.
 */
@Composable
private fun GroupEndForm(current: LocalDate?, onBack: () -> Unit, saving: Boolean, modifier: Modifier = Modifier, onSave: (LocalDate?) -> Unit) {
  val today = rememberToday()
  var on by rememberSaveable { mutableStateOf(current != null) }
  var day by rememberSaveable { mutableStateOf(current ?: today.plusMonths(1)) }
  var picking by rememberSaveable { mutableStateOf(false) }
  val shown = day.takeIf { on }
  val bar = TopAppBarDefaults.pinnedScrollBehavior()
  Scaffold(
    modifier.nestedScroll(bar.nestedScrollConnection),
    topBar = {
      PageBar(stringResource(R.string.group_end), onBack, bar) {
        ConfirmAction(stringResource(R.string.save), onClick = { onSave(shown) }, enabled = shown != current, busy = saving)
      }
    },
    contentWindowInsets = pageInsets,
  ) { padding ->
    Column(Modifier.verticalScroll(rememberScrollState()).padding(padding)) {
      SettingsSection(footnote = stringResource(R.string.group_end_note)) {
        row { SettingsSwitchRow(stringResource(R.string.group_end_on), icon = null, checked = on, onCheckedChange = { on = it }) }
        if (on) {
          row {
            SettingsRow(stringResource(R.string.group_end_day), icon = null, onClick = { picking = true }, value = day.monthDayText(today), end = RowEnd.None)
          }
        }
      }
    }
  }
  if (picking) DayPickerDialog(day, onPick = { day = it }, onDismiss = { picking = false }, from = today)
}
