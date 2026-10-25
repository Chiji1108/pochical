package app.pochical.notifications

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalWindowInfo
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
   * Shows [alert], unless it is for someone else, its chat is on the screen (spec/sync-protocol.md,
   * Push), or notifications may not be shown.
   */
  suspend fun show(alert: PushedAlert) {
    val me = me() ?: return
    if (alert.recipientId != me) return
    val tag = tagOf(alert.groupId, alert.threadId)
    if (tag == onScreen.get()) return
    val notification = if (alert.groupId == Chat.supportPlace) answer(alert, tag) else line(alert, tag, me)
    post(tag, notification)
  }

  /**
   * Takes back the notifications of [withdrawal]'s chat's lines read (spec/vectors/chat.json,
   * withdrawn): the chat's notification goes once none of its lines is left unread. One that shows
   * its latest line alone, an answer from Pochical's people, stays while that line is unread.
   */
  fun withdraw(withdrawal: ChatWithdrawal) {
    val tag = tagOf(withdrawal.groupId, withdrawal.threadId)
    val shown = shownOf(tag) ?: return
    val lines = shown.seqs.mapIndexed { index, seq -> NotifiedLine(index.toString(), withdrawal.groupId, withdrawal.threadId, seq) }
    val gone = withdrawn(lines, withdrawal.groupId, withdrawal.threadId, withdrawal.readTo).map(String::toInt).toSet()
    if (gone.isEmpty()) return
    if (gone.size == lines.size) {
      cancel(tag)
      return
    }
    val leftSeqs = shown.seqs.filterIndexed { index, _ -> index !in gone }
    val style = shown.style
    val builder = NotificationCompat.Builder(context, shown.notification).addExtras(seqsOf(leftSeqs))
    if (style != null) {
      val after =
        NotificationCompat.MessagingStyle(style.user)
          .setConversationTitle(style.conversationTitle)
          .setGroupConversation(style.isGroupConversation)
      shown.messages.filterIndexed { index, _ -> index !in gone }.forEach(after::addMessage)
      builder.setStyle(after)
    }
    // What is left as it was, not as a line come in.
    post(tag, builder.setOnlyAlertOnce(true).build())
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
  fun opened(groupId: String, threadId: String) = cancel(tagOf(groupId, threadId))

  /** The person dismissed the chat [tag]'s notification. */
  fun dismissed(tag: String) {
    posted.remove(tag)
  }

  /** Takes away every notification shown, as the device lets go of the user they were for. */
  fun forgetAll() {
    posted.clear()
    manager.cancelAll()
  }

  /**
   * A chat's notification as it shows: the lines it holds, in order, and for a conversation its
   * style and a message for each line. Each line's seq is kept in the notification's own extras, as
   * Android keeps no extras of a message; those of the oldest messages the style let go of go too.
   */
  private class Shown(
    val notification: Notification,
    val seqs: List<Long>,
    val style: NotificationCompat.MessagingStyle?,
    val messages: List<NotificationCompat.MessagingStyle.Message>,
  )

  /** The chat [tag]'s notification shown, if any. */
  private fun shownOf(tag: String): Shown? {
    val notification =
      posted[tag] ?: manager.activeNotifications.find { it.tag == tag && it.id == ID }?.notification ?: return null
    val seqs = notification.extras.getLongArray(SEQS)?.toList().orEmpty()
    val style =
      NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification)
        ?: return Shown(notification, seqs, null, emptyList())
    val held = minOf(seqs.size, style.messages.size)
    return Shown(notification, seqs.takeLast(held), style, style.messages.takeLast(held))
  }

  private fun seqsOf(seqs: List<Long>) = Bundle().apply { putLongArray(SEQS, seqs.toLongArray()) }

  /**
   * A chat line's notification, its message added to those the chat's shows already: from its
   * writer as the group shows them, and for the group's chat in the group's name, its words then
   * worded as a one-to-one chat's, as the system shows who wrote them.
   */
  private suspend fun line(alert: PushedAlert, tag: String, me: String): Notification {
    val inGroup = alert.body.key.startsWith(GROUP_KEY)
    val kind = alert.body.key.removePrefix(GROUP_KEY).removePrefix(KEY)
    val held = members(alert.groupId)
    val authorId = alert.line?.authorId.orEmpty()
    val writerName =
      held.find { it.userId == authorId }?.displayName
        ?: (if (inGroup) alert.body.args else alert.title.args).firstOrNull().orEmpty()
    val words = worded(Localized(KEY + kind, if (inGroup) alert.body.args.drop(1) else alert.body.args))
    val user =
      Person.Builder()
        .setKey(me)
        .setName(held.find { it.userId == me }?.displayName ?: context.getString(R.string.push_me))
        .build()
    val writer = Person.Builder().setKey(authorId).setName(writerName).build()
    val before = shownOf(tag)
    val style =
      NotificationCompat.MessagingStyle(user)
        .setGroupConversation(inGroup)
        .setConversationTitle(if (inGroup) worded(alert.title) else null)
    before?.messages?.forEach(style::addMessage)
    style.addMessage(NotificationCompat.MessagingStyle.Message(words, now(), writer))
    return NotificationCompat.Builder(context, Channels.CHAT)
      .setSmallIcon(R.drawable.ic_notification)
      .setStyle(style)
      .addExtras(seqsOf(before?.seqs.orEmpty() + (alert.line?.seq ?: 0)))
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setContentIntent(opening(alert))
      .setDeleteIntent(dismissing(tag))
      .build()
  }

  /**
   * An answer from Pochical's people: a plain notification of the latest, titled with the chat as
   * 設定's row names it, as only they write there (spec/chat.md, The chat with Pochical's people).
   * It keeps every answer's line it stands for, for a read to take it back.
   */
  private fun answer(alert: PushedAlert, tag: String): Notification {
    val words = worded(alert.body)
    return NotificationCompat.Builder(context, Channels.SUPPORT)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(worded(alert.title))
      .setContentText(words)
      .setStyle(NotificationCompat.BigTextStyle().bigText(words))
      .addExtras(seqsOf(shownOf(tag)?.seqs.orEmpty() + listOfNotNull(alert.line?.seq)))
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setContentIntent(opening(alert))
      .setDeleteIntent(dismissing(tag))
      .build()
  }

  /**
   * What a tap opens: the app at the notification's chat ([openedChat]), at ここから新着 as from the
   * chat list, one intent a chat, telling it to let the notification go.
   */
  private fun opening(alert: PushedAlert): PendingIntent =
    PendingIntent.getActivity(
      context,
      0,
      Intent(context, MainActivity::class.java)
        .setAction(ACTION_OPEN_CHAT)
        .setIdentifier(tagOf(alert.groupId, alert.threadId))
        .putExtra(EXTRA_GROUP_ID, alert.groupId)
        .putExtra(EXTRA_THREAD_ID, alert.threadId),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

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
  LifecycleResumeEffect(notifier, groupId, threadId, focused) {
    if (focused) notifier.onScreen(groupId, threadId)
    onPauseOrDispose { notifier.offScreen(groupId, threadId) }
  }
}
