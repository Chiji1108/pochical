package app.pochical.chat

import androidx.annotation.StringRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.design.Radius
import app.pochical.design.TextLimits
import app.pochical.kit.KeptDraft
import app.pochical.kit.PickedMember
import app.pochical.kit.Writing
import app.pochical.groups.LocalGroupCalls
import app.pochical.kit.fitsText
import app.pochical.kit.keepsPreview
import app.pochical.kit.previewLink
import app.pochical.kit.site
import app.pochical.v1.LinkPreview
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * What the chat's composer holds, kept across a rotation and the process's death: what is written
 * and the line it answers or changes (`Writing`), and the field's focus, which 返信 and 編集 take.
 * Photos and days come with #827 and the day sheet.
 */
@Stable
class ComposerState(writing: Writing<Nothing>, tookDraft: Boolean) {
  var writing by mutableStateOf(writing)

  /** Only once the chat's draft was read is what the composer holds the draft. */
  var tookDraft by mutableStateOf(tookDraft)
  val focus = FocusRequester()

  /** Each time 返信 or 編集 asks for the keyboard, which comes up even while the field keeps its focus. */
  var keyboardAsked by mutableIntStateOf(0)
    private set

  /** 返信: the line [seq] quoted over the composer, which takes the keyboard. */
  fun answer(seq: Long) {
    writing = writing.answer(seq)
    keyboardAsked++
  }

  /** 編集: the line [seq]'s words ([text], as sent) alone in the composer, which takes the keyboard. */
  fun change(seq: Long, text: String, nameOf: (String) -> String) {
    writing = writing.change(seq, text, nameOf)
    keyboardAsked++
  }

  companion object {
    val Saver: Saver<ComposerState, Any> =
      Saver(
        save = { state ->
          val w = state.writing
          listOf(w.text, w.replyTo ?: -1L, w.editing ?: -1L, w.picked.flatMap { listOf(it.id, it.name) }, state.tookDraft, w.previewRemoved.orEmpty())
        },
        restore = { saved ->
          val list = saved as List<*>
          val picked = (list[3] as List<*>).chunked(2).map { PickedMember(it[0] as String, it[1] as String) }
          val writing =
            Writing<Nothing>(
              text = list[0] as String,
              picked = picked,
              replyTo = (list[1] as Long).takeIf { it >= 0 },
              editing = (list[2] as Long).takeIf { it >= 0 },
              // × holds until the line is sent, across a rotation too.
              previewRemoved = (list[5] as String).takeIf { it.isNotEmpty() },
            )
          ComposerState(writing, list[4] as Boolean)
        },
      )
  }
}

@Composable
fun rememberComposerState(): ComposerState = rememberSaveable(saver = ComposerState.Saver) { ComposerState(Writing(), tookDraft = false) }

/**
 * The chat's composer (spec/chat.md, Photos; Drafts; Replies; Editing and unsending): Material's own
 * field and send at the lines' foot, rising with the keyboard, under the bar of the line it answers
 * (〇〇に返信) or changes (メッセージを編集), whose × stops it; while changing a line the send is ✓.
 * What is written is the chat's draft, kept on the device as the writing pauses, as the composer
 * empties and as the chat is left; while it holds words, the others hear the member is writing, at
 * most every `chatRules.typingSendMs`. Mentions' list, photos and days (＋) come with #827 and later.
 */
@Composable
fun Composer(
  state: ComposerState,
  groupId: String,
  threadId: String,
  quote: LineQuote?,
  nameOf: (String) -> String,
  /** The members' names are read, for a draft's mentions to be named. */
  namesKnown: Boolean,
  /** The words of the line being changed, as sent; null while answering or writing anew. */
  editedWords: String?,
  onTyping: (Boolean) -> Unit,
  onSent: () -> Unit,
  onNotKept: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val chats = LocalChats.current
  val scope = rememberCoroutineScope()
  val writing = state.writing
  val currentNameOf by rememberUpdatedState(nameOf)
  val keyboard = LocalSoftwareKeyboardController.current
  LaunchedEffect(state.keyboardAsked) {
    if (state.keyboardAsked == 0) return@LaunchedEffect
    state.focus.requestFocus()
    keyboard?.show()
  }
  // The draft taken once, as the chat opens and the names its mentions are written with are known;
  // after a rotation the composer keeps its own.
  LaunchedEffect(namesKnown) {
    if (state.tookDraft || !namesKnown) return@LaunchedEffect
    if (state.writing.text.isEmpty()) {
      chats.draft(groupId, threadId)?.let { state.writing = Writing.of(it.text, currentNameOf, it.replyTo, it.editing) }
    }
    state.tookDraft = true
  }
  val kept = KeptDraft(writing.sent, writing.replyTo, writing.editing)
  // Kept once the writing pauses, and at once as the composer empties.
  LaunchedEffect(kept) {
    if (!state.tookDraft) return@LaunchedEffect
    if (kept.text.isNotEmpty()) delay(Chat.draftSettleMs.toLong())
    runCatching { chats.keepDraft(groupId, threadId, kept) }
  }
  val leaving by rememberUpdatedState(kept)
  val leftNotKept by rememberUpdatedState(onNotKept)
  // Only once the draft was read: before, an empty composer would take its place.
  LifecycleEventEffect(Lifecycle.Event.ON_STOP) { if (state.tookDraft) chats.keepDraftLeaving(groupId, threadId, leaving, leftNotKept) }
  DisposableEffect(groupId, threadId) {
    onDispose { if (state.tookDraft) chats.keepDraftLeaving(groupId, threadId, leaving, leftNotKept) }
  }

  // Writing, said again every typingSendMs while words are there; stopped as they go, as the line is sent and as the chat closes.
  val text = writing.text
  var typingSaidAt by remember { mutableLongStateOf(0L) }
  val typing by rememberUpdatedState(onTyping)
  LaunchedEffect(text.isEmpty()) {
    if (text.isEmpty()) {
      if (typingSaidAt != 0L) typing(false)
      typingSaidAt = 0L
    }
  }
  LaunchedEffect(text) {
    val now = System.currentTimeMillis()
    if (text.isNotEmpty() && now - typingSaidAt >= Chat.typingSendMs) {
      typing(true)
      typingSaidAt = now
    }
  }
  DisposableEffect(Unit) { onDispose { if (typingSaidAt != 0L) typing(false) } }

  val editing = writing.editing
  val sendable = fitsText(writing.sent, TextLimits.chatMessage)

  // The page of the first link written, asked for once the link has stayed the same for
  // chatRules.linkPreviewSettleMs, and shown over the composer until × takes it off; none while an
  // edit keeps its line's first link, whose page stays (spec/chat.md, Previews).
  val calls = LocalGroupCalls.current
  val link = previewLink(writing.sent)?.takeIf { editedWords == null || !keepsPreview(editedWords, writing.sent) }
  val pages = remember { LinkPages() }
  LaunchedEffect(link) {
    if (link == null || pages.answered(link)) return@LaunchedEffect
    delay(Chat.linkPreviewSettleMs.toLong())
    pages.ask(link, calls::linkPreview)
  }
  val page = link?.takeIf { it != writing.previewRemoved }?.let(pages::page)
  // Shown while asked (読み込み中…), and once a page came; kept as it goes, so it leaves whole.
  val showsPage = link != null && link != writing.previewRemoved && (pages.asking == link || page != null)
  var pageShown by remember { mutableStateOf<Pair<String, LinkPreview?>?>(null) }
  if (showsPage && link != null) pageShown = link to page
  Surface(modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surfaceContainer) {
    Column(Modifier.navigationBarsPadding()) {
      val editingWords = stringResource(R.string.chat_editing)
      val bar =
        when {
          editing != null -> Bar(editingWords, null, R.string.chat_stop_editing)
          quote != null -> Bar(quote.writer?.let { stringResource(R.string.chat_replying_to, it) } ?: stringResource(R.string.chat_replying), quote.words, R.string.chat_stop_replying)
          else -> null
        }
      // The bar last shown, kept as it goes so it leaves whole.
      var shown by remember { mutableStateOf(bar) }
      if (bar != null) shown = bar
      AnimatedVisibility(bar != null) {
        shown?.let { ComposerBar(it.title, it.words, stringResource(it.stop)) { state.writing = state.writing.stop() } }
      }
      AnimatedVisibility(showsPage) {
        pageShown?.let { (url, shownPage) ->
          // The page's own site's name once it came, as the line will show it.
          ComposerPreview(shownPage?.site ?: site(url), shownPage) { state.writing = state.writing.copy(previewRemoved = url) }
        }
      }
      Row(Modifier.padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.Bottom) {
        OutlinedTextField(
          value = text,
          onValueChange = { state.writing = state.writing.copy(text = it) },
          modifier = Modifier.weight(1f).focusRequester(state.focus),
          placeholder = { Text(stringResource(R.string.chat_message)) },
          maxLines = COMPOSER_LINES,
          shape = RoundedCornerShape(Radius.xxl),
        )
        FilledIconButton(
          onClick = {
            // Gone from the composer as it is sent, so a second tap sends nothing and the chat left
            // meanwhile keeps no draft of words sent.
            val going = state.writing
            state.writing = Writing()
            scope.launch {
              try {
                // Kept though the chat is left meanwhile: what was written is no longer in the
                // composer to be kept as its draft.
                withContext(NonCancellable) {
                  val seq = going.editing
                  val words = going.sent
                  // The page as it came for the words' first link, or none taken off with ×.
                  val sentLink = previewLink(words)
                  val removed = sentLink != null && sentLink == going.previewRemoved
                  val sentPage = sentLink?.takeIf { !removed }?.let(pages::page)
                  if (seq != null) chats.change(groupId, threadId, seq, words, sentPage)
                  else chats.send(groupId, threadId, words, going.replyTo, sentPage, withoutPreview = removed)
                }
              } catch (e: CancellationException) {
                throw e
              } catch (_: Exception) {
                // Not kept: what was written comes back, to send again.
                if (state.writing.text.isEmpty()) state.writing = going
                onNotKept()
                return@launch
              }
              if (going.editing == null) onSent()
            }
          },
          enabled = sendable,
          modifier = Modifier.padding(start = 8.dp, bottom = 4.dp),
        ) {
          if (editing != null) Icon(painterResource(R.drawable.ic_check), stringResource(R.string.chat_save))
          else Icon(painterResource(R.drawable.ic_send), stringResource(R.string.chat_send))
        }
      }
    }
  }
}

/**
 * The bar over the composer for the line it answers or changes: what it is ([title]), the line in
 * one line of words, and × ([stop]) to stop. Read as one, its × apart (spec/chat.md, Screen readers).
 */
@Composable
private fun ComposerBar(title: String, words: String?, stop: String, onStop: () -> Unit) {
  val colors = LocalThemeColors.current
  Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 4.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
    val said = listOfNotNull(title, words).joinToString("、")
    Column(Modifier.weight(1f).clearAndSetSemantics { contentDescription = said }) {
      Text(title, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = colors.accentDefault, maxLines = 1)
      if (words != null) {
        Text(words, style = MaterialTheme.typography.bodySmall, color = colors.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    }
    IconButton(onClick = onStop, Modifier.semantics { contentDescription = stop }) {
      Icon(painterResource(R.drawable.ic_close), contentDescription = null, Modifier.size(20.dp))
    }
  }
}

/**
 * The pages of the links written, as the server answered for them (a page, or none), and the link
 * asked for now. Only an answer is kept: a request cut short (the link changed meanwhile) leaves
 * nothing behind, and is asked again should the link come back.
 */
@Stable
class LinkPages {
  private val answers = mutableStateMapOf<String, LinkPreview?>()

  /** The link being asked for now, its page shown as 読み込み中… meanwhile. */
  var asking by mutableStateOf<String?>(null)
    private set

  fun answered(link: String): Boolean = link in answers

  fun page(link: String): LinkPreview? = answers[link]

  /** Asks [fetch] for [link]'s page; a failure is an answer of none, as the server reads the page itself once it has the line. */
  suspend fun ask(link: String, fetch: suspend (String) -> LinkPreview?) {
    asking = link
    try {
      answers[link] =
        try {
          fetch(link)
        } catch (e: CancellationException) {
          throw e
        } catch (_: Exception) {
          null
        }
    } finally {
      if (asking == link) asking = null
    }
  }
}

/** What the bar over the composer says: what it is, the line in one line of words, and its ×. */
private data class Bar(val title: String, val words: String?, @param:StringRes val stop: Int)

/** The most lines the field grows to before its words scroll. */
private const val COMPOSER_LINES = 6
