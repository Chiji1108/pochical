package app.pochical.calendar

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import app.pochical.LocalThemeColors
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
 * tenths of the way from the fourth to the fifth.
 */
@Composable
fun MonthName(pages: Float, monthAt: (Int) -> YearMonth, reduceMotion: Boolean, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val page = pages.roundToInt()
  // From the nearest page, so a month comes in whole as its page lands.
  val share = if (reduceMotion) 0f else pages - page
  val month = monthAt(page)
  val coming = if (share == 0f) month else monthAt(page + share.sign.toInt())
  Column(
    modifier.clearAndSetSemantics {
      heading()
      contentDescription = "${month.year}年${month.monthValue}月"
    },
    verticalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    RollingText(
      month.year.toString(),
      coming.year.toString(),
      share,
      TextStyle(fontSize = 11.sp, color = colors.textTertiary),
    )
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
      RollingText(
        month.monthValue.toString(),
        coming.monthValue.toString(),
        share,
        TextStyle(fontSize = 36.sp, fontWeight = FontWeight.SemiBold, color = colors.textPrimary),
        Modifier.alignByBaseline(),
      )
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

/**
 * A name rolling within its own line toward `coming`, `share` of the way to
 * its page (-0.5 to 0.5; toward the next above 0). Half way, the next page's
 * name takes its place half rolled in, so the roll runs on without a break.
 * Its width goes from the one name's to the other's, so what follows it
 * moves over as it rolls.
 */
@Composable
private fun RollingText(text: String, coming: String, share: Float, style: TextStyle, modifier: Modifier = Modifier) {
  val moving = if (coming == text) 0f else share
  val shown = abs(moving)
  Layout(
    content = {
      Text(text, Modifier.graphicsLayer { alpha = 1 - shown }, style = style, softWrap = false)
      Text(coming, Modifier.graphicsLayer { alpha = shown }, style = style, softWrap = false)
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
    val width = (first.width + (second.width - first.width) * shown).roundToInt()
    layout(width, maxOf(first.height, second.height), mapOf(FirstBaseline to first[FirstBaseline])) {
      first.placeRelative(0, (-moving * first.height).roundToInt())
      if (moving != 0f) second.placeRelative(0, ((moving.sign - moving) * second.height).roundToInt())
    }
  }
}
