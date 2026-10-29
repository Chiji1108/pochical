package app.pochical.calendar

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.SectionRow
import app.pochical.ShiftMark
import app.pochical.design.PATTERNS_PER_PAGE
import app.pochical.kit.hoursText
import app.pochical.rowColors
import app.pochical.segmentShapes
import java.time.LocalDate

/**
 * シフト for a day, picked from the person's patterns in a page of its own,
 * as Android picks one of many: in their order, each with its mark, name and
 * hours, the day's checked. Picking one goes back to the day, keeping its
 * memo and people. Past a page of ポチポチ入力's keys, a search narrows them
 * by name. Patterns no longer used are not offered.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShiftChoicePage(day: LocalDate, onBack: () -> Unit) {
  val days = LocalOwnDays.current
  val calendar by days.calendar.collectAsStateWithLifecycle()
  val entry = calendar.shown(day, day)[day]
  val patterns = calendar.patterns.filterNot { it.archived }
  var query by rememberSaveable { mutableStateOf("") }
  val shown = patterns.filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }
  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text(stringResource(R.string.day_shift)) },
        navigationIcon = {
          IconButton(onClick = onBack) {
            Icon(painterResource(R.drawable.ic_back), contentDescription = stringResource(R.string.back))
          }
        },
      )
    },
  ) { padding ->
    LazyColumn(Modifier.selectableGroup(), contentPadding = padding) {
      if (patterns.size > PATTERNS_PER_PAGE) {
        item {
          // A search field as Material's: its symbol, a way to clear it, and the keyboard's search key.
          val focus = LocalFocusManager.current
          OutlinedTextField(
            query,
            { query = it },
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            placeholder = { Text(stringResource(R.string.day_shift_search)) },
            leadingIcon = { Icon(painterResource(R.drawable.ic_search), contentDescription = null) },
            trailingIcon =
              if (query.isNotEmpty()) {
                { IconButton(onClick = { query = "" }) { Icon(painterResource(R.drawable.ic_close), stringResource(R.string.clear)) } }
              } else {
                null
              },
            singleLine = true,
            shape = CircleShape,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { focus.clearFocus() }),
          )
        }
      }
      itemsIndexed(shown, key = { _, pattern -> pattern.id }) { index, pattern ->
        val picked = pattern.id == entry?.shift
        // One rounded group of segments, the day's own on the selected container with its check.
        SectionRow(index, shown.size) {
          SegmentedListItem(
            selected = picked,
            onClick = {
              if (!picked) days.set(day, DayEntry(pattern.id, people = entry?.people.orEmpty()))
              onBack()
            },
            shapes = segmentShapes(),
            colors = rowColors(),
            supportingContent = { Text(pattern.time?.let { hoursText(it.start, it.end) } ?: stringResource(R.string.pattern_no_time)) },
            leadingContent = { ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 24.dp) },
            trailingContent =
              if (picked) {
                { Icon(painterResource(R.drawable.ic_check), null, tint = LocalThemeColors.current.accentDefault) }
              } else {
                null
              },
          ) {
            Text(pattern.name, maxLines = 1)
          }
        }
      }
    }
  }
}
