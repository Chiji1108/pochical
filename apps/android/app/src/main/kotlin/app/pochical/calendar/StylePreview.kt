package app.pochical.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.design.Metrics
import app.pochical.design.Radius
import app.pochical.kit.stylePreviewDays
import java.time.LocalDate
import app.pochical.kit.styleSamples as sampleIds

/** The marks the テーマ and シフトの色 choices show side by side (spec/vectors/style-preview.json, samples). */
fun styleSamples(patterns: List<Pattern>): List<Pattern> {
  val byId = patterns.associateBy { it.id }
  return sampleIds(patterns.map { it.row }).mapNotNull(byId::get)
}

/**
 * The preview at the top of スタイル (/design's StylePreview): this week and the next as a made-up
 * run of the person's own [patterns] in use, drawn in the settings being chosen, on a card in the
 * テーマ's colors, light or dark as [dark] says, with ☀︎ / ☾ on its edge.
 */
@Composable
fun StylePreview(
  patterns: List<Pattern>,
  today: LocalDate,
  dark: Boolean,
  onDarkChange: (Boolean) -> Unit,
  modifier: Modifier = Modifier,
) {
  val device = LocalDeviceSettings.current.device
  val theme = device.theme
  val week = device.week
  val first = today.weekStartingOn(week.start)
  val days = (0 until 14).map { first.plusDays(it.toLong()) }
  val shown = stylePreviewDays(days, patterns.map { it.row })
  val byId = patterns.associateBy { it.id }
  val label = stringResource(R.string.preview_week)
  // Room for the switch over the card's top edge.
  Box(modifier.padding(top = 14.dp)) {
    CompositionLocalProvider(LocalThemeColors provides theme.colors(dark || theme.isAlwaysDark)) {
      val colors = LocalThemeColors.current
      val shape = RoundedCornerShape(Radius.xl)
      Column(
        Modifier.background(colors.backgroundCard, shape)
          .border(1.dp, colors.separator, shape)
          .padding(12.dp)
          .clearAndSetSemantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(4.dp),
      ) {
        WeekdayRow(week)
        for (row in days.chunked(7)) {
          Row(horizontalArrangement = Arrangement.spacedBy(Metrics.spacingStep)) {
            for (day in row) {
              val shift = shown[day]
              DayCell(
                DayLook(
                  day = day,
                  entry = shift?.let(::DayEntry),
                  pattern = shift?.let(byId::get),
                  note = null,
                  holiday = null,
                  outside = false,
                  isToday = day == today,
                ),
                height = DAY_FULL_HEIGHT,
                colorsHoliday = week.holiday,
                onClick = {},
                enabled = false,
                modifier = Modifier.weight(1f),
              )
            }
          }
        }
      }
      SchemeSwitch(
        dark = dark || theme.isAlwaysDark,
        // A テーマ drawn dark has no light to switch to: its ☾ stays on.
        enabled = !theme.isAlwaysDark,
        onChange = onDarkChange,
        modifier = Modifier.offset(x = 12.dp, y = -Metrics.touch / 2),
      )
    }
  }
}

/**
 * ☀︎ / ☾ to see a preview in the other of light and dark without changing 外観 (/design's
 * PreviewSchemeSwitch): drawn small, each side a touch target of its own.
 */
@Composable
private fun SchemeSwitch(dark: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val label = stringResource(R.string.preview_scheme)
  Row(
    modifier
      // The frame drawn around the small sides alone, though each reaches a full touch target.
      .drawBehind {
        val height = SIDE_HEIGHT.toPx() + 6.dp.toPx()
        val top = (size.height - height) / 2
        val corner = CornerRadius(Radius.md.toPx())
        drawRoundRect(colors.backgroundCard, Offset(0f, top), Size(size.width, height), corner)
        drawRoundRect(colors.separator, Offset(0f, top), Size(size.width, height), corner, style = Stroke(1.dp.toPx()))
      }
      .padding(horizontal = 1.dp)
      .selectableGroup()
      .semantics { contentDescription = label },
  ) {
    for ((side, icon, name) in listOf(Triple(false, R.drawable.ic_light_mode, R.string.preview_light), Triple(true, R.drawable.ic_dark_mode, R.string.preview_dark))) {
      val picked = side == dark
      Box(
        Modifier.selectable(selected = picked, enabled = enabled, role = Role.RadioButton) { onChange(side) }
          .size(width = 30.dp, height = Metrics.touch),
        contentAlignment = Alignment.Center,
      ) {
        Box(
          Modifier.size(width = 28.dp, height = SIDE_HEIGHT).background(if (picked) colors.fillTertiary else Color.Transparent, RoundedCornerShape(Radius.sm)),
          contentAlignment = Alignment.Center,
        ) {
          Icon(
            painterResource(icon),
            stringResource(name),
            Modifier.size(14.dp),
            tint = if (picked) colors.textPrimary else if (enabled) colors.textQuaternary else colors.textDisabled,
          )
        }
      }
    }
  }
}

private val SIDE_HEIGHT = 22.dp
