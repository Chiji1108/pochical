package app.pochical

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import app.pochical.design.ReadyPatterns
import app.pochical.design.Theme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ShiftMarkTest {
  @get:Rule val compose = createComposeRule()

  private val night = ReadyPatterns.all.first { it.id == "night" }

  private fun show(look: Look, settings: DeviceSettings = DeviceSettings(look = look)) {
    compose.setContent {
      CompositionLocalProvider(LocalDeviceSettings provides DeviceSettingsState(settings) {}) {
        PochicalTheme(settings) {
          Box(Modifier.testTag("mark")) {
            ShiftMark(night.icon, night.emoji, night.symbol, night.color, size = 48.dp)
          }
        }
      }
    }
  }

  private fun drawnColors(): Set<Color> {
    val pixels = compose.onNodeWithTag("mark").captureToImage().toPixelMap()
    return (0 until pixels.width).flatMap { x -> (0 until pixels.height).map { y -> pixels[x, y] } }.toSet()
  }

  @Test
  fun everyReadyPatternsIconHasBothWeights() {
    for (pattern in ReadyPatterns.all) {
      assertNotNull(pattern.icon, markLayers(pattern.icon, filled = true))
      assertNotNull(pattern.icon, markLayers(pattern.icon, filled = false))
    }
  }

  @Test
  fun theLetterIconHasNoGlyph() {
    assertNull(markLayers("letter", filled = true))
  }

  @Test
  fun aSlotPastThePaletteIsItsLast() {
    val colors = Theme.Pochical.colors(dark = false)
    assertEquals(colors.marks.last(), colors.mark(colors.marks.size + 3))
    assertEquals(colors.marks.first(), colors.mark(-1))
  }

  @Test
  fun anIconIsDrawnInItsPatternsColor() {
    show(Look(style = MarkStyle.Icon))
    val expected = Theme.Pochical.colors(dark = false).mark(night.color).color
    assertTrue(expected in drawnColors())
  }

  @Test
  fun oneToneDrawsTheThemesOwnColor() {
    show(Look(style = MarkStyle.Icon, colored = false))
    val own = Theme.Pochical.colors(dark = false).marks.first().color
    assertTrue(own in drawnColors())
  }

  @Test
  fun aBadgeShowsTheLetter() {
    show(Look(style = MarkStyle.Badge))
    compose.onNodeWithText(night.symbol).assertExists()
  }

  @Test
  fun anEmojiMarkShowsTheEmoji() {
    show(Look(style = MarkStyle.Emoji))
    compose.onNodeWithText(night.emoji).assertExists()
  }
}
