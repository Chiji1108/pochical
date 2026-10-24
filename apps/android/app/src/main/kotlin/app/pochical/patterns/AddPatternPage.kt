package app.pochical.patterns

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.Footnote
import app.pochical.PageNavigation
import app.pochical.R
import app.pochical.RootPage
import app.pochical.SettingsPage
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.pattern
import app.pochical.design.ReadyPatterns
import app.pochical.kit.newId
import app.pochical.kit.readyCopies
import kotlinx.coroutines.launch

/**
 * パターンを追加 (spec/shift-patterns.md): the ready-made patterns not in the list yet, as chips under
 * their headings as the setup questions show them, several picked and added at once with 追加 at the
 * list's end, in the chips' order; and 自分で作る, after which the list shows again.
 */
@Composable
fun AddPatternPage(navigation: PageNavigation) {
  val days = LocalOwnDays.current
  val calendar by days.calendar.collectAsStateWithLifecycle()
  val ids = calendar.patterns.mapTo(HashSet()) { it.id }
  val names = calendar.patterns.mapTo(HashSet()) { it.name }
  // One already there, by its id or its name, is left out.
  val offered = { id: String -> id !in ids && ReadyPatterns.all.find { it.id == id }?.name !in names }
  val anyOffered = ReadyPatterns.offered.any(offered)
  var picked by rememberSaveable { mutableStateOf(emptySet<String>()) }
  val scope = rememberCoroutineScope()
  SettingsPage(
    stringResource(R.string.patterns_add),
    onBack = navigation::back,
    actions = {
      if (anyOffered) {
        TextButton(
          // Only ones not there yet: a 明け or 非番 picked with its 夜勤 or 当番 may be.
          enabled = picked.any(offered),
          onClick = {
            val chosen = chosenPatterns(picked).filter(offered)
            // A next day comes along only when that pattern is there or added with it.
            val added = readyCopies(chosen, ids + chosen).map { it.pattern }
            scope.launch {
              for (pattern in added) days.savePattern(pattern)
              navigation.back()
            }
          },
        ) {
          Text(stringResource(R.string.add))
        }
      }
    },
  ) { padding ->
    LazyColumn(contentPadding = padding) {
      if (anyOffered) {
        item {
          ReadyPatternChips(picked, { picked = it }, Modifier.fillMaxWidth().padding(16.dp), offered = offered)
        }
        item { Footnote(stringResource(R.string.patterns_ready_note)) }
        item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }
      }
      item {
        ListItem(
          headlineContent = { Text(stringResource(R.string.patterns_custom)) },
          modifier =
            // Once kept, it goes back to the list past this page.
            Modifier.clickable { navigation.open(RootPage.PatternEditor(newId(), isNew = true)) },
        )
      }
    }
  }
}
