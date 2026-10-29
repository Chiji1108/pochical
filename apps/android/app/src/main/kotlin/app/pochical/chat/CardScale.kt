package app.pochical.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import app.pochical.design.Chat

// The chat's cards (shared days, polls, invitations) grow with the reader's text size as far as
// `chatRules.cardsMostScale`, so their columns still fit a line on the narrowest phone
// (spec/chat.md, Text size and contrast).

/**
 * [content] at the reader's text size, but no larger than `chatRules.cardsMostScale`: its `sp` and
 * its [cardDp] lengths are scaled once, by the capped size, and nothing is multiplied by hand.
 */
@Composable
fun CardScale(content: @Composable () -> Unit) {
  val density = LocalDensity.current
  CompositionLocalProvider(LocalDensity provides Density(density.density, minOf(density.fontScale, Chat.cardsMostScale)), content = content)
}

/** A length in a card that grows with its text, as its type does: this many dp at the default text size. */
val Float.cardDp: Dp
  @Composable get() = with(LocalDensity.current) { this@cardDp.sp.toDp() }

/** A length in a card that grows with its text, as [Float.cardDp]. */
val Int.cardDp: Dp
  @Composable get() = toFloat().cardDp
