package app.pochical.patterns

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
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
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.Footnote
import app.pochical.LocalThemeColors
import app.pochical.PageNavigation
import app.pochical.R
import app.pochical.RootPage
import app.pochical.SectionHeader
import app.pochical.SettingsPage
import app.pochical.ShiftMark
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.Pattern
import app.pochical.calendar.ShiftTime
import app.pochical.calendar.hoursText
import app.pochical.design.PATTERNS_PER_PAGE
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

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
  // The order as a finger drags it, then as written until the calendar shows it. Patterns sync
  // brings meanwhile take their places from the calendar: one new comes after, one archived goes.
  var order by remember { mutableStateOf<List<String>?>(null) }
  var dragging by remember { mutableStateOf(false) }
  val rows = order?.let { ids -> inUse.sortedBy { ids.indexOf(it.id).takeIf { place -> place >= 0 } ?: Int.MAX_VALUE } } ?: inUse
  LaunchedEffect(inUse) { if (!dragging && order == inUse.map { it.id }) order = null }
  val haptics = LocalHapticFeedback.current
  val list = rememberLazyListState()
  val reorder =
    rememberReorderableLazyListState(list) { from, to ->
      val ids = rows.map { it.id }.toMutableList()
      val moving = ids.indexOf(from.key)
      val target = ids.indexOf(to.key)
      if (moving < 0 || target < 0) return@rememberReorderableLazyListState
      ids.add(target, ids.removeAt(moving))
      order = ids
      haptics.performHapticFeedback(HapticFeedbackType.SegmentFrequentTick)
    }
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
      itemsIndexed(rows, key = { _, pattern -> pattern.id }) { index, pattern ->
        ReorderableItem(reorder, key = pattern.id, enabled = sorting) {
          PatternRow(
            pattern,
            // ポチポチ入力 shows them a page at a time: where each page starts, over its first pattern.
            keyPage = if (index > 0 && index % PATTERNS_PER_PAGE == 0) index / PATTERNS_PER_PAGE + 1 else null,
            onClick = if (sorting) null else ({ navigation.open(RootPage.PatternEditor(pattern.id)) }),
            handle =
              if (sorting) {
                {
                  IconButton(
                    onClick = {},
                    modifier =
                      Modifier.draggableHandle(
                        onDragStarted = {
                          dragging = true
                          haptics.performHapticFeedback(HapticFeedbackType.GestureThresholdActivate)
                        },
                        onDragStopped = {
                          dragging = false
                          haptics.performHapticFeedback(HapticFeedbackType.GestureEnd)
                          if (order != null) days.orderPatterns(rows.map { it.id } + archived.map { it.id })
                        },
                      ),
                  ) {
                    Icon(painterResource(R.drawable.ic_drag_handle), stringResource(R.string.patterns_move, pattern.name))
                  }
                }
              } else {
                null
              },
          )
        }
      }
      if (sorting) {
        item { Footnote(stringResource(R.string.patterns_sort_note)) }
      } else {
        item {
          val colors = LocalThemeColors.current
          ListItem(
            headlineContent = { Text(stringResource(R.string.patterns_add), color = colors.accentDefault) },
            leadingContent = { Icon(painterResource(R.drawable.ic_add), null, tint = colors.accentDefault) },
            modifier = Modifier.clickable { navigation.open(RootPage.AddPattern) },
          )
        }
        if (archived.isNotEmpty()) {
          item { SectionHeader(stringResource(R.string.patterns_archived)) }
          items(archived, key = { it.id }) { pattern ->
            PatternRow(pattern, keyPage = null, onClick = { navigation.open(RootPage.PatternEditor(pattern.id)) }, handle = null)
          }
          item { Footnote(stringResource(R.string.patterns_archived_note)) }
        }
      }
    }
  }
}

/** A pattern in the list: its mark, name and time, and where a page of ポチポチ入力's keys starts. */
@Composable
private fun PatternRow(pattern: Pattern, keyPage: Int?, onClick: (() -> Unit)?, handle: (@Composable () -> Unit)?) {
  ListItem(
    overlineContent = keyPage?.let { { Text(stringResource(R.string.patterns_key_page, it)) } },
    headlineContent = { Text(pattern.name, maxLines = 1) },
    supportingContent = { Text(patternTimeText(pattern.time)) },
    leadingContent = { ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 24.dp) },
    trailingContent = handle,
    modifier = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier,
  )
}

/** 設定's シフトパターン row: the marks of the patterns in use, and how many. */
@Composable
fun PatternsRow(open: (RootPage) -> Unit) {
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  val inUse = calendar.patterns.filterNot { it.archived }
  ListItem(
    headlineContent = { Text(stringResource(R.string.patterns)) },
    supportingContent = {
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        for (pattern in inUse) ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 14.dp)
      }
    },
    trailingContent = { Text(stringResource(R.string.patterns_count, inUse.size)) },
    modifier = Modifier.clickable { open(RootPage.Patterns) },
  )
}

/** A pattern's standard time in a line, as a day writes hours, or 時間なし. */
@Composable
fun patternTimeText(time: ShiftTime?): String = time?.let { hoursText(it.start, it.end) } ?: stringResource(R.string.pattern_no_time)
