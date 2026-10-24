package app.pochical.people

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.Footnote
import app.pochical.LimitedTextField
import app.pochical.LocalThemeColors
import app.pochical.PageNavigation
import app.pochical.R
import app.pochical.RootPage
import app.pochical.SettingsPage
import app.pochical.design.TextLimits
import app.pochical.calendar.Coworker
import app.pochical.calendar.LocalOwnDays
import app.pochical.design.COWORKERS_MAX
import app.pochical.groups.LocalValues
import app.pochical.kit.coworkerDays
import app.pochical.limitText
import app.pochical.limited
import app.pochical.rememberDragOrder
import kotlinx.coroutines.launch
import sh.calvin.reorderable.ReorderableItem

/** How many of the person's days note each of 一緒に働く人, by id, as the days change; null until first read. */
@Composable
private fun coworkerDays(): Map<String, Int>? {
  val values = LocalValues.current
  return remember(values) { values.coworkerDays() }.collectAsStateWithLifecycle(null).value
}

/**
 * 設定 › 一緒に働く人 (/design's CoworkersPage; spec/sync-protocol.md, Coworkers): the people noted on
 * days, in the order a day's details list them, each with how many days note them. 人を追加 opens a
 * field in the list, as Android asks for a name; 並び替え shows handles to drag them into another
 * order, ticking as a row is picked up, passes another and is let go (spec/haptics.md).
 */
@Composable
fun CoworkersPage(navigation: PageNavigation) {
  val days = LocalOwnDays.current
  val calendar by days.calendar.collectAsStateWithLifecycle()
  val people = calendar.coworkers
  val counts = coworkerDays().orEmpty()
  val resources = LocalResources.current
  val snackbar = remember { SnackbarHostState() }
  val scope = rememberCoroutineScope()
  var sorting by rememberSaveable { mutableStateOf(false) }
  var adding by rememberSaveable { mutableStateOf(false) }
  var typed by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue()) }
  val list = rememberLazyListState()
  val order = rememberDragOrder(people, { it.id }, list, days::orderCoworkers)
  LaunchedEffect(people.size) { if (people.size < 2) sorting = false }

  fun full() = scope.launch { snackbar.showSnackbar(resources.getString(R.string.day_people_full, COWORKERS_MAX)) }

  // The name typed, cut to the limit; one already there, or none, adds no one.
  fun add() {
    val name = limitText(typed.text, TextLimits.personName).trim()
    if (name.isNotEmpty() && people.none { it.name == name }) {
      if (people.size >= COWORKERS_MAX) {
        full()
        return
      }
      days.addCoworker(name)
    }
    typed = TextFieldValue()
  }

  SettingsPage(
    stringResource(R.string.coworkers),
    onBack = navigation::back,
    actions = {
      if (people.size > 1 && !adding) {
        TextButton(onClick = { sorting = !sorting }) {
          Text(stringResource(if (sorting) R.string.patterns_sort_done else R.string.patterns_sort))
        }
      }
    },
  ) { padding ->
    Column(Modifier.padding(padding)) {
      LazyColumn(Modifier.weight(1f, fill = false), state = list) {
        items(order.rows, key = { it.id }) { person ->
          ReorderableItem(order.state, key = person.id, enabled = sorting) {
            ListItem(
              headlineContent = { Text(person.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
              trailingContent =
                if (sorting) ({ order.Handle(this, stringResource(R.string.coworkers_move, person.name)) })
                else ({ Text(stringResource(R.string.coworker_days, counts[person.id] ?: 0)) }),
              modifier = if (sorting) Modifier else Modifier.clickable { navigation.open(RootPage.CoworkerEditor(person.id)) },
            )
          }
        }
        if (!sorting) {
          item {
            if (adding) {
              AddField(typed, { typed = it }, onAdd = ::add, onDone = { adding = false })
            } else {
              val colors = LocalThemeColors.current
              ListItem(
                headlineContent = { Text(stringResource(R.string.coworkers_add), color = colors.accentDefault) },
                leadingContent = { Icon(painterResource(R.drawable.ic_add), null, tint = colors.accentDefault) },
                modifier = Modifier.clickable { if (people.size >= COWORKERS_MAX) full() else adding = true },
              )
            }
          }
        }
        item { Footnote(stringResource(if (sorting) R.string.coworkers_sort_note else R.string.coworkers_note)) }
      }
      SnackbarHost(snackbar)
    }
  }
}

/** The field 人を追加 opens in the list: a name, added as it is sent; left empty, it closes. */
@Composable
private fun AddField(typed: TextFieldValue, onType: (TextFieldValue) -> Unit, onAdd: () -> Unit, onDone: () -> Unit) {
  val focus = remember { FocusRequester() }
  // Left empty once it had the focus; not as it is first laid out, before it takes it.
  var focused by remember { mutableStateOf(false) }
  LaunchedEffect(Unit) { focus.requestFocus() }
  // The field stays for the next name, the button pressed having taken its focus.
  fun add() {
    onAdd()
    focus.requestFocus()
  }
  Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
    OutlinedTextField(
      typed,
      { onType(it.limited(TextLimits.personName)) },
      Modifier.weight(1f).focusRequester(focus).onFocusChanged {
        if (it.isFocused) focused = true else if (focused && typed.text.isBlank()) onDone()
      },
      label = { Text(stringResource(R.string.name)) },
      singleLine = true,
      keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done),
      keyboardActions = KeyboardActions(onDone = { if (typed.text.isBlank()) onDone() else add() }),
    )
    TextButton(onClick = ::add, Modifier.padding(start = 8.dp), enabled = typed.text.isNotBlank()) { Text(stringResource(R.string.add)) }
  }
}

/**
 * Someone of 一緒に働く人 (/design's CoworkerEditor): their name, changed on every day they are on and
 * kept as the field, the page or the app is left (spec/calendar.md, Text fields), through the days'
 * own writes, which outlive the page; deleting takes them off those days, asked first when there are
 * any.
 */
@Composable
fun CoworkerEditorPage(id: String, navigation: PageNavigation) {
  val days = LocalOwnDays.current
  val calendar by days.calendar.collectAsStateWithLifecycle()
  val person = calendar.coworkers.firstOrNull { it.id == id }
  // Unknown until read, when 削除 waits, as it asks first when days note them.
  val count = coworkerDays()?.let { it[id] ?: 0 }
  // Gone, from here or another device: nothing of them is kept any more.
  var seen by remember { mutableStateOf(false) }
  LaunchedEffect(person != null) { if (person != null) seen = true else if (seen) navigation.back() }
  if (person == null) {
    SettingsPage("", onBack = navigation::back) {}
    return
  }
  CoworkerForm(person, count, calendar.coworkers.filter { it.id != id }.map(Coworker::name), navigation)
}

@Composable
private fun CoworkerForm(person: Coworker, count: Int?, taken: List<String>, navigation: PageNavigation) {
  val days = LocalOwnDays.current
  var name by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue(person.name)) }
  // The name this page started from or last kept: only a name typed here is written, so a rename
  // from another device meanwhile is not undone by a field left as it was.
  var from by rememberSaveable { mutableStateOf(person.name) }
  var confirming by rememberSaveable { mutableStateOf(false) }
  var deleted by remember { mutableStateOf(false) }
  val trimmed = name.text.trim()
  val duplicate = trimmed in taken
  // Renamed elsewhere while the field is as it was, it shows the new name.
  LaunchedEffect(person.name) {
    if (trimmed == from) {
      name = TextFieldValue(person.name)
      from = person.name
    }
  }
  // An empty name or another's is not kept, and the person keeps theirs.
  val keep by rememberUpdatedState {
    if (!deleted && trimmed.isNotEmpty() && !duplicate && trimmed != from) {
      days.renameCoworker(person.id, trimmed)
      from = trimmed
    }
  }
  DisposableEffect(Unit) { onDispose { keep() } }
  LifecycleEventEffect(Lifecycle.Event.ON_STOP) { keep() }

  fun delete() {
    deleted = true
    days.deleteCoworker(person.id)
    navigation.back()
  }

  SettingsPage(person.name, onBack = navigation::back) { padding ->
    Column(Modifier.padding(padding)) {
      LimitedTextField(
        name,
        { name = it },
        TextLimits.personName,
        stringResource(R.string.name),
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).onFocusChanged { if (!it.isFocused) keep() },
      )
      val problem =
        when {
          duplicate -> stringResource(R.string.coworker_duplicate)
          trimmed.isEmpty() -> stringResource(R.string.coworker_name_empty)
          else -> null
        }
      Text(
        problem ?: count?.let { stringResource(R.string.coworker_days_note, it) }.orEmpty(),
        Modifier.padding(horizontal = 16.dp),
        style = MaterialTheme.typography.bodyMedium,
        color = if (problem != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
      )
      TextButton(onClick = { if (count == 0) delete() else confirming = true }, Modifier.padding(16.dp), enabled = count != null) {
        Text(stringResource(R.string.coworker_delete), color = MaterialTheme.colorScheme.error)
      }
    }
  }
  if (confirming) {
    AlertDialog(
      onDismissRequest = { confirming = false },
      title = { Text(stringResource(R.string.coworker_delete_title, person.name)) },
      text = { Text(stringResource(R.string.coworker_delete_body, count ?: 0, person.name)) },
      confirmButton = {
        TextButton(
          onClick = {
            confirming = false
            delete()
          }
        ) {
          Text(stringResource(R.string.delete), color = MaterialTheme.colorScheme.error)
        }
      },
      dismissButton = { TextButton(onClick = { confirming = false }) { Text(stringResource(R.string.cancel)) } },
    )
  }
}

/** 設定's 一緒に働く人 row: how many there are. */
@Composable
fun CoworkersRow(open: (RootPage) -> Unit) {
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  ListItem(
    headlineContent = { Text(stringResource(R.string.coworkers)) },
    trailingContent = { Text(stringResource(R.string.coworkers_count, calendar.coworkers.size)) },
    modifier = Modifier.clickable { open(RootPage.Coworkers) },
  )
}
