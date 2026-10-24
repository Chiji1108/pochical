package app.pochical.calendar

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.ShiftMark
import app.pochical.Week
import app.pochical.design.Metrics
import app.pochical.design.PATTERNS_PER_PAGE
import app.pochical.design.Radius
import java.time.LocalDate

/**
 * ポチポチ入力's tray (spec/calendar.md, ポチポチ入力): the day being entered, a key for each
 * pattern in the person's order, and 消す and 翌日へ. It is entered like a keyboard, so every key
 * ticks alike (spec/haptics.md). [said] is what the last key did, for a screen reader to hear.
 */
@Composable
fun EntryTray(
  day: LocalDate,
  week: Week,
  country: String,
  patterns: List<Pattern>,
  canClear: Boolean,
  canSkip: Boolean,
  said: String?,
  onEnter: (String?) -> Unit,
  onSkip: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val haptics = LocalHapticFeedback.current
  val tick = { haptics.performHapticFeedback(HapticFeedbackType.VirtualKey) }
  val keyPages = rememberPagerState { pageCount(patterns.size) }
  Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    TrayDateLabel(day, week, country, said)
    PatternKeys(patterns, keyPages) {
      tick()
      onEnter(it.id)
    }
    TrayActionsRow(
      keyPages,
      leading = {
        TrayAction(stringResource(R.string.clear), R.drawable.ic_delete, enabled = canClear) {
          tick()
          onEnter(null)
        }
      },
      trailing = {
        TrayAction(stringResource(R.string.entering_skip), R.drawable.ic_arrow_forward, enabled = canSkip, trailingIcon = true) {
          tick()
          onSkip()
        }
      },
    )
  }
}

/** How many pages of keys `count` patterns take. */
fun pageCount(count: Int): Int = maxOf(1, (count + PATTERNS_PER_PAGE - 1) / PATTERNS_PER_PAGE)

/**
 * The day being entered, over the keys: words, not a button, as another day is picked on the
 * calendar above, its weekday colored as the calendar colors it. A live region, so a screen reader
 * hears what each key did and where entering goes on.
 */
@Composable
private fun TrayDateLabel(day: LocalDate, week: Week, country: String, said: String?) {
  val colors = LocalThemeColors.current
  val weekdayColor = weekdayColor(day.weekday, holiday = day.holidayName(country) != null, week, plain = colors.textTertiary)
  val label = said ?: stringResource(R.string.entering_day, day.monthDayText)
  Row(
    Modifier.heightIn(min = Metrics.touch).clearAndSetSemantics {
      contentDescription = label
      liveRegion = LiveRegionMode.Polite
    },
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(2.dp),
  ) {
    Text(day.monthDayText, style = fixedText(17.dp, FontWeight.SemiBold), color = colors.textPrimary)
    Text("(${weekdayLetter(day.weekday)})", style = fixedText(14.dp), color = weekdayColor)
  }
}

/**
 * A key for each pattern, as ポチポチ入力's tray and an order being typed have them: up to
 * [PATTERNS_PER_PAGE] on a page, fewer in fewer columns, more paged and swiped, every page as tall
 * as the fullest so what is under them stays put. The keys keep their size at every text size, as a
 * keyboard's do.
 */
@Composable
fun PatternKeys(patterns: List<Pattern>, pages: PagerState, onPick: (Pattern) -> Unit) {
  val paged = patterns.chunked(PATTERNS_PER_PAGE)
  if (paged.size > 1) {
    HorizontalPager(pages, Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) { page ->
      KeyGrid(paged[page], columns = PAGE_COLUMNS, rows = KEY_ROWS, tall = false, onPick)
    }
  } else {
    // Fewer patterns sit in fewer columns, as /design lays them out: two rows from five on.
    val columns = if (patterns.size <= 4) maxOf(patterns.size, 1) else minOf((patterns.size + 1) / KEY_ROWS, PAGE_COLUMNS)
    KeyGrid(patterns, columns, rows = (patterns.size + columns - 1) / columns, tall = patterns.size <= 4, onPick)
  }
}

/** A full page of keys is [PATTERNS_PER_PAGE] in two rows. */
private const val KEY_ROWS = 2
private const val PAGE_COLUMNS = (PATTERNS_PER_PAGE + KEY_ROWS - 1) / KEY_ROWS

private val KEY_GAP = 8.dp
private val KEY_WIDTH = 72.dp

@Composable
private fun KeyGrid(patterns: List<Pattern>, columns: Int, rows: Int, tall: Boolean, onPick: (Pattern) -> Unit) {
  val colors = LocalThemeColors.current
  val shape = RoundedCornerShape(Radius.lg)
  val height = if (tall) 77.dp else 64.dp
  BoxWithConstraints(Modifier.fillMaxWidth()) {
    val width = minOf(KEY_WIDTH, (maxWidth - KEY_GAP * (columns - 1)) / columns)
    Column(verticalArrangement = Arrangement.spacedBy(KEY_GAP)) {
      repeat(rows) { row ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(KEY_GAP, Alignment.CenterHorizontally)) {
          repeat(columns) { column ->
            val pattern = patterns.getOrNull(row * columns + column)
            // A short last page keeps its keys where a full page's are.
            Box(Modifier.size(width, height)) {
              if (pattern != null) {
                Surface(
                  onClick = { onPick(pattern) },
                  shape = shape,
                  color = colors.backgroundCard,
                  border = BorderStroke(1.dp, colors.borderDefault),
                  modifier = Modifier.size(width, height),
                ) {
                  Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 26.dp)
                    Spacer(Modifier.height(8.dp))
                    Text(
                      pattern.name,
                      style = fixedText(12.dp),
                      color = colors.textPrimary,
                      maxLines = 1,
                      overflow = TextOverflow.Ellipsis,
                      modifier = Modifier.padding(horizontal = 4.dp),
                    )
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

/**
 * A tray's words under its keys with the pages' dots between them, the dots in the middle whatever
 * the words, so they sit in one place in every tray.
 */
@Composable
fun TrayActionsRow(pages: PagerState, leading: @Composable () -> Unit, trailing: @Composable () -> Unit) {
  Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) { leading() }
    if (pages.pageCount > 1) PageDots(pages)
    Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) { trailing() }
  }
}

/** The pages of keys as dots, the one shown filled; read as which page of how many. */
@Composable
private fun PageDots(pages: PagerState) {
  val colors = LocalThemeColors.current
  val label = stringResource(R.string.entering_key_page, pages.currentPage + 1, pages.pageCount)
  Row(Modifier.semantics(mergeDescendants = true) { contentDescription = label }, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
    repeat(pages.pageCount) { page ->
      Box(
        Modifier.size(7.dp)
          .background(if (page == pages.currentPage) colors.textSecondary else colors.fillPrimary, CircleShape)
      )
    }
  }
}

/** One of a tray's words beside its dots, small and quiet: 消す and 翌日へ. */
@Composable
fun TrayAction(title: String, icon: Int, enabled: Boolean, trailingIcon: Boolean = false, onClick: () -> Unit) {
  val colors = LocalThemeColors.current
  val tint = if (enabled) colors.textTertiary else colors.textDisabled
  TextButton(onClick, enabled = enabled, modifier = Modifier.heightIn(min = Metrics.touch)) {
    val drawn = @Composable { Icon(painterResource(icon), null, Modifier.size(16.dp), tint = tint) }
    if (!trailingIcon) drawn()
    Text(title, style = fixedText(12.dp), color = tint, maxLines = 1, modifier = Modifier.padding(horizontal = 4.dp))
    if (trailingIcon) drawn()
  }
}

/** Text whose size is set in dp, so the keys keep their size at every text size, as a keyboard's do. */
@Composable
private fun fixedText(size: Dp, weight: FontWeight = FontWeight.Normal): TextStyle =
  with(LocalDensity.current) { TextStyle(fontSize = size.toSp(), fontWeight = weight) }
