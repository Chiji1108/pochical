package app.pochical.calendar

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.foundation.pager.PagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.FirstBaseline
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.design.PochicalTextStyles
import app.pochical.kit.byPeriod
import app.pochical.kit.page
import java.time.YearMonth
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sign

/**
 * The year over the month, as iOS's MonthName and /design's: while the
 * pages move, by a finger or on their own, each rolls within its own line
 * toward the month coming in, the next up from below and the one before
 * down from above, and the year rolls only when it changes. With reduced
 * motion they just change. `pages` is where the pages are, 3.4 being four
 * tenths of the way from the fourth to the fifth, each page named by the
 * month it starts in. With a シフトの期間 a page is named by its days rather
 * than its month (spec/calendar.md, The shift period): its first large,
 * 10/15, its last after it as small as 月, 〜11/14, under the year of its
 * first day and of its last when that is another.
 */
@Composable
fun MonthName(pages: Float, monthAt: (Int) -> YearMonth, reduceMotion: Boolean, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val period = LocalDeviceSettings.current.device.period
  val english = LocalDeviceSettings.current.device.heading.english
  val page = pages.roundToInt()
  // From the nearest page, so a month comes in whole as its page lands.
  val share = if (reduceMotion) 0f else pages - page
  val month = monthAt(page)
  val coming = if (share == 0f) month else monthAt(page + share.sign.toInt())
  fun year(of: YearMonth): String {
    val days = period.page(of)
    return if (days.first.year == days.last.year) days.first.year.toString() else "${days.first.year} – ${days.last.year}"
  }
  Column(
    modifier.clearAndSetSemantics {
      heading()
      contentDescription = if (period.byPeriod) period.page(month).title(english = false) else month.yearMonthText
    },
    verticalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    RollingText(year(month), year(coming), share, PochicalTextStyles.caption2.copy(color = colors.textTertiary))
    val large = TextStyle(fontSize = 36.sp, fontWeight = FontWeight.SemiBold, color = colors.textPrimary)
    if (period.byPeriod) {
      val small = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium, color = colors.textPrimary)
      fun first(of: YearMonth) = period.page(of).first.headingDay(english)
      fun last(of: YearMonth) = "${if (english) " – " else "〜"}${period.page(of).last.headingDay(english)}"
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        // English months a letter at a time, as a month's name rolls.
        if (english) {
          Row(Modifier.alignByBaseline()) { RollingLetters(first(month), first(coming), share, large) }
          Row(Modifier.alignByBaseline()) { RollingLetters(last(month), last(coming), share, small) }
        } else {
          RollingText(first(month), first(coming), share, large, Modifier.alignByBaseline())
          RollingText(last(month), last(coming), share, small, Modifier.alignByBaseline())
        }
      }
    } else if (english) {
      // A lettered calendar's month, lower case and cut short: sep.
      RollingLetters(month.headingMonth, coming.headingMonth, share, large)
    } else {
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        RollingText(month.monthValue.toString(), coming.monthValue.toString(), share, large, Modifier.alignByBaseline())
        Text(
          "月",
          Modifier.alignByBaseline(),
          fontSize = 14.sp,
          fontWeight = FontWeight.Medium,
          color = colors.textPrimary,
        )
      }
    }
  }
}

/**
 * The name of the month [pages] shows, as [name] writes it, rolling with the finger toward the month
 * coming in, as iOS's RollingMonthTitle; with reduced motion it just changes. Over a pager of
 * months other than the calendar's: one person's month, a repeating order's.
 */
@Composable
fun PagerMonthName(pages: PagerState, monthAt: (Int) -> YearMonth, name: (YearMonth) -> String, style: TextStyle) {
  val reduceMotion = rememberReducedMotion()
  val toward by remember { derivedStateOf { pages.currentPageOffsetFraction.sign.toInt() } }
  val shown = name(monthAt(pages.currentPage))
  BlendingText(
    shown,
    name(monthAt(pages.currentPage + toward)),
    { if (reduceMotion) 0f else pages.currentPageOffsetFraction },
    rolls = true,
    style,
    // Read as the one month shown, as a heading, not the two names rolling.
    Modifier.clearAndSetSemantics {
      heading()
      contentDescription = shown
    },
  )
}

/** How much later each letter of an English month starts, of the whole roll. */
private const val LETTER_LAG = 0.08f

/** The most letters an English heading month has, as sep., so short names keep the same pace. */
private const val LONGEST_MONTH = 4

/**
 * An English month's name rolling a letter at a time, as iOS's RollingLetters and /design's
 * RollingName with `letters`: each letter starts a little after the one before, all done as the
 * page lands; `share` as [RollingText]'s. Laid out a letter at a time at rest too, so the name does
 * not shift as it starts or stops rolling.
 */
@Composable
private fun RollingLetters(text: String, coming: String, share: Float, style: TextStyle) {
  // From the earlier page's name to the later one's, `turned` of the way, whichever is nearer now.
  val (from, to, turned) = if (share >= 0) Triple(text, coming, share) else Triple(coming, text, 1 + share)
  val places = maxOf(from.length, to.length)
  val span = 1 - (maxOf(places, LONGEST_MONTH) - 1) * LETTER_LAG
  Row {
    for (index in 0 until places) {
      val letterFrom = from.getOrNull(index)?.toString().orEmpty()
      val letterTo = to.getOrNull(index)?.toString().orEmpty()
      val letterTurned = if (from == to) 0f else ((turned - index * LETTER_LAG) / span).coerceIn(0f, 1f)
      BlendingText(letterFrom, letterTo, { letterTurned }, rolls = true, style)
    }
  }
}

/**
 * A name rolling within its own line toward `coming`, `share` of the way to
 * its page (-0.5 to 0.5; toward the next above 0). Half way, the next page's
 * name takes its place half rolled in, so the roll runs on without a break.
 * Its width goes from the one name's to the other's, so what follows it
 * moves over as it rolls.
 */
@Composable
private fun RollingText(text: String, coming: String, share: Float, style: TextStyle, modifier: Modifier = Modifier) =
  BlendingText(text, coming, { share }, rolls = true, style, modifier)

/**
 * [text] giving way to [coming] in its own line, [share] of the way (-0.5 to 0.5; toward the next
 * above 0), rolling up or down as [MonthName]'s do or, unless [rolls], crossfading in place. Its
 * width goes from the one's to the other's. [share] is read as it is laid out and drawn, so a
 * finger moving the pages changes neither text.
 */
@Composable
fun BlendingText(text: String, coming: String, share: () -> Float, rolls: Boolean, style: TextStyle, modifier: Modifier = Modifier) {
  fun moving() = if (coming == text) 0f else share()
  Layout(
    content = {
      Text(text, Modifier.graphicsLayer { alpha = 1 - abs(moving()) }, style = style, softWrap = false)
      Text(coming, Modifier.graphicsLayer { alpha = abs(moving()) }, style = style, softWrap = false)
    },
    // Within its own line, while a wider name can still show whole.
    modifier =
      modifier.drawWithContent {
        val slack = 24.dp.toPx()
        clipRect(left = -slack, right = size.width + slack) { this@drawWithContent.drawContent() }
      },
  ) { measurables, constraints ->
    val loose = constraints.copy(minWidth = 0, maxWidth = Int.MAX_VALUE)
    val (first, second) = measurables.map { it.measure(loose) }
    val moving = moving()
    val width = (first.width + (second.width - first.width) * abs(moving)).roundToInt()
    layout(width, maxOf(first.height, second.height), mapOf(FirstBaseline to first[FirstBaseline])) {
      val roll = if (rolls) 1 else 0
      first.placeRelative(0, (-moving * first.height * roll).roundToInt())
      if (moving != 0f) second.placeRelative(0, ((moving.sign - moving) * second.height * roll).roundToInt())
    }
  }
}
