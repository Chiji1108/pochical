package app.pochical.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.design.Radius
import app.pochical.kit.ChatLine

// The pinned lines over a chat (spec/chat.md, Pins; /design's PinBar), as iOS's PinBar.swift: the
// latest on a card under the header, a tap going to it; with more than one, ▾ opening all of them
// inside the card, each with who wrote it. A long press offers ピン留めを外す, as a line's long press
// opens its menu; no × in sight, as a pin is everyone's.

/**
 * The card of pins floating `chatRules.pinMargin` from the screen's sides and from the header, the
 * lines scrolling on under it: Material's surface where iOS draws glass.
 */
@Composable
fun PinBar(pins: List<ChatLine>, nameOf: (String) -> String, onJump: (Long) -> Unit, onUnpin: (Long) -> Unit, modifier: Modifier = Modifier) {
  val latest = pins.firstOrNull() ?: return
  val colors = LocalThemeColors.current
  val many = pins.size > 1
  var open by rememberSaveable { mutableStateOf(false) }
  Surface(
    modifier.fillMaxWidth().padding(horizontal = Chat.pinMargin.dp).padding(top = Chat.pinMargin.dp),
    shape = RoundedCornerShape(Radius.xxl),
    color = MaterialTheme.colorScheme.surfaceContainerHigh,
    shadowElevation = 2.dp,
  ) {
    Column(Modifier.padding(vertical = 4.dp)) {
      Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        PinItem(latest, Modifier.weight(1f), onJump, onUnpin) {
          Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(painterResource(R.drawable.ic_push_pin), contentDescription = null, Modifier.size(20.dp), tint = colors.accentDefault)
            Column(Modifier.padding(start = 12.dp)) {
              Text(
                if (many) stringResource(R.string.chat_pins_many, pins.size) else stringResource(R.string.chat_pinned),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = colors.accentDefault,
              )
              PinWords(latest, nameOf)
            }
          }
        }
        if (many) {
          val label = stringResource(if (open) R.string.chat_pins_close else R.string.chat_pins_open)
          IconButton(onClick = { open = !open }, Modifier.semantics { contentDescription = label }) {
            Icon(painterResource(R.drawable.ic_expand_more), contentDescription = null, Modifier.rotate(if (open) 180f else 0f), tint = colors.textSecondary)
          }
        }
      }
      // All of them, the latest first, inside the card, which grows to hold them.
      AnimatedVisibility(many && open, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
        Column {
          HorizontalDivider(color = colors.separator)
          for (line in pins) {
            PinItem(line, Modifier.fillMaxWidth().padding(horizontal = 8.dp), onJump = { open = false; onJump(it) }, onUnpin) {
              Column {
                Text(nameOf(line.authorId), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = colors.accentDefault)
                PinWords(line, nameOf)
              }
            }
          }
        }
      }
    }
  }
}

/** A pin a tap goes to, its long press offering ピン留めを外す. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PinItem(line: ChatLine, modifier: Modifier, onJump: (Long) -> Unit, onUnpin: (Long) -> Unit, content: @Composable () -> Unit) {
  var menu by remember { mutableStateOf(false) }
  val hint = stringResource(R.string.chat_pin_hint)
  Box(modifier) {
    Box(
      Modifier.fillMaxWidth()
        .combinedClickable(onClickLabel = hint, onLongClick = { menu = true }, onClick = { onJump(line.seq) })
        .padding(8.dp)
    ) {
      content()
    }
    DropdownMenu(menu, onDismissRequest = { menu = false }) {
      DropdownMenuItem(
        text = { Text(stringResource(R.string.chat_unpin)) },
        leadingIcon = { Icon(painterResource(R.drawable.ic_keep_off), contentDescription = null) },
        onClick = {
          menu = false
          onUnpin(line.seq)
        },
      )
    }
  }
}

/** A pinned line's words on one line, its mentions as names. */
@Composable
private fun PinWords(line: ChatLine, nameOf: (String) -> String) {
  Text(
    lineWords(line.content, nameOf).replace('\n', ' '),
    style = MaterialTheme.typography.bodyMedium,
    color = LocalThemeColors.current.textPrimary,
    maxLines = 1,
    overflow = TextOverflow.Ellipsis,
  )
}
