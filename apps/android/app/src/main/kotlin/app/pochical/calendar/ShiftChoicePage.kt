package app.pochical.calendar

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.ShiftMark
import app.pochical.design.PATTERNS_PER_PAGE
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
          OutlinedTextField(
            query,
            { query = it },
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            placeholder = { Text(stringResource(R.string.day_shift_search)) },
            singleLine = true,
          )
        }
      }
      items(shown, key = { it.id }) { pattern ->
        val picked = pattern.id == entry?.shift
        ListItem(
          headlineContent = { Text(pattern.name, maxLines = 1) },
          supportingContent = {
            Text(pattern.time?.let { hoursText(it.start, it.end) } ?: stringResource(R.string.pattern_no_time))
          },
          leadingContent = { ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 24.dp) },
          trailingContent =
            if (picked) {
              { Icon(painterResource(R.drawable.ic_check), null, tint = LocalThemeColors.current.accentDefault) }
            } else {
              null
            },
          modifier =
            Modifier.selectable(selected = picked, role = Role.RadioButton) {
              if (!picked) days.set(day, DayEntry(pattern.id, people = entry?.people.orEmpty()))
              onBack()
            },
        )
      }
    }
  }
}
