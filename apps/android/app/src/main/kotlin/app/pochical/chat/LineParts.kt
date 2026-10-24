package app.pochical.chat

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import app.pochical.R
import app.pochical.kit.LineReaction
import app.pochical.kit.WaitingLine
import app.pochical.kit.site
import app.pochical.v1.LinkPreview

// The parts a message shows besides its words (spec/chat.md, In a message; Screen readers): each
// is drawn from its line's parts and declares in the same place what a screen reader does with
// it, so a line read as one element offers everything a finger does on its parts. A new part is
// one more of these, its actions with it.

/** Something a message shows besides its words, with what a screen reader does with it. */
sealed interface LinePart {
  /** Its actions as its line's (spec/chat.md, Screen readers), in the order the spec gives them. */
  @Composable fun actions(line: PartLine): List<CustomAccessibilityAction>
}

/** What a part's actions act on: the line's seq (null for one on its way), what the chat does, and its menu. */
class PartLine(val seq: Long?, val handlers: MessageHandlers, val openMenu: () -> Unit)

/**
 * The line's reactions under its bubble: リアクション, which opens the bar and menu over the chat,
 * each reaction put on or taken off, and who chose each, which the pill's long press lists. A sent
 * line has this part though none is on it yet; a line on its way takes none.
 */
data class ReactionsPart(val reactions: List<LineReaction>, val counted: Boolean) : LinePart {
  @Composable
  override fun actions(line: PartLine): List<CustomAccessibilityAction> {
    val seq = line.seq ?: return emptyList()
    val handlers = line.handlers
    val bar = stringResource(R.string.chat_reaction)
    val on = stringResource(R.string.chat_reaction_on)
    val off = stringResource(R.string.chat_reaction_off)
    val choosers = stringResource(R.string.chat_reaction_choosers)
    return listOf(CustomAccessibilityAction(bar) { line.openMenu(); true }) +
      reactions.map { reaction ->
        val own = handlers.me in reaction.userIds
        CustomAccessibilityAction((if (own) off else on).format(reaction.emoji)) { handlers.react(seq, reaction.emoji, !own); true }
      } +
      reactions.map { reaction -> CustomAccessibilityAction(choosers.format(reaction.emoji)) { handlers.choosers(reaction); true } }
  }
}

/**
 * A line's photos, [count] of them: while they go up ([waiting] still being sent and not yet past
 * stopping), 送信をやめる, which × in their rings offers.
 */
data class PhotosPart(val count: Int, val waiting: WaitingLine?) : LinePart {
  @Composable
  override fun actions(line: PartLine): List<CustomAccessibilityAction> {
    val waiting = waiting?.takeIf { !it.failed && !it.sending } ?: return emptyList()
    val stop = stringResource(R.string.chat_photo_stop)
    return listOf(CustomAccessibilityAction(stop) { line.handlers.stopSending(waiting.opId); true })
  }
}

/** The line a reply answers, quoted inside its bubble: 返信元を表示 goes to it. */
data class QuotePart(val quote: LineQuote) : LinePart {
  @Composable
  override fun actions(line: PartLine): List<CustomAccessibilityAction> {
    val label = stringResource(R.string.chat_show_quoted)
    return listOf(CustomAccessibilityAction(label) { line.handlers.jump(quote.seq); true })
  }
}

/** The links in the line's words: リンクを開く with each one's site, one for each even to one site. */
data class LinksPart(val urls: List<String>) : LinePart {
  @Composable
  override fun actions(line: PartLine): List<CustomAccessibilityAction> {
    val label = stringResource(R.string.chat_open_link)
    return urls.map { url -> CustomAccessibilityAction(label.format(site(url))) { line.handlers.openLink(url); true } }
  }
}

/**
 * The page of the words' first link, inside the bubble under them: a tap on it opens that link,
 * which [LinksPart] already offers as リンクを開く, so it offers it again only when its link is not
 * among the words' (a page kept by an edit whose words lost it does not happen: the page goes too).
 */
data class PagePart(val preview: LinkPreview, val inWords: Boolean) : LinePart {
  @Composable
  override fun actions(line: PartLine): List<CustomAccessibilityAction> {
    if (inWords) return emptyList()
    val label = stringResource(R.string.chat_open_link)
    return listOf(CustomAccessibilityAction(label.format(site(preview.url))) { line.handlers.openLink(preview.url); true })
  }
}
