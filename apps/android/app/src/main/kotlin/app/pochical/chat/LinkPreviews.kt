package app.pochical.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.design.Radius
import app.pochical.groups.PhotoPicture
import app.pochical.kit.PhotoShelf
import app.pochical.openLink
import app.pochical.v1.LinkPreview

// A link's page (spec/chat.md, Previews; /design's LinkPreview): inside a message's bubble under its
// words, and over the composer while it is written, as iOS's LinkPreviewViews.swift draws them.

/**
 * A line's page inside its bubble, under its words: the picture cropped to
 * `chatRules.linkPreviewAspect`, the title in two lines at most and the site's name. A tap opens the
 * link; a long press is the bubble's, opening its reactions and menu.
 */
@Composable
fun PreviewCard(preview: LinkPreview, ink: Color, onOpen: () -> Unit) {
  val open by rememberUpdatedState(onOpen)
  // Read with its line, by its title.
  Column(Modifier.fillMaxWidth().pointerInput(Unit) { detectTapGestures(onTap = { open() }) }.clearAndSetSemantics {}) {
    if (preview.imageId.isNotEmpty()) {
      PhotoPicture(preview.imageId, PhotoShelf.Previews, Modifier.fillMaxWidth().aspectRatio(Chat.linkPreviewAspect.toFloat()))
    }
    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
      Text(preview.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
      Text(preview.site, style = MaterialTheme.typography.labelSmall, color = ink.copy(alpha = 0.7f), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
  }
}

/**
 * The page of the link being written, over the composer: its site, its title (読み込み中… until it
 * comes) and its picture small at the end, with × to send without it.
 */
@Composable
fun ComposerPreview(site: String, preview: LinkPreview?, onRemove: () -> Unit) {
  val colors = LocalThemeColors.current
  val title = preview?.title ?: stringResource(R.string.chat_preview_loading)
  val remove = stringResource(R.string.chat_preview_remove)
  Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 4.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
      Text(site, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = colors.accentDefault, maxLines = 1)
      Text(title, style = MaterialTheme.typography.bodySmall, color = colors.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    val image = preview?.imageId.orEmpty()
    if (image.isNotEmpty()) {
      Box(Modifier.padding(start = 8.dp).size(40.dp).clip(RoundedCornerShape(Radius.sm)).background(colors.fillTertiary)) {
        PhotoPicture(image, PhotoShelf.Previews, Modifier.size(40.dp))
      }
    }
    IconButton(onClick = onRemove, Modifier.semantics { contentDescription = remove }) {
      Icon(painterResource(R.drawable.ic_close), contentDescription = null, Modifier.size(20.dp))
    }
  }
}

/** Opens [url] from a composable. */
@Composable
fun rememberLinkOpener(): (String) -> Unit {
  val context = LocalContext.current
  return { url -> openLink(context, url) }
}
