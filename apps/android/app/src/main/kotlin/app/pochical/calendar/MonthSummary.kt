package app.pochical.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.ShiftMark
import app.pochical.design.PochicalTextStyles
import app.pochical.design.Radius
import java.time.YearMonth
import kotlin.math.roundToInt
import kotlin.math.sign

// 今月のお休み under the calendar and 今月の内訳 it opens (spec/calendar.md, The month;
// /design's MonthSummary and BreakdownSheet; iOS's MonthSummary.swift).

/** A month's days by what they show: each pattern in the person's order with its days, and how many show no shift (未入力). */
data class MonthBreakdown(val month: YearMonth, val counts: List<Pair<Pattern, Int>>, val unfilled: Int)

/** How many of the month's days show a pattern that counts as off, archived ones too. */
fun OwnCalendar.daysOffCount(month: YearMonth): Int = summary(month.atDay(1), month.atEndOfMonth()).daysOff

/** 今月の内訳 of [month]. */
fun OwnCalendar.breakdown(month: YearMonth): MonthBreakdown {
  val summary = summary(month.atDay(1), month.atEndOfMonth())
  val byId = patterns.associateBy { it.id }
  return MonthBreakdown(month, summary.counts.mapNotNull { (id, days) -> byId[id]?.let { it to days } }, summary.unfilled)
}

/**
 * 今月のお休み, or 〇月のお休み away from this month: a rounded row, the label quiet, the number in
 * the accent, opening 今月の内訳. The month and its count crossfade in place as the pages move
 * (`pages` as [MonthName] reads them), so the row is right as a page lands while the heading above
 * rolls; the words around them stay put. With reduced motion they just change.
 */
@Composable
fun MonthSummary(
  pages: () -> Float,
  monthAt: (Int) -> YearMonth,
  thisMonth: YearMonth,
  reduceMotion: Boolean,
  daysOff: (YearMonth) -> Int,
  onOpen: (YearMonth) -> Unit,
  modifier: Modifier = Modifier,
) {
  val colors = LocalThemeColors.current
  // Only the months are read as the pages move; how far between them is read as it is drawn.
  val page by remember { derivedStateOf { pages().roundToInt() } }
  val toward by remember(reduceMotion) { derivedStateOf { if (reduceMotion) 0 else (pages() - page).sign.toInt() } }
  val share = { if (reduceMotion) 0f else pages() - page }
  val month = monthAt(page)
  val coming = monthAt(page + toward)
  val thisMonthName = stringResource(R.string.calendar_this_month)
  fun name(of: YearMonth) = if (of == thisMonth) thisMonthName else of.monthText
  val spoken = stringResource(R.string.summary_days_off_spoken, name(month), daysOff(month))
  val label = PochicalTextStyles.footnote.copy(color = colors.textSecondary)
  val count =
    PochicalTextStyles.footnote.copy(
      fontSize = 25.sp,
      fontWeight = FontWeight.SemiBold,
      color = colors.accentDefault,
      fontFeatureSettings = "tnum",
    )
  Row(
    modifier
      .fillMaxWidth()
      .clip(RoundedCornerShape(Radius.xxl))
      .background(colors.fillQuaternary)
      .clickable(onClickLabel = stringResource(R.string.summary_open), role = Role.Button) { onOpen(month) }
      .clearAndSetSemantics { contentDescription = spoken }
      .padding(horizontal = 16.dp, vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    BlendingText(name(month), name(coming), share, rolls = false, label, Modifier.alignByBaseline())
    Text(stringResource(R.string.summary_days_off), Modifier.alignByBaseline(), style = label)
    Spacer(Modifier.weight(1f))
    BlendingText(daysOff(month).toString(), daysOff(coming).toString(), share, rolls = false, count, Modifier.alignByBaseline())
    Spacer(Modifier.width(2.dp))
    Text(stringResource(R.string.summary_days), Modifier.alignByBaseline(), style = label.copy(color = colors.accentDefault))
    Spacer(Modifier.width(12.dp))
    Icon(painterResource(R.drawable.ic_chevron_right), null, Modifier.size(16.dp), tint = colors.textQuaternary)
  }
}

/**
 * 今月の内訳: how many days of each pattern and how many still blank, then the month's length,
 * in Material's bottom sheet, half the screen or all of it for many patterns.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MonthBreakdownSheet(breakdown: MonthBreakdown, onDismiss: () -> Unit) {
  val colors = LocalThemeColors.current
  ModalBottomSheet(onDismissRequest = onDismiss) {
    LazyColumn {
      item {
        Text(
          stringResource(R.string.breakdown_title),
          style = MaterialTheme.typography.titleLarge,
          modifier = Modifier.padding(horizontal = 24.dp).semantics { heading() },
        )
        Text(
          breakdown.month.yearMonthText,
          style = MaterialTheme.typography.bodyMedium,
          color = colors.textSecondary,
          modifier = Modifier.padding(start = 24.dp, end = 24.dp, bottom = 8.dp),
        )
      }
      items(breakdown.counts, key = { it.first.id }) { (pattern, days) ->
        ListItem(
          headlineContent = { Text(pattern.name) },
          leadingContent = { ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, 22.dp) },
          trailingContent = { Days(days) },
          colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        )
      }
      item {
        ListItem(
          headlineContent = { Text(stringResource(R.string.breakdown_unfilled), color = colors.textTertiary) },
          trailingContent = { Days(breakdown.unfilled) },
          colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        )
      }
      item {
        Text(
          stringResource(R.string.breakdown_length, breakdown.month.lengthOfMonth()),
          style = MaterialTheme.typography.bodyMedium,
          color = colors.textSecondary,
          textAlign = TextAlign.Center,
          modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
        )
      }
    }
  }
}

@Composable
private fun Days(count: Int) {
  Text(
    stringResource(R.string.breakdown_days, count),
    style = MaterialTheme.typography.titleMedium,
    color = LocalThemeColors.current.accentDefault,
  )
}
