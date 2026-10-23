package app.pochical.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.MarkStyle
import app.pochical.ShiftMark
import app.pochical.design.Radius
import app.pochical.mark
import java.time.LocalDate

/** Its height where the screen has room, as /design's and iOS's. */
val DAY_FULL_HEIGHT = 64.dp

/** A date in its 14dp line, centered in it rather than sitting on the font's own taller line. */
private val DATE_STYLE =
  TextStyle(
    fontSize = 11.sp,
    lineHeight = 14.sp,
    lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.Both),
  )

/** What a day of a page is drawn with, as it shows. */
data class DayLook(
  val day: LocalDate,
  val entry: DayEntry?,
  val pattern: Pattern?,
  val note: String?,
  /** The holiday's name, when the day is one. */
  val holiday: String?,
  /** A day of the month before or after, faded whole. */
  val outside: Boolean,
  val isToday: Boolean,
  /** The day opened, framed in the accent. */
  val isSelected: Boolean = false,
)

/**
 * A day of a month's page, as iOS's DayCell: its date, a memo's highlighter
 * stroke under it, and its shift's mark; today framed inside the day.
 */
@Composable
fun DayCell(look: DayLook, height: Dp, colorsHoliday: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val style = LocalDeviceSettings.current.device.look
  val pattern = look.pattern
  // A day off on a tint of its color, as 休みの見せ方 starts for icons
  // (強調); emoji and letters start with the mark alone (印だけ).
  val tile = pattern?.takeIf { it.countsAsOff && style.style == MarkStyle.Icon }?.let {
    colors.mark(if (style.colored) it.color else 0)
  }
  val shape = RoundedCornerShape(Radius.md)
  Column(
    modifier
      .height(height)
      .then(if (tile != null) Modifier.background(tile.tint, shape) else Modifier)
      .then(
        when {
          look.isSelected -> Modifier.border(2.dp, colors.accentDefault, shape)
          look.isToday -> Modifier.border(1.5.dp, colors.accentFocus, shape)
          else -> Modifier
        }
      )
      .alpha(if (look.outside) 0.35f else 1f)
      .clip(shape)
      .clickable(role = Role.Button, onClick = onClick)
      .padding(vertical = 4.dp)
      .clearAndSetSemantics {
        contentDescription = description(look)
        selected = look.isSelected
      },
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(2.dp),
  ) {
    Box(Modifier.height(14.dp), contentAlignment = Alignment.Center) {
      if (!look.note.isNullOrEmpty()) {
        // A highlighter stroke over the date's lower half, as in a paper
        // diary; on a day off's tint, the tint's own color a step deeper.
        Box(
          Modifier.matchParentSize()
            .padding(top = 7.dp)
            .offset(y = (-1).dp)
            .background(tile?.noteOnTint ?: colors.calendarNoteMarker, RoundedCornerShape(Radius.xxs))
        )
      }
      Text(
        look.day.dayOfMonth.toString(),
        style = DATE_STYLE,
        fontWeight =
          when {
            look.isToday -> FontWeight.ExtraBold
            look.outside -> FontWeight.Normal
            else -> FontWeight.SemiBold
          },
        color =
          when {
            look.isToday -> colors.accentDefault
            look.holiday != null && colorsHoliday -> colors.calendarHoliday
            else -> colors.textPrimary
          },
        modifier = Modifier.padding(horizontal = 3.dp),
      )
    }
    if (pattern != null) {
      Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
        ShiftMark(
          pattern.icon,
          pattern.emoji,
          pattern.symbol,
          pattern.color,
          size = if (style.style == MarkStyle.Badge) 26.dp else 24.dp,
          change = look.entry?.let { timeChange(it.start, it.end, pattern.time) },
        )
      }
    } else {
      Spacer(Modifier.fillMaxWidth().weight(1f))
    }
  }
}

/** What a screen reader hears: the date, a holiday, the shift and its moved hours, and a memo. */
private fun description(look: DayLook): String = buildList {
  add(look.day.monthDayText)
  look.holiday?.let(::add)
  add(look.pattern?.name ?: "未入力")
  val pattern = look.pattern
  val entry = look.entry
  val change = if (pattern != null && entry != null) timeChange(entry.start, entry.end, pattern.time) else null
  if (change != null && pattern?.time != null && entry != null) {
    val moves = listOfNotNull("早出".takeIf { change.early }, "残業".takeIf { change.late })
    val hours = hoursText(entry.start ?: pattern.time.start, entry.end ?: pattern.time.end)
    add("${if (moves.isEmpty()) "時間変更" else moves.joinToString("・")} $hours")
  }
  if (!look.note.isNullOrEmpty()) add("メモあり")
}.joinToString("、")
