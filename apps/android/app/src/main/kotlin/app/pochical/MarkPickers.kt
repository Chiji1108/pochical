package app.pochical

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.emoji2.emojipicker.EmojiPickerView
import app.pochical.design.MarkIconNames
import app.pochical.design.Radius
import app.pochical.kit.markIconSections

// What a mark is picked from, a pattern's or a group's (/design's MarkChoiceGrid, MarkColorGrid,
// IconPickerSheet): rows of eight, the one picked edged in the accent.

/** How many choices a row of marks holds. */
private const val PER_ROW = 8

/** [choices] in rows of eight, each drawn by [cell], [chosen] edged in the accent; a tap picks one. */
@Composable
fun <T> MarkChoiceGrid(
  choices: List<T>,
  chosen: T?,
  label: (T) -> String,
  pick: (T) -> Unit,
  modifier: Modifier = Modifier,
  cell: @Composable (T) -> Unit,
) {
  Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
    choices.chunked(PER_ROW).forEach { row ->
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        row.forEach { choice ->
          MarkChoice(choice == chosen, label(choice), { pick(choice) }, Modifier.weight(1f)) { cell(choice) }
        }
        repeat(PER_ROW - row.size) { Box(Modifier.weight(1f)) }
      }
    }
  }
}

@Composable
private fun MarkChoice(picked: Boolean, label: String, onPick: () -> Unit, modifier: Modifier, content: @Composable () -> Unit) {
  val shape = RoundedCornerShape(Radius.md)
  Box(
    modifier
      .heightIn(min = 44.dp)
      .clip(shape)
      .then(if (picked) Modifier.border(1.5.dp, MaterialTheme.colorScheme.secondary, shape) else Modifier)
      .clickable(role = Role.RadioButton, onClick = onPick)
      .semantics {
        contentDescription = label
        selected = picked
      },
    contentAlignment = Alignment.Center,
  ) {
    content()
  }
}

/** The mark palette's colors in rows of eight, [chosen] ringed, as an icon or letters take one. */
@Composable
fun MarkColorGrid(chosen: Int, pick: (Int) -> Unit, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current.marks
  MarkChoiceGrid(colors.indices.toList(), chosen, { colors[it].name }, pick, modifier) { slot ->
    Box(Modifier.size(28.dp).background(colors[slot].color, CircleShape))
  }
}

/**
 * ほかのアイコンを選ぶ (/design's IconPickerSheet): every icon a mark can take, sorted into kinds,
 * each drawn by [mark], the one [picked] edged in the accent, and a search over their names and the
 * words they stand for. Picking one closes it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IconPickerSheet(picked: String, onPick: (String) -> Unit, onDismiss: () -> Unit, mark: @Composable (String) -> Unit) {
  var query by rememberSaveable { mutableStateOf("") }
  val sections = remember(query) { markIconSections(query) }
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    Text(
      stringResource(R.string.icon_picker_title),
      Modifier.padding(horizontal = 16.dp).semantics { heading() },
      style = MaterialTheme.typography.titleLarge,
    )
    OutlinedTextField(
      query,
      { query = it },
      Modifier.fillMaxWidth().padding(16.dp),
      placeholder = { Text(stringResource(R.string.icon_picker_search)) },
      leadingIcon = { Icon(painterResource(R.drawable.ic_search), contentDescription = null) },
      singleLine = true,
    )
    LazyVerticalGrid(
      GridCells.Fixed(PER_ROW),
      Modifier.padding(horizontal = 16.dp),
      horizontalArrangement = Arrangement.spacedBy(4.dp),
      verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      if (sections.isEmpty()) {
        item(span = { GridItemSpan(maxLineSpan) }) {
          Text(
            stringResource(R.string.icon_picker_none),
            Modifier.padding(top = 24.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
      }
      sections.forEach { section ->
        item(span = { GridItemSpan(maxLineSpan) }) {
          Text(
            section.title,
            Modifier.padding(top = 12.dp, bottom = 4.dp).semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.titleSmall,
          )
        }
        items(section.icons) { icon ->
          MarkChoice(icon == picked, MarkIconNames.names[icon] ?: icon, { onPick(icon) }, Modifier.aspectRatio(1f)) { mark(icon) }
        }
      }
    }
  }
}

/** ほかの絵文字を選ぶ: Android's own emoji picker, every emoji the phone draws; picking one closes it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmojiPickerSheet(onPick: (String) -> Unit, onDismiss: () -> Unit) {
  val picked by rememberUpdatedState(onPick)
  ModalBottomSheet(onDismissRequest = onDismiss) {
    BoxWithConstraints {
      AndroidView(
        factory = { context -> EmojiPickerView(context).apply { setOnEmojiPickedListener { picked(it.emoji) } } },
        modifier = Modifier.fillMaxWidth().heightIn(max = maxHeight).padding(bottom = 16.dp),
      )
    }
  }
}
