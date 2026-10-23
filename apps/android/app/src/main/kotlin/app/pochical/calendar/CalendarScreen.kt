package app.pochical.calendar

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.Week
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import kotlin.math.abs
import kotlinx.coroutines.launch

/** How far the pages reach either side of the month the screen opened on. Only the pages in view are drawn. */
private const val MONTHS_AROUND = 120

/** Between a page's weeks, and between a week's days. */
private val DAY_GAP = 4.dp

/** The shortest a day gets on a short screen, keeping its date and mark clear. */
private val LEAST_DAY_HEIGHT = 44.dp

private val SCREEN_EDGE = 16.dp

/** カレンダー: the person's month, a page a month, turned by swiping (spec/calendar.md, The month). */
@Composable
fun CalendarScreen() {
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  val week = LocalDeviceSettings.current.device.week
  val today = rememberToday()
  val country = remember { holidayCountry() }
  val reduceMotion = rememberReducedMotion()
  // The pages count from the month the screen opened on, so they stay put
  // when today moves into another month.
  val firstMonth = rememberSaveable { YearMonth.from(today).minusMonths(MONTHS_AROUND.toLong()).toString() }
  // Every month the pages hold, which 月を選ぶ offers too.
  val months = YearMonth.parse(firstMonth).let { it..it.plusMonths(2L * MONTHS_AROUND) }
  val monthAt = { page: Int -> months.start.plusMonths(page.toLong()) }
  val pageOf = { month: YearMonth -> ChronoUnit.MONTHS.between(months.start, month).toInt() }
  val pager = rememberPagerState(initialPage = MONTHS_AROUND) { pageOf(months.endInclusive) + 1 }
  val scope = rememberCoroutineScope()
  val thisMonthPage = pageOf(YearMonth.from(today))
  val turnTo = { month: YearMonth ->
    scope.launch { if (reduceMotion) pager.scrollToPage(pageOf(month)) else pager.animateScrollToPage(pageOf(month)) }
  }
  Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))) {
    Heading(pager, months, monthAt, thisMonthPage, reduceMotion, onPick = { turnTo(it) }, onThisMonth = { turnTo(YearMonth.from(today)) })
    WeekdayRow(week, Modifier.padding(horizontal = SCREEN_EDGE))
    BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
      val cell = dayHeight(fitting = maxHeight - DAY_GAP)
      // The pages run to the screen's edges, so a month slides out of
      // sight rather than being cut off inside them.
      HorizontalPager(pager, Modifier.fillMaxWidth(), beyondViewportPageCount = 1, verticalAlignment = Alignment.Top) { page ->
        MonthPage(
          monthAt(page),
          week,
          calendar,
          today,
          country,
          cell,
          Modifier.padding(horizontal = SCREEN_EDGE),
        )
      }
    }
  }
}

/**
 * The month's name, which opens 月を選ぶ, and 今月, which fades in as the
 * pages leave this month and out as they come back.
 */
@Composable
private fun Heading(
  pager: PagerState,
  months: ClosedRange<YearMonth>,
  monthAt: (Int) -> YearMonth,
  thisMonthPage: Int,
  reduceMotion: Boolean,
  onPick: (YearMonth) -> Unit,
  onThisMonth: () -> Unit,
) {
  val pages = pager.currentPage + pager.currentPageOffsetFraction
  var picking by remember { mutableStateOf(false) }
  Row(
    Modifier.fillMaxWidth().padding(start = SCREEN_EDGE + 8.dp, end = SCREEN_EDGE, top = 8.dp, bottom = 12.dp),
    verticalAlignment = Alignment.Bottom,
  ) {
    val pickLabel = stringResource(R.string.calendar_pick_month)
    MonthName(
      pages,
      monthAt,
      reduceMotion,
      Modifier.clickable(onClickLabel = pickLabel, role = Role.Button) { picking = true },
    )
    Spacer(Modifier.weight(1f))
    val away = abs(pages - thisMonthPage).coerceAtMost(1f)
    if (away > 0f) {
      val colors = LocalThemeColors.current
      OutlinedButton(
        onClick = onThisMonth,
        modifier = Modifier.alpha(away),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = colors.textPrimary),
      ) {
        Text(stringResource(R.string.calendar_this_month))
      }
    }
  }
  if (picking) {
    MonthPicker(monthAt(pager.currentPage), months, onPick = onPick, onDismiss = { picking = false })
  }
}

/**
 * 月を選ぶ: Material's date picker in a dialog, turned to the month shown,
 * as Android has no picker of months alone, offering the pages' `months`.
 * A day picked turns the pages to its month; 表示 turns them to the month
 * the picker shows, or the nearest the pages hold.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MonthPicker(
  month: YearMonth,
  months: ClosedRange<YearMonth>,
  onPick: (YearMonth) -> Unit,
  onDismiss: () -> Unit,
) {
  val state =
    rememberDatePickerState(
      initialDisplayedMonthMillis = month.atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
      yearRange = months.start.year..months.endInclusive.year,
      selectableDates =
        object : SelectableDates {
          override fun isSelectableDate(utcTimeMillis: Long) =
            YearMonth.from(Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC)) in months
        },
    )
  // A day picked turns to its month at once, as nothing more is asked of it.
  LaunchedEffect(state.selectedDateMillis) {
    val picked = state.selectedDateMillis ?: return@LaunchedEffect
    onPick(YearMonth.from(Instant.ofEpochMilli(picked).atZone(ZoneOffset.UTC)))
    onDismiss()
  }
  DatePickerDialog(
    onDismissRequest = onDismiss,
    confirmButton = {
      TextButton(
        onClick = {
          onPick(YearMonth.from(Instant.ofEpochMilli(state.displayedMonthMillis).atZone(ZoneOffset.UTC)).coerceIn(months))
          onDismiss()
        }
      ) {
        Text(stringResource(R.string.calendar_show_month))
      }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
  ) {
    DatePicker(state, title = null, headline = null, showModeToggle = false)
  }
}

/** The weekday names over the pages, from the week's start, Sundays and Saturdays in their colors unless turned off. */
@Composable
private fun WeekdayRow(week: Week, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val names = stringResource(R.string.calendar_weekday_letters)
  Row(modifier.padding(bottom = 12.dp).clearAndSetSemantics {}, horizontalArrangement = Arrangement.spacedBy(DAY_GAP)) {
    repeat(7) { index ->
      val weekday = (week.start + index) % 7
      Text(
        names[weekday].toString(),
        Modifier.weight(1f),
        fontSize = 11.sp,
        color =
          when {
            weekday == 0 && week.sunday -> colors.calendarHoliday
            weekday == 6 && week.saturday -> colors.calendarSaturday
            else -> colors.textTertiary
          },
        textAlign = TextAlign.Center,
      )
    }
  }
}

/** A month's page: its weeks, a row each, with room kept for six, so what is under it stays put as the months turn. */
@Composable
private fun MonthPage(
  month: YearMonth,
  week: Week,
  calendar: OwnCalendar,
  today: LocalDate,
  country: String,
  cell: Dp,
  modifier: Modifier = Modifier,
) {
  val weeks = remember(month, week.start) { monthWeeks(month, week.start) }
  val shown = remember(calendar, weeks) { calendar.shown(weeks.first().first(), weeks.last().last()) }
  val patterns = remember(calendar) { calendar.patterns.associateBy { it.id } }
  Column(modifier.height(cell * 6 + DAY_GAP * 5), verticalArrangement = Arrangement.spacedBy(DAY_GAP)) {
    for (days in weeks) {
      Row(horizontalArrangement = Arrangement.spacedBy(DAY_GAP)) {
        for (day in days) {
          val entry = shown[day]
          DayCell(
            DayLook(
              day = day,
              entry = entry,
              pattern = entry?.let { patterns[it.shift] },
              note = calendar.note(day),
              holiday = day.holidayName(country),
              outside = YearMonth.from(day) != month,
              isToday = day == today,
            ),
            height = cell,
            colorsHoliday = week.holiday,
            modifier = Modifier.weight(1f),
          )
        }
      }
    }
  }
}

/** How tall a day is for six weeks to fit in `room`: its full height where there is room, else less. */
private fun dayHeight(fitting: Dp): Dp = ((fitting - DAY_GAP * 5) / 6).coerceIn(LEAST_DAY_HEIGHT, DAY_FULL_HEIGHT)

/** Today, moving on at midnight while the screen is open, as the system says the date changed. */
@Composable
private fun rememberToday(): LocalDate {
  val context = LocalContext.current
  var today by remember { mutableStateOf(LocalDate.now()) }
  DisposableEffect(context) {
    val receiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          today = LocalDate.now()
        }
      }
    val changes =
      IntentFilter().apply {
        addAction(Intent.ACTION_DATE_CHANGED)
        addAction(Intent.ACTION_TIME_CHANGED)
        addAction(Intent.ACTION_TIMEZONE_CHANGED)
      }
    ContextCompat.registerReceiver(context, receiver, changes, ContextCompat.RECEIVER_NOT_EXPORTED)
    onDispose { context.unregisterReceiver(receiver) }
  }
  return today
}

/**
 * Whether the person turned animations off (Android's 「アニメーションを削除」),
 * which Compose does not say itself; followed while the screen is open, as
 * it may change while the app is in the background.
 */
@Composable
internal fun rememberReducedMotion(): Boolean {
  val resolver = LocalContext.current.contentResolver
  fun read() = Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
  var reduced by remember(resolver) { mutableStateOf(read()) }
  DisposableEffect(resolver) {
    val observer =
      object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) {
          reduced = read()
        }
      }
    resolver.registerContentObserver(Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false, observer)
    onDispose { resolver.unregisterContentObserver(observer) }
  }
  return reduced
}
