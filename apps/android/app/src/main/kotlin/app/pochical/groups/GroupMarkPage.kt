package app.pochical.groups

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.pochical.ChoiceButtons
import app.pochical.EmojiPickerSheet
import app.pochical.Footnote
import app.pochical.IconPickerSheet
import app.pochical.MarkChoiceGrid
import app.pochical.MarkColorGrid
import app.pochical.MarkFrame
import app.pochical.MarkFrameSize
import app.pochical.MarkLetterField
import app.pochical.R
import app.pochical.SectionHeader
import app.pochical.design.MarkIconNames
import app.pochical.design.ReadyPatterns
import app.pochical.design.TextLimits
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.PhotoShelf
import app.pochical.kit.initialLetter
import app.pochical.kit.paletteColor
import app.pochical.withPicked

/** The kinds of mark the tabs pick from; a photo is picked above them. */
private enum class MarkKind(val title: Int) {
  Icon(R.string.mark_kind_icon),
  Emoji(R.string.mark_kind_emoji),
  Letter(R.string.mark_kind_letter),
}

/** The tab a mark is drawn in; none for a photo. */
private val GroupMarkValue.kind: MarkKind?
  get() =
    when {
      photoId.isNotEmpty() -> null
      icon.isNotEmpty() -> MarkKind.Icon
      letter.isNotEmpty() -> MarkKind.Letter
      else -> MarkKind.Emoji
    }

/**
 * アイコン (/design's GroupMarkPage), over the page that changes the group: a photo, taken or
 * picked, or a kind, then one of it, from rows of eight by kind or from everything (ほかの…を選ぶ),
 * and for an icon or letters their color, starting in [freeColor] from an emoji or a photo. Each choice is the page's at once; × closes it. Material
 * keeps a sub-edit like this one in a full-screen dialog, as Android's own pickers do.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupMarkPage(
  name: String,
  mark: GroupMarkValue,
  freeColor: Int,
  onMark: (GroupMarkValue) -> Unit,
  onClose: () -> Unit,
  shelf: PhotoShelf? = null,
) {
  val calls = LocalGroupCalls.current
  var kind by rememberSaveable { mutableStateOf<MarkKind?>(null) }
  var choosingIcon by remember { mutableStateOf(false) }
  var choosingEmoji by remember { mutableStateOf(false) }
  var photoFailed by remember { mutableStateOf(false) }
  val shown = kind ?: mark.kind
  val firstLetter = initialLetter(name)
  // The icon's or letters' color, else the one they start in.
  val color = mark.paletteColor ?: freeColor
  Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
    val bar = TopAppBarDefaults.pinnedScrollBehavior()
    Scaffold(
      Modifier.fillMaxSize().nestedScroll(bar.nestedScrollConnection),
      topBar = {
        TopAppBar(
          scrollBehavior = bar,
          title = { Text(stringResource(R.string.group_mark)) },
          navigationIcon = {
            IconButton(onClick = onClose) {
              Icon(painterResource(R.drawable.ic_close), contentDescription = stringResource(R.string.close))
            }
          },
        )
      },
    ) { padding ->
      Column(Modifier.verticalScroll(rememberScrollState()).padding(padding).padding(bottom = 24.dp)) {
        PhotoEditor(
          label = stringResource(if (mark.photoId.isEmpty()) R.string.mark_photo_use else R.string.mark_photo_change),
          shape = PhotoCropShape.Square,
          onPhoto = { jpeg ->
            try {
              onMark(GroupMarkValue(photoId = calls.holdPhoto(jpeg)))
              kind = null
            } catch (_: java.io.IOException) {
              photoFailed = true
            }
          },
          modifier = Modifier.padding(top = 16.dp),
        ) {
          MarkFrame { GroupMarkView(mark, MarkFrameSize, shelf = shelf) }
        }
        ChoiceButtons<MarkKind?>(MarkKind.entries, shown, { it?.let { each -> stringResource(each.title) }.orEmpty() }, modifier = Modifier.padding(16.dp)) { kind = it }
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          when (shown) {
            null -> Unit
            MarkKind.Emoji -> {
              MarkChoiceGrid(withPicked(ReadyPatterns.groupMarkEmojis, mark.emoji), mark.emoji, { it }, { onMark(GroupMarkValue(emoji = it)) }) {
                Text(it, fontSize = with(LocalDensity.current) { 26.dp.toSp() })
              }
              TextButton(onClick = { choosingEmoji = true }) { Text(stringResource(R.string.mark_more_emoji)) }
            }
            MarkKind.Icon -> {
              MarkChoiceGrid(
                withPicked(ReadyPatterns.groupMarkIcons, mark.icon),
                mark.icon,
                { MarkIconNames.names[it] ?: it },
                { onMark(GroupMarkValue(icon = it, color = color)) },
              ) {
                GroupMarkView(GroupMarkValue(icon = it, color = color), 22.dp, bare = true)
              }
              TextButton(onClick = { choosingIcon = true }) { Text(stringResource(R.string.mark_more_icons)) }
            }
            MarkKind.Letter ->
              MarkLetterField(mark.letter.ifEmpty { firstLetter }, TextLimits.groupMark) { onMark(GroupMarkValue(letter = it, color = color)) }
          }
        }
        if (shown == MarkKind.Icon || shown == MarkKind.Letter) {
          SectionHeader(stringResource(R.string.mark_color))
          MarkColorGrid(
            color,
            { slot ->
              onMark(
                if (shown == MarkKind.Icon) GroupMarkValue(icon = mark.icon.ifEmpty { ReadyPatterns.groupMarkIcons.first() }, color = slot)
                else GroupMarkValue(letter = mark.letter.ifEmpty { firstLetter }, color = slot)
              )
            },
            Modifier.padding(horizontal = 16.dp),
          )
        }
        Footnote(stringResource(R.string.group_mark_note))
      }
    }
    if (choosingIcon) {
      IconPickerSheet(
        mark.icon,
        onPick = {
          onMark(GroupMarkValue(icon = it, color = color))
          choosingIcon = false
        },
        onDismiss = { choosingIcon = false },
      ) {
        GroupMarkView(GroupMarkValue(icon = it, color = color), 24.dp, bare = true)
      }
    }
    if (choosingEmoji) {
      EmojiPickerSheet(
        onPick = {
          onMark(GroupMarkValue(emoji = it))
          choosingEmoji = false
        },
        onDismiss = { choosingEmoji = false },
      )
    }
    if (photoFailed) {
      AlertDialog(
        onDismissRequest = { photoFailed = false },
        confirmButton = { TextButton(onClick = { photoFailed = false }) { Text(stringResource(R.string.ok)) } },
        title = { Text(stringResource(R.string.mark_photo_failed)) },
        text = { Text(stringResource(R.string.try_again)) },
      )
    }
  }
}
