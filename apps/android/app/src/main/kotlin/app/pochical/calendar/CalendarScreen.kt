package app.pochical.calendar

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerDefaults
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.painterResource
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
import app.pochical.RootPage
import app.pochical.design.Metrics
import app.pochical.design.PochicalTextStyles
import app.pochical.design.Springs
import app.pochical.kit.Week
import app.pochical.kit.firstBlankDay
import app.pochical.kit.gapDays
import app.pochical.kit.selectedAfterEntering
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** How far the pages reach either side of the month the screen opened on. Only the pages in view are drawn. */
private const val MONTHS_AROUND = 120

/** How far a pull let go must have unfolded the month for it to unfold. */
private const val UNFOLD_SHARE = 1f / 3

/** A pull let go faster than this, a second, goes the way it was flicked, as iOS's 400 points. */
private val UNFOLD_FLICK = 400.dp

/** Between a page's weeks, and between a week's days. */
private val DAY_GAP = Metrics.spacingStep

/** The shortest a day gets on a short screen, keeping its date and mark clear. */
private val LEAST_DAY_HEIGHT = Metrics.touch

private val SCREEN_EDGE = 16.dp

/**
 * カレンダー: the person's month, a page a month, turned by swiping, a
 * day opened from it under its week, and ポチポチ入力 under the month
 * (spec/calendar.md, The month, A day's detail and ポチポチ入力).
 * `hidesTabBar` says when a day or the tray takes the tab bar's place.
 */
@Composable
fun CalendarScreen(open: (RootPage) -> Unit, hidesTabBar: (Boolean) -> Unit) {
  val days = LocalOwnDays.current
  val calendar by days.calendar.collectAsStateWithLifecycle()
  val week = LocalDeviceSettings.current.device.week
  val today = rememberToday()
  val country = remember { holidayCountry() }
  val reduceMotion = rememberReducedMotion()
  val resources = LocalResources.current
  // The pages count from the month the screen opened on, so they stay put
  // when today moves into another month.
  val openedMonth = rememberSaveable { YearMonth.from(today).toString() }
  val range = remember(openedMonth) { CalendarRange(YearMonth.parse(openedMonth), MONTHS_AROUND) }
  val pager = rememberPagerState(initialPage = range.pageOf(YearMonth.parse(openedMonth))) { range.monthPages }
  val scope = rememberCoroutineScope()
  val turnTo = { month: YearMonth ->
    scope.launch {
      if (reduceMotion) {
        pager.scrollToPage(range.pageOf(month))
      } else {
        pager.animateScrollToPage(range.pageOf(month), animationSpec = Springs.standard())
      }
    }
  }

  // The day opened, and the month its week folds out of: the one shown
  // while the week is one of its rows, a faded day's too, else the day's own.
  var openedKey by rememberSaveable { mutableStateOf<String?>(null) }
  var foldedKey by rememberSaveable { mutableStateOf<String?>(null) }
  val opened = openedKey?.let(LocalDate::parse)
  val folded = foldedKey?.let(YearMonth::parse) ?: range.monthAt(pager.currentPage)
  // 一緒に働く人 stays unfolded as another day opens, for noting people day after day.
  var peopleOpen by rememberSaveable { mutableStateOf(false) }
  // How far the month is folded into the opened day's week, 0 to 1.
  val fold = remember { Animatable(if (opened != null) 1f else 0f) }
  // How much of the fold a finger pulling the week down has taken back, until it lets go.
  var pulled by remember { mutableFloatStateOf(0f) }
  val folding = (fold.value - pulled).coerceIn(0f, 1f)
  var closing by remember { mutableStateOf(false) }
  // The day ポチポチ入力 enters next, while entering, and what its last key did, for a screen reader.
  var enteringKey by rememberSaveable { mutableStateOf<String?>(null) }
  val entering = enteringKey?.let(LocalDate::parse)
  var said by remember { mutableStateOf<String?>(null) }
  // The blank days 完了 asks about, and the pattern picked to fill them.
  var gapKeys by rememberSaveable { mutableStateOf("") }
  val gaps = remember(gapKeys) { gapKeys.split(",").filter { it.isNotEmpty() }.map(LocalDate::parse) }
  var gapPick by rememberSaveable { mutableStateOf<String?>(null) }
  val offPatterns = calendar.patterns.daysOff()
  val gapFill = offPatterns.find { it.id == gapPick } ?: offPatterns.firstOrNull()
  // 今月の内訳's month while it is open, and the days off of the months a swipe can bring in,
  // counted as the days or the month change rather than as a finger moves the pages.
  var breakingDown by rememberSaveable { mutableStateOf<String?>(null) }
  val offCounts =
    remember(calendar, pager.settledPage) {
      (-2..2).map { range.monthAt(pager.settledPage + it) }.associateWith { calendar.daysOffCount(it) }
    }
  val hidesBar by rememberUpdatedState(hidesTabBar)
  val showsDay = opened != null && !closing
  LaunchedEffect(showsDay || entering != null) { hidesBar(showsDay || entering != null) }

  fun monthShowing(day: LocalDate, month: YearMonth): YearMonth =
    if (monthWeeks(month, week.start).any { day in it }) month else YearMonth.from(day)

  // Only a day the pages show opens, so no week is asked for past them.
  val reachable = range.days(week.start)
  fun openDay(day: LocalDate) {
    if (day !in reachable) return
    foldedKey = monthShowing(day, folded).toString()
    openedKey = day.toString()
    scope.launch { if (reduceMotion) fold.snapTo(1f) else fold.animateTo(1f, Springs.standard()) }
  }

  /** Entering starts on the month's first blank day, the 1st when none is blank. */
  fun firstBlank(month: YearMonth): LocalDate {
    val shown = calendar.shown(month.atDay(1), month.atEndOfMonth())
    return firstBlankDay(month.atDay(1), month.atEndOfMonth(), shown::containsKey)
  }

  // A day tapped while entering is entered next, turning to its month when it is one around.
  fun selectDay(day: LocalDate) {
    if (enteringKey == null) return openDay(day)
    if (day !in reachable) return
    enteringKey = day.toString()
    said = null
    if (YearMonth.from(day) != range.monthAt(pager.currentPage)) turnTo(YearMonth.from(day))
  }

  /** Says what a key did on [day] and where entering goes on, as /design's live region does. */
  fun say(done: String, day: LocalDate, next: LocalDate) {
    val after =
      if (next == day) {
        resources.getString(R.string.entering_month_end)
      } else {
        resources.getString(R.string.entering_selecting, if (next.month == day.month) next.dayText else next.monthDayText)
      }
    said = resources.getString(R.string.entering_said, day.monthDayText, done, after)
  }

  // 完了, or a back: entering ends, then the month's blank days before its last entered one are
  // asked about, when a pattern that counts as off could fill them.
  fun finish() {
    val day = enteringKey?.let(LocalDate::parse) ?: return
    enteringKey = null
    said = null
    if (calendar.patterns.daysOff().isEmpty()) return
    val month = YearMonth.from(day)
    scope.launch {
      val shown = days.shownOnceWritten(month.atDay(1), month.atEndOfMonth())
      gapKeys = gapDays(month.atDay(1), month.atEndOfMonth(), shown::contains).joinToString(",")
    }
  }
  BackHandler(enabled = entering != null, onBack = ::finish)

  // A month swiped to while entering starts on its first blank day.
  LaunchedEffect(pager.settledPage, entering != null) {
    val month = range.monthAt(pager.settledPage)
    if (entering != null && YearMonth.from(entering) != month) {
      enteringKey = firstBlank(month).toString()
      said = null
    }
  }

  suspend fun unfold() {
    closing = true
    try {
      // The pages wait on the month the week folds back into.
      pager.requestScrollToPage(range.pageOf(folded))
      if (reduceMotion) fold.snapTo(0f) else fold.animateTo(0f, Springs.standard())
      openedKey = null
      foldedKey = null
    } finally {
      // Taken over by a day opened as it unfolds, that day stays open.
      closing = false
    }
  }

  // A back, predictive or not, unfolds the month, following the finger as it goes.
  PredictiveBackHandler(enabled = opened != null && !closing) { progress ->
    try {
      progress.collect { fold.snapTo(1f - it.progress) }
      // In the screen's scope: unfolding disables this handler, which would cancel what it runs.
      scope.launch { unfold() }
    } catch (e: CancellationException) {
      // The back taken back folds the week again, though its own job is done.
      withContext(NonCancellable) { fold.animateTo(1f, Springs.standard()) }
      throw e
    }
  }

  Column(
    Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))
  ) {
    Heading(
      pages = if (opened != null) range.pageOf(folded).toFloat() else pager.currentPage + pager.currentPageOffsetFraction,
      range = range,
      todayPage = range.pageOf(YearMonth.from(today)),
      reduceMotion = reduceMotion,
      dayOpen = opened != null,
      entering = entering != null,
      thisWeekAway = opened != null && opened.weekStartingOn(week.start) != today.weekStartingOn(week.start),
      onPick = { turnTo(it) },
      onThisMonth = { turnTo(YearMonth.from(today)) },
      onThisWeek = { openDay(today) },
      onDone = ::finish,
    )
    WeekdayRow(week, Modifier.padding(horizontal = SCREEN_EDGE))
    BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
      val cell = dayHeight(fitting = maxHeight - DAY_GAP)
      val monthHeight = cell * 6 + DAY_GAP * 5
      Column {
        val select by rememberUpdatedState(::selectDay)
        // While 完了 asks, the blank days show faint as the pattern picked would fill them.
        val preview = if (gapFill != null) gaps.associateWith { gapFill } else emptyMap()
        val pageDays =
          remember(calendar, week, today, country, cell, opened, entering, preview) {
            PageDays(
              calendar,
              week,
              today,
              country,
              cell,
              selected = entering ?: opened,
              isEntering = entering != null,
              preview = preview,
              onSelect = { select(it) },
            )
          }
        // Pulling the week down unfolds the month, following the finger: let
        // go past a third of the way, or flicked down, it unfolds, else it
        // folds back. A pull never presses the day it starts on.
        val unfoldPx = with(LocalDensity.current) { (monthHeight - cell).toPx() }
        val flickPx = with(LocalDensity.current) { UNFOLD_FLICK.toPx() }
        val pull = rememberDraggableState { down -> pulled = (pulled + down / unfoldPx).coerceIn(0f, fold.value) }
        Box(
          Modifier.fillMaxWidth()
            .height(cell + (monthHeight - cell) * (1 - folding))
            .clipToBounds()
            .draggable(
              pull,
              Orientation.Vertical,
              enabled = opened != null && !closing,
              onDragStopped = { speed ->
                // In the screen's scope: unfolding disables this drag, which
                // would cancel what it runs.
                scope.launch {
                  fold.snapTo((fold.value - pulled).coerceIn(0f, 1f))
                  pulled = 0f
                  val unfolds = if (abs(speed) > flickPx) speed > 0 else fold.value < 1 - UNFOLD_SHARE
                  if (unfolds) unfold() else fold.animateTo(1f, Springs.standard())
                }
              },
            )
        ) {
          when {
            opened == null && folding == 0f ->
              // The pages run to the screen's edges, so a month slides out
              // of sight rather than being cut off inside them.
              HorizontalPager(
                pager,
                Modifier.fillMaxWidth(),
                beyondViewportPageCount = 1,
                verticalAlignment = Alignment.Top,
                flingBehavior = PagerDefaults.flingBehavior(pager, snapAnimationSpec = Springs.standard()),
              ) { page ->
                MonthPage(range.monthAt(page), pageDays, Modifier.padding(horizontal = SCREEN_EDGE))
              }
            opened != null && folding == 1f && !closing ->
              WeekPager(opened, range, week.start, pageDays) { day ->
                foldedKey = monthShowing(day, folded).toString()
                openedKey = day.toString()
              }
            else ->
              MonthPage(folded, pageDays, Modifier.padding(horizontal = SCREEN_EDGE), foldedInto = opened, fold = folding)
          }
        }
        if (opened != null && !closing) {
          DayDetail(
            day = opened,
            calendar = calendar,
            days = days,
            peopleOpen = peopleOpen,
            onPeopleOpenChange = { peopleOpen = it },
            onStep = { step -> openDay(opened.plusDays(step.toLong())) },
            canStep = { step -> opened.plusDays(step.toLong()) in reachable },
            onClose = { scope.launch { unfold() } },
            onPickShift = { open(RootPage.ShiftChoice(opened.toString())) },
            modifier = Modifier.weight(1f).padding(top = 8.dp).graphicsLayer { alpha = folding },
          )
        }
      }
    }
    if (opened == null) {
      // ポチポチ入力 and its tray trade places in a fade; the tray fading out keeps its last day.
      val trayDay = remember { mutableStateOf<LocalDate?>(null) }.apply { if (entering != null) value = entering }.value
      Crossfade(entering != null, Modifier.padding(horizontal = SCREEN_EDGE).padding(top = 12.dp, bottom = 12.dp), label = "entering") { on ->
        val day = trayDay
        if (!on || day == null) {
          Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            MonthSummary(
              pages = { pager.currentPage + pager.currentPageOffsetFraction },
              monthAt = range::monthAt,
              thisMonth = YearMonth.from(today),
              reduceMotion = reduceMotion,
              daysOff = { month -> offCounts[month] ?: calendar.daysOffCount(month) },
              // The row fading out as entering starts opens nothing.
              onOpen = { if (enteringKey == null) breakingDown = it.toString() },
            )
            Button(
              onClick = {
                // The month the pages settle on, as a swipe while entering starts there too.
                val month = range.monthAt(pager.settledPage)
                said = null
                enteringKey = firstBlank(month).toString()
              },
              modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.control),
            ) {
              Icon(painterResource(R.drawable.ic_edit), null, Modifier.size(20.dp))
              Spacer(Modifier.width(8.dp))
              Text(stringResource(R.string.entering), style = PochicalTextStyles.headline)
            }
          }
        } else {
          val last = YearMonth.from(day).atEndOfMonth()
          EntryTray(
            day = day,
            week = week,
            country = country,
            patterns = calendar.patterns.filterNot { it.archived },
            canClear = calendar.shown(day, day).containsKey(day),
            canSkip = day != last,
            said = said,
            onEnter = { shift ->
              // A key of the tray fading out after 完了 enters nothing.
              if (enteringKey != day.toString()) return@EntryTray
              days.enter(day, shift)
              val next = selectedAfterEntering(shift, day, last, calendar::nextDay)
              enteringKey = next.toString()
              val pattern = shift?.let { id -> calendar.patterns.find { it.id == id } }
              val following = shift?.let(calendar::nextDay)?.let { id -> calendar.patterns.find { it.id == id } }
              say(
                when {
                  pattern == null -> resources.getString(R.string.entering_cleared)
                  following != null -> resources.getString(R.string.entering_entered_next, pattern.name, following.name)
                  else -> resources.getString(R.string.entering_entered, pattern.name)
                },
                day,
                next,
              )
            },
            onSkip = {
              if (enteringKey != day.toString()) return@EntryTray
              val next = minOf(day.plusDays(1), last)
              enteringKey = next.toString()
              say(resources.getString(R.string.entering_skipped), day, next)
            },
            modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)),
          )
        }
      }
    }
  }
  breakingDown?.let { month ->
    MonthBreakdownSheet(remember(calendar, month) { calendar.breakdown(YearMonth.parse(month)) }, onDismiss = { breakingDown = null })
  }
  if (gaps.isNotEmpty() && gapFill != null) {
    GapSheet(
      days = gaps,
      offPatterns = offPatterns,
      picked = gapFill,
      onPick = { gapPick = it.id },
      onFill = { days.fill(gaps, it.id) },
      onDismiss = {
        gapKeys = ""
        gapPick = null
      },
    )
  }
}

/**
 * The month's name, which opens 月を選ぶ, and 今月, which fades in as the
 * pages leave this month and out as they come back. With a day open, the
 * name stays put and 今週 shows while another week is open; while entering,
 * 完了 alone, filled with the accent, ends it.
 */
@Composable
private fun Heading(
  pages: Float,
  range: CalendarRange,
  todayPage: Int,
  reduceMotion: Boolean,
  dayOpen: Boolean,
  entering: Boolean,
  thisWeekAway: Boolean,
  onPick: (YearMonth) -> Unit,
  onThisMonth: () -> Unit,
  onThisWeek: () -> Unit,
  onDone: () -> Unit,
) {
  var picking by remember { mutableStateOf(false) }
  val colors = LocalThemeColors.current
  Row(
    Modifier.fillMaxWidth().padding(start = SCREEN_EDGE + 8.dp, end = SCREEN_EDGE, top = 8.dp, bottom = 12.dp),
    verticalAlignment = Alignment.Bottom,
  ) {
    val pickLabel = stringResource(R.string.calendar_pick_month)
    MonthName(
      pages,
      range::monthAt,
      reduceMotion,
      // Only the month on its own opens 月を選ぶ; entering and a day's week keep to the days around.
      if (dayOpen || entering) Modifier else Modifier.clickable(onClickLabel = pickLabel, role = Role.Button) { picking = true },
    )
    Spacer(Modifier.weight(1f))
    val away = if (dayOpen) (if (thisWeekAway) 1f else 0f) else abs(pages - todayPage).coerceAtMost(1f)
    if (entering) {
      Button(onClick = onDone) {
        Icon(painterResource(R.drawable.ic_check), null, Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(stringResource(R.string.entering_done))
      }
    } else if (away > 0f) {
      OutlinedButton(
        onClick = if (dayOpen) onThisWeek else onThisMonth,
        modifier = Modifier.alpha(away),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = colors.textPrimary),
      ) {
        Text(stringResource(if (dayOpen) R.string.calendar_this_week else R.string.calendar_this_month))
      }
    }
  }
  if (picking) {
    MonthPicker(range.monthAt(pages.roundToInt()), range.months, onPick = onPick, onDismiss = { picking = false })
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

/**
 * A weekday's color as the person's カレンダー settings have it: Sundays and holidays in Sunday's
 * red, Saturdays in their blue, each unless turned off, else [plain].
 */
@Composable
fun weekdayColor(weekday: Int, holiday: Boolean, week: Week, plain: Color): Color {
  val colors = LocalThemeColors.current
  return when {
    (holiday && week.holiday) || (weekday == 0 && week.sunday) -> colors.calendarHoliday
    weekday == 6 && week.saturday -> colors.calendarSaturday
    else -> plain
  }
}

/** The patterns that count as off and are in use: what 完了's blank days are filled with. */
private fun List<Pattern>.daysOff(): List<Pattern> = filter { it.countsAsOff && !it.archived }

/** The weekday names over the pages, from the week's start, Sundays and Saturdays in their colors unless turned off. */
@Composable
private fun WeekdayRow(week: Week, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  Row(modifier.padding(bottom = 12.dp).clearAndSetSemantics {}, horizontalArrangement = Arrangement.spacedBy(DAY_GAP)) {
    repeat(7) { index ->
      val weekday = (week.start + index) % 7
      Text(
        weekdayLetter(weekday),
        Modifier.weight(1f),
        style = PochicalTextStyles.caption2,
        color = weekdayColor(weekday, holiday = false, week, plain = colors.textTertiary),
        textAlign = TextAlign.Center,
      )
    }
  }
}

/** What every page's days are drawn with. */
private class PageDays(
  val calendar: OwnCalendar,
  val week: Week,
  val today: LocalDate,
  val country: String,
  val cell: Dp,
  /** The day opened, or the day being entered, framed. */
  val selected: LocalDate?,
  /** ポチポチ入力 is on: today's frame gives way to the day being entered. */
  val isEntering: Boolean,
  /** Blank days drawn faint with the pattern 完了's question would fill them with. */
  val preview: Map<LocalDate, Pattern>,
  val onSelect: (LocalDate) -> Unit,
) {
  private val patterns = calendar.patterns.associateBy { it.id }

  /** A week's row, its days of other months faded when `month` is given. */
  @Composable
  fun Week(
    days: List<LocalDate>,
    shown: Map<LocalDate, DayEntry>,
    fadingOutside: YearMonth?,
    modifier: Modifier = Modifier,
    selectable: Boolean = true,
  ) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(DAY_GAP)) {
      for (day in days) {
        val entry = shown[day]
        DayCell(
          DayLook(
            day = day,
            entry = entry,
            pattern = entry?.let { patterns[it.shift] },
            note = calendar.note(day),
            holiday = day.holidayName(country),
            outside = fadingOutside != null && YearMonth.from(day) != fadingOutside,
            isToday = day == today,
            isSelected = day == selected,
            framesToday = !isEntering,
            preview = preview[day].takeIf { entry == null },
          ),
          height = cell,
          colorsHoliday = week.holiday,
          onClick = { onSelect(day) },
          enabled = selectable,
          modifier = Modifier.weight(1f),
        )
      }
    }
  }
}

/**
 * A month's page: its weeks, a row each, with room kept for six, so what is
 * under it stays put as the months turn. A day opened folds the page into
 * its week, as the Calendar apps do and /design's: the weeks move up to bring
 * that week to the top while the others fade, all following `fold`, so a
 * predictive back moves it as the animations do.
 */
@Composable
private fun MonthPage(
  month: YearMonth,
  days: PageDays,
  modifier: Modifier = Modifier,
  foldedInto: LocalDate? = null,
  fold: Float = 0f,
) {
  val weeks = remember(month, days.week.start) { monthWeeks(month, days.week.start) }
  val shown = remember(days.calendar, weeks) { days.calendar.shown(weeks.first().first(), weeks.last().last()) }
  val row = foldedInto?.let { day -> weeks.indexOfFirst { day in it } }?.takeIf { it >= 0 } ?: 0
  Column(
    modifier
      .wrapContentHeight(Alignment.Top, unbounded = true)
      .height(days.cell * 6 + DAY_GAP * 5)
      .graphicsLayer { translationY = -row * (days.cell + DAY_GAP).toPx() * fold },
    verticalArrangement = Arrangement.spacedBy(DAY_GAP),
  ) {
    weeks.forEachIndexed { index, week ->
      // Folded away, the rest of the month is out of reach.
      val away = foldedInto != null && index != row
      days.Week(
        week,
        shown,
        fadingOutside = if (foldedInto == null) month else null,
        Modifier.graphicsLayer { alpha = if (away) 1 - fold else 1f }.then(if (away) Modifier.clearAndSetSemantics {} else Modifier),
        selectable = !away,
      )
    }
  }
}

/**
 * The weeks around an opened day, a page each, swiped as the months are:
 * once a swipe settles, the same weekday opens there; a day opened in another
 * week slides the pages to it.
 */
@Composable
private fun WeekPager(opened: LocalDate, range: CalendarRange, weekStart: Int, days: PageDays, onOpen: (LocalDate) -> Unit) {
  val weekAt = { page: Int -> range.weekAt(page, weekStart) }
  val openedPage = range.weekPageOf(opened, weekStart)
  val pager = rememberPagerState(initialPage = openedPage) { range.weekPages(weekStart) }
  val latestOpened by rememberUpdatedState(opened)
  LaunchedEffect(pager.settledPage) {
    val week = weekAt(pager.settledPage)
    val day = latestOpened
    val weeks = pager.settledPage - range.weekPageOf(day, weekStart)
    if (weeks != 0) onOpen(day.plusWeeks(weeks.toLong()))
  }
  LaunchedEffect(openedPage) {
    if (pager.currentPage != openedPage) pager.animateScrollToPage(openedPage, animationSpec = Springs.standard())
  }
  HorizontalPager(
    pager,
    Modifier.fillMaxWidth(),
    beyondViewportPageCount = 1,
    verticalAlignment = Alignment.Top,
    flingBehavior = PagerDefaults.flingBehavior(pager, snapAnimationSpec = Springs.standard()),
  ) { page ->
    val week = List(7) { weekAt(page).plusDays(it.toLong()) }
    days.Week(
      week,
      remember(days.calendar, week) { days.calendar.shown(week.first(), week.last()) },
      fadingOutside = null,
      Modifier.padding(horizontal = SCREEN_EDGE),
    )
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
