package app.pochical.patterns

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.ShiftMark
import app.pochical.design.ReadyPatterns

/**
 * The ready-made patterns as filter chips under their headings (/design's ReadyPatternChips), for
 * picking several at once: パターンを追加, and 新しい仕事にする's question. [offered] says which show; a
 * heading left with none goes. Picking a pattern with a next day picks that too, as 夜勤 brings its
 * 明け and 当番 its 非番, which can still be dropped on its own; those in [needed] stay picked.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReadyPatternChips(
  picked: Set<String>,
  onPick: (Set<String>) -> Unit,
  modifier: Modifier = Modifier,
  needed: Set<String> = emptySet(),
  offered: (String) -> Boolean = { true },
) {
  val colors = LocalThemeColors.current
  val byId = ReadyPatterns.all.associateBy { it.id }
  Column(modifier, verticalArrangement = Arrangement.spacedBy(16.dp)) {
    for ((title, ids) in ReadyPatterns.offeredSections) {
      val shown = ids.filter(offered)
      if (shown.isEmpty()) continue
      Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
          title,
          style = MaterialTheme.typography.labelLarge,
          color = colors.textTertiary,
          modifier = Modifier.semantics { heading() },
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          for (id in shown) {
            val ready = byId[id] ?: continue
            FilterChip(
              selected = id in picked,
              onClick = {
                onPick(
                  when {
                    id in needed -> picked
                    id in picked -> picked - id
                    else -> picked + id + listOfNotNull(ready.nextDay)
                  }
                )
              },
              label = { Text(ready.name) },
              leadingIcon = { ShiftMark(ready.icon, ready.emoji, ready.symbol, ready.color, size = 16.dp) },
            )
          }
        }
      }
    }
  }
}

/** The picked ready-made patterns, in the order the chips show them. */
fun chosenPatterns(picked: Set<String>): List<String> = ReadyPatterns.offered.filter { it in picked }
