package app.pochical.notifications

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import app.pochical.MainActivity
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.kit.ChatWithdrawal
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.Localized
import app.pochical.kit.NotifiedLine
import app.pochical.kit.PushedAlert
import app.pochical.kit.withdrawn
import java.util.MissingFormatArgumentException

/**
 * The chats' notifications (spec/chat.md, Notifications), as the server pushes them: shown as
 * Android shows a conversation, one notification a chat whose messages stack in it, each from its
 * writer; a tap opening the chat's place; and those of lines read taken back. One for anyone but
 * the user the device is signed in as shows nothing.
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

  /** Shows [alert], unless it is for someone else or notifications may not be shown. */
  suspend fun show(alert: PushedAlert) {
    val me = me() ?: return
    if (alert.recipientId != me) return
    val notification = if (alert.groupId == Chat.supportPlace) answer(alert) else line(alert, me)
    post(tagOf(alert.groupId, alert.threadId), notification)
  }

  /**
   * Takes back the notifications of [withdrawal]'s chat's lines read (spec/vectors/chat.json,
   * withdrawn): the chat's notification goes once none of its lines is left unread.
   */
  fun withdraw(withdrawal: ChatWithdrawal) {
    val tag = tagOf(withdrawal.groupId, withdrawal.threadId)
    val shown = shownOf(tag) ?: return
    val lines =
      shown.lines.mapIndexed { index, (_, seq) -> NotifiedLine(index.toString(), withdrawal.groupId, withdrawal.threadId, seq) }
    val gone = withdrawn(lines, withdrawal.groupId, withdrawal.threadId, withdrawal.readTo).toSet()
    if (gone.isEmpty()) return
    val left = shown.lines.filterIndexed { index, _ -> index.toString() !in gone }
    if (left.isEmpty()) {
      manager.cancel(tag, ID)
      return
    }
    val after =
      NotificationCompat.MessagingStyle(shown.style.user)
        .setConversationTitle(shown.style.conversationTitle)
        .setGroupConversation(shown.style.isGroupConversation)
    left.forEach { (message, _) -> after.addMessage(message) }
    // What is left as it was, not as a line come in.
    post(
      tag,
      NotificationCompat.Builder(context, shown.notification)
        .setStyle(after)
        .addExtras(seqsOf(left))
        .setOnlyAlertOnce(true)
        .build(),
    )
  }

  /** A chat's notification as it shows: its messages, each with its line's seq. */
  private class Shown(
    val notification: Notification,
    val style: NotificationCompat.MessagingStyle,
    val lines: List<Pair<NotificationCompat.MessagingStyle.Message, Long>>,
  )

  /**
   * The chat [tag]'s notification shown, if any. Each message's line is kept in the notification's
   * own extras, in the messages' order, as Android keeps no extras of a message: those of the
   * oldest messages the style let go of are let go of too.
   */
  private fun shownOf(tag: String): Shown? {
    val notification = manager.activeNotifications.find { it.tag == tag && it.id == ID }?.notification ?: return null
    val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification) ?: return null
    val seqs = notification.extras.getLongArray(SEQS)?.toList().orEmpty().takeLast(style.messages.size)
    return Shown(notification, style, style.messages.takeLast(seqs.size).zip(seqs))
  }

  private fun seqsOf(lines: List<Pair<NotificationCompat.MessagingStyle.Message, Long>>) =
    Bundle().apply { putLongArray(SEQS, lines.map { it.second }.toLongArray()) }

  /**
   * A chat line's notification, its message added to those the chat's shows already: from its
   * writer as the group shows them, and for the group's chat in the group's name, its words then
   * worded as a one-to-one chat's, as the system shows who wrote them.
   */
  private suspend fun line(alert: PushedAlert, me: String): Notification {
    val tag = tagOf(alert.groupId, alert.threadId)
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
    val lines = shownOf(tag)?.lines.orEmpty() + (NotificationCompat.MessagingStyle.Message(words, now(), writer) to (alert.line?.seq ?: 0))
    val style =
      NotificationCompat.MessagingStyle(user)
        .setGroupConversation(inGroup)
        .setConversationTitle(if (inGroup) worded(alert.title) else null)
    lines.forEach { (message, _) -> style.addMessage(message) }
    return NotificationCompat.Builder(context, Channels.CHAT)
      .setSmallIcon(R.drawable.ic_notification)
      .setStyle(style)
      .addExtras(seqsOf(lines))
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setNumber(alert.badge)
      .setAutoCancel(true)
      .setContentIntent(opening(alert))
      .build()
  }

  /**
   * An answer from Pochical's people: a plain notification, titled with the chat as 設定's row names
   * it, as only they write there (spec/chat.md, The chat with Pochical's people).
   */
  private fun answer(alert: PushedAlert): Notification {
    val words = worded(alert.body)
    return NotificationCompat.Builder(context, Channels.SUPPORT)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(worded(alert.title))
      .setContentText(words)
      .setStyle(NotificationCompat.BigTextStyle().bigText(words))
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setNumber(alert.badge)
      .setAutoCancel(true)
      .setContentIntent(opening(alert))
      .build()
  }

  /** What a tap opens: the app at the notification's chat (OpenedLinks). */
  private fun opening(alert: PushedAlert): PendingIntent =
    PendingIntent.getActivity(
      context,
      tagOf(alert.groupId, alert.threadId).hashCode(),
      Intent(context, MainActivity::class.java)
        .setAction(ACTION_OPEN_CHAT)
        .putExtra(EXTRA_GROUP_ID, alert.groupId)
        .putExtra(EXTRA_THREAD_ID, alert.threadId),
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
    if (
      !manager.areNotificationsEnabled() ||
        (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
          ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
    ) {
      return
    }
    manager.notify(tag, ID, notification)
  }

  companion object {
    /** Each chat's one notification, told apart by its tag. */
    private const val ID = 1

    /** Where the notification keeps its messages' lines, for taking them back once read. */
    private const val SEQS = "app.pochical.seqs"

    private const val KEY = "CHAT_"
    private const val GROUP_KEY = "CHAT_GROUP_"

    /** The intent a notification's tap opens the app with. */
    const val ACTION_OPEN_CHAT = "app.pochical.OPEN_CHAT"
    const val EXTRA_GROUP_ID = "groupId"
    const val EXTRA_THREAD_ID = "threadId"

    /** A chat's notification's tag. */
    fun tagOf(groupId: String, threadId: String) = "$groupId/$threadId"

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
