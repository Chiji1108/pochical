package app.pochical

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Text
import androidx.compose.material3.TooltipAnchorPosition
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * A button that shows only a symbol, [content], named by [label] in Material's plain tooltip as a
 * pointer rests on it or a finger holds it, as Material has an icon button's tooltip (and the large
 * screens' quality its Hover_Parity). [label] is the words a screen reader says of the button too,
 * so the button's symbol carries them as its description.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Tip(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
  TooltipBox(
    positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above),
    tooltip = { PlainTooltip { Text(label) } },
    state = rememberTooltipState(),
    modifier = modifier,
    content = content,
  )
}
