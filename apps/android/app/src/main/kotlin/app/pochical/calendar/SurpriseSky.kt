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
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/** The share of the calendar's height the sky spreads over, from its top. */
private const val SKY_SHARE = 0.34f

private val SKY_CHANGE = tween<Float>((Skies.CHANGE_SECONDS * 1000).toInt(), easing = LinearOutSlowInEasing)

/**
 * Another sky than [id], at random: one anyone may get, or the テーマ's own; the テーマ's own the
 * first time (spec/calendar.md, The month).
 */
fun nextSky(id: String?, theme: Theme): String {
  val own = Skies.own(theme.id)
  if (id == null) return own
  return (Skies.anyone + own).filter { it != id }.randomOrNull() ?: own
}

/** A sky drawn at [alpha], fading in as it comes and out as another takes its place. */
private class SkyLayer(val lights: List<Color>, val alpha: Animatable<Float, *>)

/**
 * おたのしみ's sky behind the calendar's heading (iOS's SurpriseSky, /design's useSurprise): pale
 * light from both top corners and the middle, gone by the first weeks, in the sky the last tap on
 * the month's name drifted to, nothing before the first. A new one settles in under a second
 * over those before, from wherever they had got to; it breathes slowly while it stays, still with
 * reduced motion.
 */
@Composable
fun rememberSurpriseSky(reduceMotion: Boolean): DrawScope.() -> Unit {
  val device = LocalDeviceSettings.current.device
  val dark = isDark(device, isSystemInDarkTheme())
  val heading = device.heading
  val lights = heading.sky?.takeIf { heading.surprise }?.let { Skies.lights[it]?.colors(dark, device.theme.id) }
  val layers = remember { mutableStateListOf<SkyLayer>() }
  LaunchedEffect(lights) {
    if (layers.lastOrNull()?.lights == lights) return@LaunchedEffect
    val coming = lights?.let { SkyLayer(it, Animatable(0f)) }
    val going = layers.toList()
    coming?.let(layers::add)
    coroutineScope {
      for (layer in going) launch { layer.alpha.animateTo(0f, SKY_CHANGE) }
      coming?.let { launch { it.alpha.animateTo(1f, SKY_CHANGE) } }
    }
    layers.removeAll(going)
  }
  // Breathing only while a sky shows, so the calendar asks for no frames without one.
  val breath: State<Float> =
    if (reduceMotion || layers.isEmpty()) {
      remember { mutableStateOf(0f) }
    } else {
      rememberInfiniteTransition(label = "sky")
        .animateFloat(
          0f,
          1f,
          infiniteRepeatable(tween((Skies.BREATH_SECONDS * 1000).toInt(), easing = FastOutSlowInEasing), RepeatMode.Reverse),
          label = "breath",
        )
    }
  val breathing by rememberUpdatedState(breath)
  return remember {
    val paint = Paint()
    val draw: DrawScope.() -> Unit = { for (layer in layers) drawSky(layer.lights, layer.alpha.value, breathing.value, paint) }
    draw
  }
}

/** One sky at [alpha], [breath] of the way through its slow swell, through [paint]'s layer. */
private fun DrawScope.drawSky(lights: List<Color>, alpha: Float, breath: Float, paint: Paint) {
  val width = size.width
  val height = size.height * SKY_SHARE
  drawIntoCanvas { canvas ->
    paint.alpha = alpha
    canvas.saveLayer(Rect(0f, 0f, width, height), paint)
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
