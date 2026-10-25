package app.pochical.kit

import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// What the server pushes to an Android phone through FCM (spec/sync-protocol.md, Push): data alone,
// which the app words and shows itself, and the notifications a read takes back (spec/chat.md,
// Notifications).

/** Words the app puts together itself, from a key in its strings and the arguments. */
@Serializable data class Localized(val key: String, val args: List<String>)

/** A notification as the server words it: `data.alert`. */
@Serializable
data class PushedAlert(
  val title: Localized,
  val body: Localized,
  /** The chat it opens, and stacks with: a group's, or the chat with Pochical's people. */
  val groupId: String,
  val threadId: String,
  /** The line, for its writer and for taking it back once read; an answer from Pochical's people's too. */
  val line: Line? = null,
  /** The user's unread lines as what notifies, in every group. */
  val badge: Int = 0,
  /** Whom it is for: the device shows it only while signed in as them. */
  val recipientId: String,
) {
  @Serializable data class Line(val authorId: String, val seq: Long)
}

/** A chat read up to [readTo] on another of the user's devices: `data.withdraw`. */
@Serializable data class ChatWithdrawal(val groupId: String, val threadId: String, val readTo: Long)

/** What a push from the server says. */
sealed interface Pushed {
  data class Alert(val alert: PushedAlert) : Pushed

  data class Withdraw(val withdrawal: ChatWithdrawal) : Pushed
}

private val pushJson = Json { ignoreUnknownKeys = true }

/** What an FCM message's [data] says; null for data the server does not send. */
fun pushedOf(data: Map<String, String>): Pushed? =
  try {
    data["alert"]?.let { Pushed.Alert(pushJson.decodeFromString(it)) }
      ?: data["withdraw"]?.let { Pushed.Withdraw(pushJson.decodeFromString(it)) }
  } catch (e: SerializationException) {
    null
  } catch (e: IllegalArgumentException) {
    null
  }

/** A chat line's notification the device has shown: which chat and line it is of. */
data class NotifiedLine(val id: String, val groupId: String, val threadId: String, val seq: Long)

/**
 * The ids of the notifications shown that a read of one chat takes back, in the order shown: that
 * chat's lines at or before [readTo], all of them when null, the chat having nothing unread left
 * (spec/vectors/chat.json, withdrawn).
 */
fun withdrawn(shown: List<NotifiedLine>, groupId: String, threadId: String, readTo: Long?): List<String> =
  shown.filter { it.groupId == groupId && it.threadId == threadId && it.seq <= (readTo ?: Long.MAX_VALUE) }.map { it.id }
