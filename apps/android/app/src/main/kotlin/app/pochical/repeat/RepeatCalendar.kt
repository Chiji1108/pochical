package app.pochical.repeat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.calendar.DAY_FULL_HEIGHT
import app.pochical.calendar.DayCell
import app.pochical.calendar.DayEntry
import app.pochical.calendar.OffShown
import app.pochical.calendar.DayLook
import app.pochical.calendar.OwnCalendar
import app.pochical.calendar.Pattern
import app.pochical.calendar.PatternKeys
import app.pochical.calendar.TrayAction
import app.pochical.calendar.TrayActionsRow
import app.pochical.calendar.holidayName
import app.pochical.calendar.monthWeeks
import app.pochical.calendar.pageCount
import app.pochical.calendar.weekdayColor
import app.pochical.calendar.weekdayLetter
import app.pochical.calendar.yearMonthText
import app.pochical.design.Metrics
import app.pochical.design.PochicalTextStyles
import app.pochical.design.Springs
import app.pochical.kit.repeatSchedule
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.launch

/** The days an order being typed covers. */
sealed interface OrderCover {
  /** From its 1st day, as a new order starts. */
  data object Anchor : OrderCover

  /** From a day of its own: an order corrected keeps its start, and a new job's starts on its first day. */
  data class From(val day: LocalDate) : OrderCover
}

/** How far the months reach either side of the order's 1st day. */
private const val MONTHS_AROUND = 24

private val DAY_GAP = Metrics.spacingStep

/**
 * A repeating order typed on a month, as ポチポチ入力 enters days (/design's RepeatCalendar;
 * spec/shift-patterns.md, Typing an order): the days typed solid, the order coming round faintly after
 * them and back to its start as the calendar will show it, and the days before the start as they show
 * now, faded. The month is swiped a month at a time with room for six weeks, so the keys at the foot
 * stay put; 1日目へ brings back the month of the order's 1st day while it is out of sight.
 */
@Composable
fun RepeatCalendar(
  typing: OrderTyping,
  onTyping: (OrderTyping) -> Unit,
  cover: OrderCover,
  patterns: List<Pattern>,
  modifier: Modifier = Modifier,
  before: OwnCalendar? = null,
  until: LocalDate? = null,
  holidayShift: String? = null,
  holidayCountry: String,
) {
  val week = LocalDeviceSettings.current.device.week
  // The marks of the patterns being typed, and of those the days before show.
  val byId = remember(patterns, before) { before?.patterns.orEmpty().associateBy { it.id } + patterns.associateBy { it.id } }
  val haptics = LocalHapticFeedback.current
  val origin = remember { YearMonth.from(typing.anchor) }
  val pages = rememberPagerState(initialPage = MONTHS_AROUND) { MONTHS_AROUND * 2 + 1 }
  val keyPages = rememberPagerState { pageCount(patterns.size) }
  val scope = rememberCoroutineScope()
  fun monthAt(page: Int): YearMonth = origin.plusMonths((page - MONTHS_AROUND).toLong())
  fun pageOf(month: YearMonth): Int = (ChronoUnit.MONTHS.between(origin, month).toInt() + MONTHS_AROUND).coerceIn(0, MONTHS_AROUND * 2)
  val shown = monthAt(pages.currentPage)
  val firstMonth = YearMonth.from(typing.anchor)

  // The frame's day comes into sight when a key or 翌日へ moves it past the month shown.
  LaunchedEffect(typing.cursorDay) {
    val month = monthAt(pages.settledPage)
    if (monthWeeks(month, week.start).none { typing.cursorDay in it }) pages.animateScrollToPage(pageOf(YearMonth.from(typing.cursorDay)), animationSpec = Springs.standard())
  }

  fun type(change: OrderTyping) {
    haptics.performHapticFeedback(HapticFeedbackType.VirtualKey)
    onTyping(change)
  }

  Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Row(Modifier.fillMaxWidth().heightIn(min = Metrics.touch), verticalAlignment = Alignment.CenterVertically) {
      Text(shown.yearMonthText, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
      if (shown != firstMonth) {
        val label = stringResource(R.string.repeat_first_day_label)
        OutlinedButton(
          onClick = { scope.launch { pages.animateScrollToPage(pageOf(firstMonth), animationSpec = Springs.standard()) } },
          modifier = Modifier.semantics { contentDescription = label },
        ) {
          Text(stringResource(R.string.repeat_first_day))
        }
      }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(DAY_GAP)) {
      repeat(7) { index ->
        val weekday = (week.start + index) % 7
        Text(
          weekdayLetter(weekday),
          Modifier.weight(1f),
          style = PochicalTextStyles.caption2,
          color = weekdayColor(weekday, holiday = false, week, plain = LocalThemeColors.current.textTertiary),
          textAlign = TextAlign.Center,
        )
      }
    }
    BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
      val cell = ((maxHeight - DAY_GAP * 5) / 6).coerceIn(Metrics.touch, DAY_FULL_HEIGHT)
      HorizontalPager(pages, Modifier.fillMaxSize(), verticalAlignment = Alignment.Top) { page ->
        MonthOfOrder(monthAt(page), typing, cover, byId, before, until, holidayShift, holidayCountry, cell) { type(typing.pressed(it)) }
      }
    }
    PatternKeys(patterns, keyPages) { type(typing.pick(it.id)) }
    TrayActionsRow(
      keyPages,
      leading = {
        TrayAction(stringResource(R.string.clear), R.drawable.ic_delete, enabled = typing.onTyped) { type(typing.cleared()) }
      },
      trailing = {
        TrayAction(stringResource(R.string.entering_skip), R.drawable.ic_arrow_forward, enabled = typing.onTyped, trailingIcon = true) {
          type(typing.movedOn())
        }
      },
    )
    Spacer(Modifier.padding(bottom = 4.dp))
  }
}

/**
 * A month of the order: its weeks, a row each, room kept for six. The order covers the days from its
 * start until the next period's, [until]; there, and on the days the person entered, which stay over
 * any order, the days show what they hold now.
 */
@Composable
private fun MonthOfOrder(
  month: YearMonth,
  typing: OrderTyping,
  cover: OrderCover,
  patterns: Map<String, Pattern>,
  before: OwnCalendar?,
  until: LocalDate?,
  holidayShift: String?,
  holidayCountry: String,
  cell: Dp,
  onPress: (LocalDate) -> Unit,
) {
  val week = LocalDeviceSettings.current.device.week
  val weeks = remember(month, week.start) { monthWeeks(month, week.start) }
  val first = weeks.first().first()
  val last = weeks.last().last()
  val start = when (cover) {
    OrderCover.Anchor -> typing.anchor
    is OrderCover.From -> cover.day
  }
  val planned =
    remember(typing.sequence, typing.anchor, start, first, holidayShift) {
      repeatSchedule(typing.sequence, typing.anchor, maxOf(start, first), last, holidayShift, holidayCountry)
    }
  val kept = remember(before, first) { before?.shown(first, last).orEmpty() }
  val today = LocalDate.now()
  Column(verticalArrangement = Arrangement.spacedBy(DAY_GAP)) {
    for (days in weeks) {
      Row(horizontalArrangement = Arrangement.spacedBy(DAY_GAP)) {
        for (day in days) {
          val index = ChronoUnit.DAYS.between(typing.anchor, day)
          val typed = index in 0 until typing.sequence.size
          val inOrder = day >= start && (until == null || day < until)
          val comesRound = inOrder && !typed && before?.hasOwnShift(day) != true
          val shift = if (typed) typing.sequence[index.toInt()] else if (comesRound) planned[day] else kept[day]?.shift
          val entry = if (typed || comesRound) shift?.let { DayEntry(it) } else kept[day]
          DayCell(
            DayLook(
              day = day,
              entry = entry,
              pattern = shift?.let(patterns::get),
              note = null,
              holiday = day.holidayName(holidayCountry),
              outside = YearMonth.from(day) != month || !inOrder,
              isToday = day == today,
              isSelected = index == typing.cursor.toLong(),
              framesToday = false,
              faint = comesRound,
              // The order is what is being looked at, so a day off left blank shows faint.
              offShown = OffShown.Faint,
            ),
            height = cell,
            colorsHoliday = week.holiday,
            onClick = { onPress(day) },
            modifier = Modifier.weight(1f),
          )
        }
      }
    }
  }
}
