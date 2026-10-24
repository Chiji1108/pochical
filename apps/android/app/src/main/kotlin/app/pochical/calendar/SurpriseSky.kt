package app.pochical.calendar

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import app.pochical.LocalDeviceSettings
import app.pochical.design.Skies
import app.pochical.design.Theme
import app.pochical.isDark

/** The share of the calendar's height the sky spreads over, from its top. */
private const val SKY_SHARE = 0.34f

/**
 * Another sky than [id], at random: one anyone may get, or the テーマ's own; the テーマ's own the
 * first time (spec/calendar.md, The month).
 */
fun nextSky(id: String?, theme: Theme): String {
  val own = Skies.own(theme.id)
  if (id == null) return own
  return (Skies.anyone + own).filter { it != id }.randomOrNull() ?: own
}

/**
 * おたのしみ's sky as the calendar draws it behind its heading (iOS's SurpriseSky, /design's
 * useSurprise): pale light from both top corners and the middle, gone by the first weeks, in the
 * sky the last tap on the month's name drifted to, nothing before the first. A new one settles in
 * under a second over the one before; it breathes slowly while it stays, still with reduced
 * motion.
 */
@Composable
fun rememberSurpriseSky(reduceMotion: Boolean): DrawScope.() -> Unit {
  val device = LocalDeviceSettings.current.device
  val dark = isDark(device, isSystemInDarkTheme())
  val heading = device.heading
  val lights = heading.sky?.takeIf { heading.surprise }?.let { Skies.lights[it]?.colors(dark, device.theme.id) }
  var shown by remember { mutableStateOf(lights) }
  var before by remember { mutableStateOf<List<Color>?>(null) }
  val change = remember { Animatable(1f) }
  LaunchedEffect(lights) {
    if (lights == shown) return@LaunchedEffect
    before = shown
    shown = lights
    change.snapTo(0f)
    change.animateTo(1f, tween((Skies.CHANGE_SECONDS * 1000).toInt(), easing = LinearOutSlowInEasing))
    before = null
  }
  val breath: State<Float> =
    if (reduceMotion) {
      remember { mutableStateOf(0f) }
    } else {
      rememberInfiniteTransition(label = "sky")
        .animateFloat(0f, 1f, infiniteRepeatable(tween((Skies.BREATH_SECONDS * 1000).toInt(), easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "breath")
    }
  return {
    before?.let { drawSky(it, 1 - change.value, breath.value) }
    shown?.let { drawSky(it, change.value, breath.value) }
  }
}

/** One sky at [alpha], [breath] of the way through its slow swell. */
private fun DrawScope.drawSky(lights: List<Color>, alpha: Float, breath: Float) {
  val width = size.width
  val height = size.height * SKY_SHARE
  drawIntoCanvas { canvas ->
    canvas.saveLayer(Rect(0f, 0f, width, height), Paint().apply { this.alpha = alpha })
    // A little larger than its place as it breathes, so it never shows an edge.
    translate(left = (breath * 2 - 1) * 0.02f * width) {
      scale(1 + 0.08f * breath, pivot = Offset(width / 2, 0f)) {
        light(lights[0], Offset(0f, 0f), 0.9f, 0.8f, 0.7f, width, height)
        light(lights[2], Offset(width, 0f), 0.9f, 0.8f, 0.7f, width, height)
        light(lights[1], Offset(width / 2, height * 0.25f), 0.8f, 0.7f, 0.75f, width, height)
      }
    }
    // Over the heading only, fading out by the first weeks.
    drawRect(
      Brush.verticalGradient(0.3f to Color.Black, 1f to Color.Transparent, endY = height),
      size = size.copy(height = height),
      blendMode = BlendMode.DstIn,
    )
    canvas.restore()
  }
}

/**
 * A light as CSS's radial-gradient(w% h% at x y, color, transparent fade): an ellipse of radii
 * [rx] and [ry] of the box about [center], its color gone by [fade] of the way out.
 */
private fun DrawScope.light(color: Color, center: Offset, rx: Float, ry: Float, fade: Float, width: Float, height: Float) {
  val radius = rx * width
  scale(scaleX = 1f, scaleY = ry * height / radius, pivot = center) {
    drawCircle(Brush.radialGradient(0f to color, fade to color.copy(alpha = 0f), center = center, radius = radius), radius, center)
  }
}
