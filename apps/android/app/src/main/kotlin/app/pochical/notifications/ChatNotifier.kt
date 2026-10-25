package app.pochical.notifications

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.activity.compose.LocalActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.LocusIdCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import app.pochical.MainActivity
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.kit.AppLink
import app.pochical.kit.ChatWithdrawal
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.Localized
import app.pochical.kit.NotifiedLine
import app.pochical.kit.PushedAlert
import app.pochical.kit.withdrawn
import app.pochical.kit.GroupRow
import app.pochical.kit.ReadState
import app.pochical.kit.readNotified
import androidx.core.app.RemoteInput
import androidx.core.content.pm.ShortcutInfoCompat
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.util.MissingFormatArgumentException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

/**
 * The chats' notifications (spec/chat.md, Notifications), as the server pushes them: shown as
 * Android shows a conversation, one notification a chat whose messages stack in it, each from its
 * writer; a tap opening the chat; and those of lines read taken back. One for anyone but the user
 * the device is signed in as shows nothing, and neither does one of the chat on the screen.
 */
class ChatNotifier(
  private val context: Context,
  /** The user the device is signed in as, null for no one. */
  private val me: suspend () -> String?,
  /** Who is in a group as the device holds it, none before it has the group. */
  private val members: suspend (groupId: String) -> List<GroupMemberRow>,
  /** The group as the device holds it, null before it has it. */
  private val group: suspend (groupId: String) -> GroupRow?,
  /** The faces, the marks and the conversation shortcuts. */
  private val conversations: Conversations,
  private val now: () -> Long = System::currentTimeMillis,
) {
  private val manager = NotificationManagerCompat.from(context)

  /**
   * The notification this process last showed for each chat, until it goes: the system adds one
   * posted to its active notifications only after a moment, so a line coming at once would not
   * find the one before it there. A chat's goes as the app takes it back, as it is tapped or
   * dismissed, and with the process, after which the system's active ones are the record.
   */
  private val posted = ConcurrentHashMap<String, Notification>()

  /** The tag of the chat on the screen, in front, whose lines the person sees come there. */
  private val onScreen = AtomicReference<String?>(null)

  /**
   * What changes the notifications shown, one at a time: each reads the chat's notification as it
   * is and posts what follows from it, so a line, a withdrawal and an answer coming together never
   * post over one another.
   */
  private val lock = Any()

  /** The chats with an answer written on their notification being kept, which a read of it does not take back. */
  private val answering = mutableSetOf<String>()

  /**
   * Shows [alert], unless it is for someone else, its chat is on the screen (spec/sync-protocol.md,
   * Push), or notifications may not be shown.
   */
  suspend fun show(alert: PushedAlert) {
    val me = me() ?: return
    if (alert.recipientId != me) return
    val tag = tagOf(alert.groupId, alert.threadId)
    if (tag == onScreen.get()) return
    // Who and where, faces and marks among them, before the chat's notification is read.
    val line = line(alert, tag, me)
    synchronized(lock) { post(tag, line.after(shownOf(tag))) }
  }

  /**
   * Takes back the notifications of [withdrawal]'s chat's lines read (spec/vectors/chat.json,
   * withdrawn): the chat's notification goes once none of its lines is left unread.
   */
  fun withdraw(withdrawal: ChatWithdrawal): Boolean =
    synchronized(lock) {
      val tag = tagOf(withdrawal.groupId, withdrawal.threadId)
      val shown = shownOf(tag) ?: return false
      val lines = shown.seqs.mapIndexed { index, seq -> NotifiedLine(index.toString(), withdrawal.groupId, withdrawal.threadId, seq) }
      takeBack(tag, shown, withdrawn(lines, withdrawal.groupId, withdrawal.threadId, withdrawal.readTo).map(String::toInt).toSet())
    }

  /**
   * Takes back the notifications of lines [read] says are read, should no withdrawal have reached
   * the device (spec/vectors/chat.json, readNotified): at or before the user's own read mark, or
   * all of a chat with nothing unread left. One being answered is left to its answer.
   */
  fun withdrawRead(read: ReadState) =
    synchronized(lock) {
      val tags = (posted.keys + manager.activeNotifications.filter { it.id == ID }.mapNotNull { it.tag }).distinct() - answering
      val shown = tags.mapNotNull { tag -> shownOf(tag)?.let { tag to it } }.toMap()
      val lines =
        shown.flatMap { (tag, chat) -> chat.seqs.mapIndexed { index, seq -> NotifiedLine("$tag$LINE$index", chat.groupId, chat.threadId, seq) } }
      readNotified(lines, read)
        .groupBy({ it.substringBefore(LINE) }, { it.substringAfter(LINE).toInt() })
        .forEach { (tag, gone) -> takeBack(tag, shown.getValue(tag), gone.toSet()) }
    }

  /** Takes the lines [gone], by their place in it, out of the chat [tag]'s notification [shown]; whether any went. */
  private fun takeBack(tag: String, shown: Shown, gone: Set<Int>): Boolean {
    if (gone.isEmpty()) return false
    if (gone.size == shown.seqs.size) {
      cancel(tag)
      return true
    }
    post(tag, again(shown, shown.seqs.indices.filter { it !in gone }))
    return true
  }

  /**
   * An answer is being written to the chat's notification and kept: until [replied], [notSent] or
   * [restore] says how it went, a read of it does not take the notification back.
   */
  fun answering(groupId: String, threadId: String) {
    synchronized(lock) { answering += tagOf(groupId, threadId) }
  }

  /**
   * An answer [words] written on the chat's notification and kept: its lines are read, so none is
   * left to take back, and it shows the answer as the user's message, as Android's messaging apps
   * do. Android keeps a notification answered on until the person lets it go (Android 15's
   * lifetime extension by direct reply), so the app shows it answered rather than taking it back.
   */
  fun replied(groupId: String, threadId: String, words: String) {
    val tag = tagOf(groupId, threadId)
    synchronized(lock) {
      answering -= tag
      val shown = shownOf(tag) ?: return
      // From the user, whom the style names.
      post(tag, again(shown, shown.seqs.indices.toList(), NotificationCompat.MessagingStyle.Message(words, now(), null as Person?)))
    }
  }

  /**
   * The chat's notification shown again as it was, as an answer written on it that sent nothing
   * leaves it (the system shows it as on its way until the app posts it again).
   */
  fun restore(groupId: String, threadId: String) {
    val tag = tagOf(groupId, threadId)
    synchronized(lock) {
      answering -= tag
      val shown = shownOf(tag) ?: return
      post(tag, again(shown, shown.seqs.indices.toList()))
    }
  }

  /**
   * An answer the device could not keep: the chat's notification again, saying so with [words] over
   * its lines, to be answered again (spec/chat.md, Notifications).
   */
  fun notSent(groupId: String, threadId: String, words: String) {
    val tag = tagOf(groupId, threadId)
    synchronized(lock) {
      answering -= tag
      val shown = shownOf(tag) ?: return
      post(tag, again(shown, shown.seqs.indices.toList(), saying = context.getString(R.string.push_reply_not_sent, words)))
    }
  }

  /**
   * The chat's notification [shown] again, as it was rather than as a line come in: the lines
   * [kept], by their place in it, then [added] (the user's answer, which takes nothing back), and
   * [saying] over them, or nothing a notification shown before said there.
   */
  private fun again(shown: Shown, kept: List<Int>, added: NotificationCompat.MessagingStyle.Message? = null, saying: String? = null): Notification {
    val builder =
      NotificationCompat.Builder(context, shown.notification)
        .addExtras(seqsOf(if (added == null) kept.map(shown.seqs::get) else emptyList()))
        .setSubText(saying)
        .setOnlyAlertOnce(true)
    shown.style?.let { style ->
      val after =
        NotificationCompat.MessagingStyle(style.user).setConversationTitle(style.conversationTitle).setGroupConversation(style.isGroupConversation)
      kept.map(shown.messages::get).forEach(after::addMessage)
      added?.let(after::addMessage)
      builder.setStyle(after)
    }
    return builder.build()
  }

  /** The chat is on the screen, in front, until [offScreen]: its lines are not notified. */
  fun onScreen(groupId: String, threadId: String) = onScreen.set(tagOf(groupId, threadId))

  /** The chat left the screen, or the app the front. */
  fun offScreen(groupId: String, threadId: String) {
    val tag = tagOf(groupId, threadId)
    // By its words, not its reference, which compareAndSet would go by.
    onScreen.updateAndGet { if (it == tag) null else it }
  }

  /** The chat's notification was tapped, opening it: it goes, as the system's auto cancel would. */
  fun opened(groupId: String, threadId: String) = synchronized(lock) { cancel(tagOf(groupId, threadId)) }

  /** The person dismissed the chat [tag]'s notification. */
  fun dismissed(tag: String) {
    synchronized(lock) { posted.remove(tag) }
  }

  /** Takes away every notification shown, as the device lets go of the user they were for. */
  fun forgetAll() {
    synchronized(lock) {
      posted.clear()
      answering.clear()
      manager.cancelAll()
    }
    conversations.forgetAll()
  }

  /**
   * A chat's notification as it shows: the lines it holds, in order, and for a conversation its
   * style and a message for each line. Each line's seq is kept in the notification's own extras, as
   * Android keeps no extras of a message; those of the oldest messages the style let go of go too.
   */
  private class Shown(
    val notification: Notification,
    val groupId: String,
    val threadId: String,
    val seqs: List<Long>,
    val style: NotificationCompat.MessagingStyle?,
    val messages: List<NotificationCompat.MessagingStyle.Message>,
  )

  /** The chat [tag]'s notification shown, if any. */
  private fun shownOf(tag: String): Shown? {
    val notification =
      posted[tag] ?: manager.activeNotifications.find { it.tag == tag && it.id == ID }?.notification ?: return null
    val seqs = notification.extras.getLongArray(SEQS)?.toList().orEmpty()
    val groupId = notification.extras.getString(EXTRA_GROUP_ID) ?: return null
    val threadId = notification.extras.getString(EXTRA_THREAD_ID) ?: return null
    val style =
      NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification)
        ?: return Shown(notification, groupId, threadId, seqs, null, emptyList())
    val held = minOf(seqs.size, style.messages.size)
    return Shown(notification, groupId, threadId, seqs.takeLast(held), style, style.messages.takeLast(held))
  }

  /** What a chat's notification keeps of its own: its chat, and its lines' seqs in order. */
  private fun extrasOf(groupId: String, threadId: String, seqs: List<Long>) =
    Bundle().apply {
      putString(EXTRA_GROUP_ID, groupId)
      putString(EXTRA_THREAD_ID, threadId)
      putLongArray(SEQS, seqs.toLongArray())
    }

  private fun seqsOf(seqs: List<Long>) = Bundle().apply { putLongArray(SEQS, seqs.toLongArray()) }

  /**
   * A chat line's notification as it follows the one the chat shows ([Line.after]): from its writer
   * as the group shows them, and for the group's chat in the group's name, its words then worded as
   * a one-to-one chat's, as the system shows who wrote them.
   */
  private suspend fun line(alert: PushedAlert, tag: String, me: String): Line = coroutineScope {
    // The chat with Pochical's people is a conversation of two, with them under the chat's own
    // name, as 設定's row names it, and the app's icon (spec/chat.md, The chat with Pochical's people).
    val support = alert.groupId == Chat.supportPlace
    val inGroup = !support && alert.body.key.startsWith(GROUP_KEY)
    val kind = alert.body.key.removePrefix(GROUP_KEY).removePrefix(KEY)
    val held = members(alert.groupId)
    val authorId = alert.line?.authorId.orEmpty()
    val writerRow = held.find { it.userId == authorId }
    val writerName =
      when {
        support -> worded(alert.title)
        else -> writerRow?.displayName ?: (if (inGroup) alert.body.args else alert.title.args).firstOrNull().orEmpty()
      }
    val words = worded(Localized(KEY + kind, if (inGroup) alert.body.args.drop(1) else alert.body.args))
    val mine = held.find { it.userId == me }
    // The style takes no user without a name: one the group does not name yet is あなた.
    val userName = mine?.displayName?.takeIf { it.isNotBlank() } ?: context.getString(R.string.push_me)
    val heldGroup = if (inGroup) group(alert.groupId) else null
    // The faces and the mark together, each within the time a photo may take, so one wait bounds them all.
    val userFace = async { conversations.face(userName, mine?.photoId.orEmpty(), alert.groupId) }
    val writerFace = async { if (support) conversations.appFace() else conversations.face(writerName, writerRow?.photoId.orEmpty(), alert.groupId) }
    val mark = async { heldGroup?.let { conversations.mark(it.mark, it.name, it.id) } }
    val user = Person.Builder().setKey(me).setName(userName).setIcon(userFace.await()).build()
    val writer = Person.Builder().setKey(authorId).setName(writerName).setIcon(writerFace.await()).build()
    val title = if (inGroup) worded(alert.title) else null
    // The chat as one of Android's conversations: the group's chat under the group's mark, a
    // one-to-one chat, and Pochical's people's, under the other's face.
    val shortcut =
      conversations.publish(
        tag,
        title ?: writerName,
        mark.await() ?: writerFace.await(),
        if (inGroup) emptyList() else listOf(writer),
        openingIntent(alert.groupId, alert.threadId),
      )
    Line(alert, tag, if (support) Channels.SUPPORT else Channels.CHAT, user, writer, words, title, inGroup, shortcut)
  }

  /** A line come in, ready to show after what the chat's notification shows. */
  private inner class Line(
    val alert: PushedAlert,
    val tag: String,
    val channel: String,
    val user: Person,
    val writer: Person,
    val words: String,
    val title: String?,
    val inGroup: Boolean,
    val shortcut: ShortcutInfoCompat,
  ) {
    /** The chat's notification with this line's message added to those [before] shows. */
    fun after(before: Shown?): Notification {
      val style = NotificationCompat.MessagingStyle(user).setGroupConversation(inGroup).setConversationTitle(title)
      before?.messages?.forEach(style::addMessage)
      style.addMessage(NotificationCompat.MessagingStyle.Message(words, now(), writer))
      return NotificationCompat.Builder(context, channel)
        .setSmallIcon(R.drawable.ic_notification)
        .setStyle(style)
        .setShortcutInfo(shortcut)
        .addExtras(extrasOf(alert.groupId, alert.threadId, before?.seqs.orEmpty() + (alert.line?.seq ?: 0)))
        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        .setContentIntent(opening(alert))
        .setDeleteIntent(dismissing(tag))
        .apply { alert.line?.let { addAction(replying(alert.groupId, alert.threadId, it.seq)) } }
        .build()
    }
  }

  /**
   * What a tap opens: the app at the notification's chat ([openedChat]), at ここから新着 as from the
   * chat list, one intent a chat, telling it to let the notification go.
   */
  private fun opening(alert: PushedAlert): PendingIntent =
    PendingIntent.getActivity(
      context,
      0,
      openingIntent(alert.groupId, alert.threadId),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  /** The intent that opens the app at the chat ([openedChat]), from its notification or its conversation shortcut. */
  private fun openingIntent(groupId: String, threadId: String): Intent =
    Intent(context, MainActivity::class.java)
      .setAction(ACTION_OPEN_CHAT)
      .setIdentifier(tagOf(groupId, threadId))
      .putExtra(EXTRA_GROUP_ID, groupId)
      .putExtra(EXTRA_THREAD_ID, threadId)

  /**
   * 返信 on a line's notification (spec/chat.md, Notifications): the words written on it, answering
   * the chat's latest line [seq] the notification shows, handled without opening the app
   * ([ChatReply]). Mutable, as the system fills in the words.
   */
  private fun replying(groupId: String, threadId: String, seq: Long): NotificationCompat.Action {
    val intent =
      PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, ChatReply::class.java)
          .setIdentifier(tagOf(groupId, threadId))
          .putExtra(EXTRA_GROUP_ID, groupId)
          .putExtra(EXTRA_THREAD_ID, threadId)
          .putExtra(EXTRA_SEQ, seq),
        PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    val input = RemoteInput.Builder(REPLY).setLabel(context.getString(R.string.push_reply_hint)).build()
    return NotificationCompat.Action.Builder(R.drawable.ic_notification, context.getString(R.string.push_reply), intent)
      .addRemoteInput(input)
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
      .setShowsUserInterface(false)
      .build()
  }

  /** What the system tells the app as the person dismisses the chat [tag]'s notification. */
  private fun dismissing(tag: String): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, NotificationDismissed::class.java).setIdentifier(tag).putExtra(EXTRA_TAG, tag),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  /** The words the server sent, put together from the app's strings; its arguments alone for a key this app does not know. */
  private fun worded(localized: Localized): String {
    val id = WORDS[localized.key] ?: return localized.args.joinToString(" ")
    return try {
      context.getString(id, *localized.args.toTypedArray())
    } catch (e: MissingFormatArgumentException) {
      localized.args.joinToString(" ")
    }
  }

  /** Shows [notification] as the chat [tag]'s, while the system lets the app notify. */
  private fun post(tag: String, notification: Notification) {
    if (manager.postIfAllowed(context, tag, ID, notification)) posted[tag] = notification
  }

  private fun cancel(tag: String) {
    posted.remove(tag)
    manager.cancel(tag, ID)
  }

  companion object {
    /** Each chat's one notification, told apart by its tag. */
    private const val ID = 1

    /** Where the notification keeps its lines' seqs, for taking them back once read. */
    private const val SEQS = "app.pochical.seqs"

    private const val KEY = "CHAT_"
    private const val GROUP_KEY = "CHAT_GROUP_"

    /** The intent a notification's tap opens the app with. */
    const val ACTION_OPEN_CHAT = "app.pochical.OPEN_CHAT"
    const val EXTRA_GROUP_ID = "groupId"
    const val EXTRA_THREAD_ID = "threadId"

    /** The chat's tag in the intent saying its notification was dismissed. */
    const val EXTRA_TAG = "tag"

    /** The line a notification's 返信 answers, and the words written on it. */
    const val EXTRA_SEQ = "seq"
    const val REPLY = "reply"

    /** Between a notification's tag and a line's place in it, as [withdrawRead] tells them apart. */
    private const val LINE = "\n"

    /** A chat's notification's tag. */
    fun tagOf(groupId: String, threadId: String) = "$groupId/$threadId"

    /** The chat a notification's tap opens the app at, if [intent] is one's. */
    fun openedChat(intent: Intent): AppLink.Chat? {
      if (intent.action != ACTION_OPEN_CHAT) return null
      val groupId = intent.getStringExtra(EXTRA_GROUP_ID)?.takeIf { it.isNotEmpty() } ?: return null
      return AppLink.Chat(groupId, intent.getStringExtra(EXTRA_THREAD_ID) ?: return null)
    }

    /** The strings each key the server sends is worded with (spec/sync-protocol.md, Push). */
    private val WORDS =
      mapOf(
        "CHAT_TITLE" to R.string.push_text,
        "CHAT_TEXT" to R.string.push_text,
        "CHAT_PHOTO" to R.string.push_chat_photo,
        "CHAT_DAYS" to R.string.push_chat_days,
        "CHAT_POLL" to R.string.push_chat_poll,
        "CHAT_GROUP_TEXT" to R.string.push_chat_group_text,
        "CHAT_GROUP_PHOTO" to R.string.push_chat_group_photo,
        "CHAT_GROUP_DAYS" to R.string.push_chat_group_days,
        "CHAT_GROUP_POLL" to R.string.push_chat_group_poll,
        "SUPPORT_TITLE" to R.string.push_support_title,
      )
  }
}

/** The chats' notifications, for a chat's screen to say it is on the screen; none in previews. */
val LocalChatNotifier = staticCompositionLocalOf<ChatNotifier?> { null }

/**
 * Tells the notifications that the chat is on the screen while this page is in front, so its lines
 * are not notified as the person sees them come: resumed, and its window focused. A page over it or
 * another app pauses it; the system's shade, or a window over it, leaves it resumed but takes the
 * focus.
 */
@Composable
fun ShowingChat(groupId: String, threadId: String) {
  val notifier = LocalChatNotifier.current ?: return
  val focused = LocalWindowInfo.current.isWindowFocused
  val activity = LocalActivity.current
  LifecycleResumeEffect(notifier, groupId, threadId, focused, activity) {
    if (focused) notifier.onScreen(groupId, threadId)
    // The conversation shown, for the system to tie to its shortcut and notification (LocusId).
    activity?.let { ActivityCompat.setLocusContext(it, LocusIdCompat(ChatNotifier.tagOf(groupId, threadId)), null) }
    onPauseOrDispose {
      notifier.offScreen(groupId, threadId)
      activity?.let { ActivityCompat.setLocusContext(it, null, null) }
    }
  }
}
