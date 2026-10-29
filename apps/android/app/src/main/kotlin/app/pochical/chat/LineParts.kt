package app.pochical.chat

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import app.pochical.R
import app.pochical.kit.GroupMemberRow
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
class PartLine(val seq: Long?, val handlers: MessageHandlers, val openMenu: () -> Unit, val writerId: String? = null)

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
 * A line's photos, [count] of them: once sent, 写真を開く (the first of several); while they go up ([waiting] still being sent and not yet past stopping), 送信をやめる, which × in their rings
 * offers.
 */
data class PhotosPart(val count: Int, val waiting: WaitingLine?) : LinePart {
  @Composable
  override fun actions(line: PartLine): List<CustomAccessibilityAction> {
    val stop = stringResource(R.string.chat_photo_stop)
    val open = stringResource(R.string.chat_photo_open)
    val seq = line.seq
    // A sent line's photos open large, the first of several, from where it swipes on to the rest.
    if (seq != null) return listOf(CustomAccessibilityAction(open) { line.handlers.openPhoto(seq, 0); true })
    val going = waiting?.takeIf { !it.failed && !it.sending } ?: return emptyList()
    return listOf(CustomAccessibilityAction(stop) { line.handlers.stopSending(going.opId); true })
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
    return urls.zip(linkNames(urls)).map { (url, name) -> CustomAccessibilityAction(label.format(name)) { line.handlers.openLink(url); true } }
  }
}

/**
 * How each of a line's links is named in its リンクを開く: by its site, and whole but its scheme when
 * another link of the line is to the same site, so each is told apart; one written twice is named
 * alike, as it opens the same page.
 */
fun linkNames(urls: List<String>): List<String> {
  val sites = urls.map(::site)
  return urls.mapIndexed { index, url ->
    val shared = urls.indices.any { other -> sites[other] == sites[index] && urls[other] != url }
    if (shared) url.substringAfter("://").removePrefix("www.") else sites[index]
  }
}

/**
 * The members the line's words mention, in order: 〇〇のプロフィール for each, as a tap on the mention
 * opens it, but the reader's own and a deleted account's, which open none (spec/chat.md, Mentions).
 */
data class MentionsPart(val userIds: List<String>) : LinePart {
  @Composable
  override fun actions(line: PartLine): List<CustomAccessibilityAction> {
    // The writer mentioning themselves: their profile is the line's own action already.
    return mentioned(userIds, line.handlers).filter { it.userId != line.writerId }.map { member ->
      CustomAccessibilityAction(stringResource(R.string.chat_writer_profile, member.shownName())) { line.handlers.openProfile?.invoke(member); true }
    }
  }
}

/** The members of [userIds] whose profile a mention of them opens: not the reader, nor one deleted, and only where profiles open. */
fun mentioned(userIds: List<String>, handlers: MessageHandlers): List<GroupMemberRow> = userIds.distinct().mapNotNull { handlers.profileOf(handlers.writers[it]) }

/**
 * The card of Pochical's invitation the words' first link is, in its page's place (spec/chat.md,
 * Pochical's invitation links): its link is among the words', whose リンクを開く opens its join
 * screen, so it offers nothing more.
 */
data class InvitePart(val code: String) : LinePart {
  @Composable override fun actions(line: PartLine): List<CustomAccessibilityAction> = emptyList()
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
