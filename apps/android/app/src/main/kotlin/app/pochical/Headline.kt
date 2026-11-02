package app.pochical

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow

/**
 * The headline a screen stands on, outside an app bar: the first run's ポチカル and its questions,
 * the empty グループ's, an invitation's group, a member's name. In Material 3 Expressive's
 * emphasized type, which Material keeps for headlines and other editorial treatments, a step
 * heavier than the regular scale; [large] for the one a screen is built around (headlineMedium's),
 * else headlineSmall's. A heading to a screen reader.
 */
@Composable
fun Headline(
  text: String,
  modifier: Modifier = Modifier,
  large: Boolean = false,
  textAlign: TextAlign? = null,
  maxLines: Int = Int.MAX_VALUE,
) {
  val type = MaterialTheme.typography
  Text(
    text,
    modifier.semantics { heading() },
    // Material's role for words on the screen's ground, which a screen drawn outside a Surface
    // (the first run's) would not hand down.
    color = MaterialTheme.colorScheme.onSurface,
    style = (if (large) type.headlineMediumEmphasized else type.headlineSmallEmphasized),
    textAlign = textAlign,
    overflow = TextOverflow.Ellipsis,
    maxLines = maxLines,
  )
}
