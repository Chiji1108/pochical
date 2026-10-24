package app.pochical.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.ShiftMark
import app.pochical.design.Metrics
import app.pochical.design.Radius
import java.time.LocalDate
import kotlinx.coroutines.launch

/**
 * What 完了 asks when the month has blank days before its last entered one (spec/calendar.md,
 * ポチポチ入力; spec/shift-patterns.md, Blanks when entering ends): whether they are days off, made
 * so all at once with its one button. Asked, not explained, as a blank day is most often a day off
 * not entered. With more than one pattern that counts as off, chips pick which, [picked] shared
 * with the calendar behind, which draws the days faint as it would fill them.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun GapSheet(
  days: List<LocalDate>,
  offPatterns: List<Pattern>,
  picked: Pattern,
  onPick: (Pattern) -> Unit,
  onFill: (Pattern) -> Unit,
  onDismiss: () -> Unit,
) {
  val colors = LocalThemeColors.current
  val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  val scope = rememberCoroutineScope()
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
      Text(
        if (days.size == 1) stringResource(R.string.gaps_title_one) else stringResource(R.string.gaps_title, days.size),
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.semantics { heading() },
      )
      // The days, as /design's tags: words to read, not to press.
      FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (day in days) {
          Text(
            day.dayWeekdayText,
            style = MaterialTheme.typography.bodySmall,
            color = colors.textSecondary,
            modifier =
              Modifier.background(colors.fillQuaternary, RoundedCornerShape(Radius.sm)).padding(horizontal = 12.dp, vertical = 4.dp),
          )
        }
      }
      if (offPatterns.size > 1) {
        val label = stringResource(R.string.gaps_patterns)
        FlowRow(
          Modifier.semantics { contentDescription = label },
          horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
          for (pattern in offPatterns) {
            FilterChip(
              selected = pattern.id == picked.id,
              onClick = { onPick(pattern) },
              label = { Text(pattern.name) },
              leadingIcon = { ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 16.dp) },
            )
          }
        }
      }
      Button(
        onClick = {
          onFill(picked)
          scope.launch { sheet.hide() }.invokeOnCompletion { onDismiss() }
        },
        modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.control).padding(bottom = 8.dp),
      ) {
        Text(stringResource(R.string.gaps_fill, picked.name), style = MaterialTheme.typography.titleMedium)
      }
    }
  }
}
