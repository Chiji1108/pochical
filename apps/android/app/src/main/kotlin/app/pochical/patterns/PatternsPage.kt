package app.pochical.patterns

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.Footnote
import app.pochical.LocalThemeColors
import app.pochical.PageNavigation
import app.pochical.R
import app.pochical.RootPage
import app.pochical.RowEnd
import app.pochical.SectionHeader
import app.pochical.SectionRow
import app.pochical.SettingsPage
import app.pochical.SettingsRow
import app.pochical.SettingsSection
import app.pochical.ShiftMark
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.Pattern
import app.pochical.design.PATTERNS_PER_PAGE
import app.pochical.kit.ShiftTime
import app.pochical.kit.hoursText
import app.pochical.rememberDragOrder
import app.pochical.rowColors
import app.pochical.segmentShapes
import sh.calvin.reorderable.ReorderableItem

/**
 * 設定 › シフトパターン (/design's PatternsPage; spec/shift-patterns.md): the patterns in use in
 * ポチポチ入力's order, where each page of its keys starts, パターンを追加, and those no longer used
 * under their own heading. 並び替え shows handles to drag them into another order, ticking as a row
 * is picked up, passes another and is let go (spec/haptics.md).
 */
@Composable
fun PatternsPage(navigation: PageNavigation) {
  val days = LocalOwnDays.current
  val calendar by days.calendar.collectAsStateWithLifecycle()
  val inUse = calendar.patterns.filterNot { it.archived }
  val archived = calendar.patterns.filter { it.archived }
  var sorting by rememberSaveable { mutableStateOf(false) }
  val list = rememberLazyListState()
  val order = rememberDragOrder(inUse, { it.id }, list) { ids -> days.orderPatterns(ids + archived.map { it.id }) }
  val rows = order.rows
  LaunchedEffect(inUse.size) { if (inUse.size < 2) sorting = false }
  SettingsPage(
    stringResource(R.string.patterns),
    onBack = navigation::back,
    actions = {
      if (inUse.size > 1) {
        TextButton(onClick = { sorting = !sorting }) {
          Text(stringResource(if (sorting) R.string.patterns_sort_done else R.string.patterns_sort))
        }
      }
    },
  ) { padding ->
    LazyColumn(state = list, contentPadding = padding) {
      // The patterns in use, then パターンを追加, one rounded group of segments.
      val count = rows.size + if (sorting) 0 else 1
      item { Spacer(Modifier.height(8.dp)) }
      itemsIndexed(rows, key = { _, pattern -> pattern.id }) { index, pattern ->
        ReorderableItem(order.state, key = pattern.id, enabled = sorting) {
          SectionRow(index, count) {
            PatternRow(
              pattern,
              // ポチポチ入力 shows them a page at a time: where each page starts, over its first pattern.
              keyPage = if (index > 0 && index % PATTERNS_PER_PAGE == 0) index / PATTERNS_PER_PAGE + 1 else null,
              onClick = if (sorting) null else ({ navigation.open(RootPage.PatternEditor(pattern.id)) }),
              handle = if (sorting) ({ order.Handle(this, stringResource(R.string.patterns_move, pattern.name)) }) else null,
            )
          }
        }
      }
      if (sorting) {
        item { Footnote(stringResource(R.string.patterns_sort_note)) }
      } else {
        item {
          SectionRow(count - 1, count) {
            SettingsRow(stringResource(R.string.patterns_add), R.drawable.ic_add, onClick = { navigation.open(RootPage.AddPattern) }, end = RowEnd.None)
          }
        }
        if (archived.isNotEmpty()) {
          item {
            SettingsSection(stringResource(R.string.patterns_archived), footnote = stringResource(R.string.patterns_archived_note)) {
              for (pattern in archived) {
                row { PatternRow(pattern, keyPage = null, onClick = { navigation.open(RootPage.PatternEditor(pattern.id)) }, handle = null) }
              }
            }
          }
        }
        // Choosing the patterns again with the repeat, for a new job.
        item {
          SettingsSection(stringResource(R.string.job)) {
            row {
              SettingsRow(
                stringResource(R.string.job_change),
                R.drawable.ic_badge,
                onClick = { navigation.open(RootPage.JobChange) },
                supporting = stringResource(R.string.job_change_note),
              )
            }
          }
        }
      }
    }
  }
}

/** A pattern in the list: its mark, name and time, and where a page of ポチポチ入力's keys starts. */
@Composable
private fun PatternRow(pattern: Pattern, keyPage: Int?, onClick: (() -> Unit)?, handle: (@Composable () -> Unit)?) {
  SettingsRow(
    pattern.name,
    icon = null,
    onClick = onClick,
    supporting = patternTimeText(pattern.time),
    leading = { ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 24.dp) },
    overline = keyPage?.let { stringResource(R.string.patterns_key_page, it) },
    valueContent = handle,
    oneLine = true,
  )
}

/** 設定's シフトパターン row: the marks of the patterns in use, and how many. */
@Composable
fun PatternsRow(open: (RootPage) -> Unit) {
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  val inUse = calendar.patterns.filterNot { it.archived }
  SettingsRow(
    stringResource(R.string.patterns),
    R.drawable.ic_work,
    onClick = { open(RootPage.Patterns) },
    valueContent = {
      // The count after the marks, whole however many there are; the marks take what room is left.
      Row(Modifier.widthIn(max = 168.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f, fill = false).clipToBounds(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          for (pattern in inUse) ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 14.dp)
        }
        Text(stringResource(R.string.patterns_count, inUse.size), style = MaterialTheme.typography.bodyMedium, maxLines = 1)
      }
    },
  )
}

/** A pattern's standard time in a line, as a day writes hours, or 時間なし. */
@Composable
fun patternTimeText(time: ShiftTime?): String = time?.let { hoursText(it.start, it.end) } ?: stringResource(R.string.pattern_no_time)
