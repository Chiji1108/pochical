package app.pochical.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateMapOf
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
import app.pochical.groups.GroupMarkView
import app.pochical.groups.PhotoPicture
import app.pochical.kit.InviteDetails
import app.pochical.kit.InviteFailure
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

/** What the server said of an invitation's group as the chat showed it. */
sealed interface InviteAnswer {
  data class Group(val details: InviteDetails) : InviteAnswer

  /** No group uses the code: remade since, or the group is gone. */
  data object Unusable : InviteAnswer
}

/**
 * The groups of the invitations a chat's lines carry, as the server answered for them while the
 * chat is open (`GroupService.GetInvite`), each asked once however many lines and drawings show
 * it. Only an answer is kept: one that failed (offline, the server failing) is asked again as the
 * chat's socket next catches up.
 */
@Stable
class InviteCards {
  private val answers = mutableStateMapOf<String, InviteAnswer>()
  private val asking = mutableSetOf<String>()

  fun answer(code: String): InviteAnswer? = answers[code]

  suspend fun ask(code: String, fetch: suspend (String) -> InviteDetails) {
    if (code in answers || !asking.add(code)) return
    try {
      answers[code] = InviteAnswer.Group(fetch(code))
    } catch (e: InviteFailure) {
      if (e.reason == InviteFailure.Reason.Unusable) answers[code] = InviteAnswer.Unusable
    } finally {
      asking.remove(code)
    }
  }
}

/** An invitation's card as a screen reader reads it with its line: the group and how it stands. */
@Composable
fun inviteWords(answer: InviteAnswer?): String? =
  when (answer) {
    null -> null
    InviteAnswer.Unusable -> stringResource(R.string.chat_invite_unusable)
    is InviteAnswer.Group ->
      "${answer.details.name}、" +
        if (answer.details.alreadyMember) stringResource(R.string.chat_invite_joined) else stringResource(R.string.chat_invite_members, answer.details.members.size)
  }

/**
 * One of Pochical's invitations under a message's words (spec/chat.md, Pochical's invitation links;
 * /design's InviteCard), as iOS's InviteCard: the group as it is now ([answer], asked as the
 * message shows), so a remade link or a deleted group reads この招待は使えません and a renamed group
 * its new name; 読み込み中… until it is answered. A tap opens the join screen, or the group once in
 * it; a long press is the line's. Read with its line ([inviteWords]).
 */
@Composable
fun InviteCard(code: String, answer: InviteAnswer?, modifier: Modifier = Modifier, onOpen: () -> Unit) = CardScale {
  val colors = LocalThemeColors.current
  val open by rememberUpdatedState(onOpen)
  val unusable = answer == InviteAnswer.Unusable
  val shown = (answer as? InviteAnswer.Group)?.details
  val shape = RoundedCornerShape(Radius.md)
  Row(
    modifier
      .fillMaxWidth()
      .background(colors.backgroundCard, shape)
      .border(1.dp, colors.borderDefault, shape)
      // A tap, not a button, so the long press stays the line's.
      .pointerInput(unusable) { detectTapGestures(onTap = { if (!unusable) open() }) }
      .clearAndSetSemantics {}
      .padding(horizontal = 12.dp, vertical = 10.dp),
    horizontalArrangement = Arrangement.spacedBy(12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    // The group's mark at the hub's size, on a tint while there is none; a link's sign for one that cannot be used.
    Box(Modifier.size(MARK).clip(RoundedCornerShape(Radius.lg)).background(colors.fillQuaternary), contentAlignment = Alignment.Center) {
      when {
        shown != null -> GroupMarkView(shown.mark, MARK, shelf = PhotoShelf.Invitation(code))
        unusable -> Icon(painterResource(R.drawable.ic_link), contentDescription = null, Modifier.size(18.dp), tint = colors.textTertiary)
      }
    }
    Column(Modifier.weight(1f)) {
      Text(
        when {
          unusable -> stringResource(R.string.chat_invite_unusable)
          shown != null -> shown.name
          else -> stringResource(R.string.chat_preview_loading)
        },
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.SemiBold,
        color = colors.textPrimary,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
      )
      val under =
        when {
          unusable -> stringResource(R.string.chat_invite)
          shown == null -> null
          shown.alreadyMember -> stringResource(R.string.chat_invite_joined)
          else -> stringResource(R.string.chat_invite_members, shown.members.size)
        }
      if (under != null) Text(under, style = MaterialTheme.typography.labelSmall, color = colors.textTertiary)
    }
  }
}

/** A group's mark on an invitation's card, at the hub's size. */
private val MARK = 42.dp

/** Opens [url] from a composable. */
@Composable
fun rememberLinkOpener(): (String) -> Unit {
  val context = LocalContext.current
  return { url -> openLink(context, url) }
}
