package app.pochical.chat

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pochical.design.Chat
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A card grows with the text size once, as far as chatRules.cardsMostScale (spec/chat.md, Text size and contrast). */
@RunWith(RobolectricTestRunner::class)
class CardScaleTest {
  @get:Rule val compose = createComposeRule()

  private fun inCard(fontScale: Float): Pair<Float, Dp> {
    var scale = 0f
    var length = 0.dp
    compose.setContent {
      CompositionLocalProvider(LocalDensity provides Density(2f, fontScale)) {
        CardScale {
          scale = LocalDensity.current.fontScale
          length = 10.cardDp
        }
      }
    }
    compose.waitForIdle()
    return scale to length
  }

  @Test
  fun aLargeTextSizeStopsAtTheCardsMost() {
    val (scale, length) = inCard(2f)
    assertEquals(Chat.cardsMostScale, scale, 0.001f)
    assertEquals(10f * Chat.cardsMostScale, length.value, 0.01f)
  }

  @Test
  fun aSmallerTextSizeIsTheReadersOwn() {
    val (scale, length) = inCard(1.15f)
    assertEquals(1.15f, scale, 0.001f)
    assertEquals(11.5f, length.value, 0.01f)
  }
}
