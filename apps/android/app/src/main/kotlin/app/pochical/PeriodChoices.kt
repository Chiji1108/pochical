package app.pochical

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import app.pochical.kit.ShiftPeriod

// シフトの期間 (spec/calendar.md, The shift period), as 設定 > カレンダー and the questions of
// はじめの設定 and 新しい仕事にする name and pick it.

/** The days a period starting mid-month may start on, 2日 to 28日. */
val MID_MONTH_STARTS: IntRange = 2..ShiftPeriod.STARTS.last

/** 1日〜末日, or 15日〜翌月14日, as 設定 names it. */
@Composable
fun periodName(start: Int): String =
  if (start == 1) stringResource(R.string.period_month) else stringResource(R.string.period_from, start, start - 1)

/**
 * The days a period may start on, [starts], each a radio row named by the period it makes, as
 * Material picks one of a list: 15日〜翌月14日. The one picked as the list shows is brought into
 * view, as a list this long runs past the screen.
 */
@Composable
fun PeriodChoices(picked: Int, onPick: (Int) -> Unit, modifier: Modifier = Modifier, starts: IntRange = ShiftPeriod.STARTS) {
  val shown = remember { BringIntoViewRequester() }
  LaunchedEffect(shown) { shown.bringIntoView() }
  // The row picked as the list first shows.
  val first = rememberSaveable { picked }
  Column(modifier.selectableGroup()) {
    for (start in starts) {
      ListItem(
        headlineContent = { Text(periodName(start)) },
        leadingContent = { RadioButton(selected = start == picked, onClick = null) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier =
          Modifier.then(if (start == first) Modifier.bringIntoViewRequester(shown) else Modifier).selectable(
            selected = start == picked,
            role = Role.RadioButton,
          ) {
            onPick(start)
          },
      )
    }
  }
}
