package app.pochical.kit

/** A chat, by its group (or place) and thread. */
data class ChatKey(val groupId: String, val threadId: String)

/**
 * The user's chat notifications (spec/chat.md, Notifications), as their User DO sends them: the
 * chats turned off, and メンションはいつも通知, on until the user turns it off.
 */
data class ChatNotificationState(val muted: Set<ChatKey> = emptySet(), val mentionsWhenMuted: Boolean = true) {
  fun isMuted(groupId: String, threadId: String) = ChatKey(groupId, threadId) in muted

  companion object {
    /** As the database holds it. */
    fun of(mutes: List<ChatMuteRow>, settings: ChatNotificationSettingsRow?) =
      ChatNotificationState(mutes.mapTo(HashSet()) { ChatKey(it.groupId, it.threadId) }, settings?.mentionsWhenMuted ?: true)
  }
}

/**
 * How many of a chat's unread lines notify, from the count of them and of their mentions of the
 * reader: all of them in a chat that is on; in one turned off only the mentions, and those only
 * while メンションはいつも通知 is on (spec/chat.md, Unread lines; spec/vectors/unread.json, notifying).
 */
fun notifyingCount(count: Int, mentions: Int, muted: Boolean, mentionsWhenMuted: Boolean): Int =
  when {
    !muted -> count
    mentionsWhenMuted -> mentions
    else -> 0
  }

/** How many of others' unread lines, by their [words], notify [me] (`notifyingCount`). */
fun notifyingUnread(words: List<String>, muted: Boolean, mentionsWhenMuted: Boolean, me: String): Int =
  notifyingCount(words.size, words.count { me in mentions(it) }, muted, mentionsWhenMuted)

/** 設定 › 通知 › チャット's value. */
sealed interface ChatNotificationsSummary {
  /** Every group's chat notifies. */
  data object On : ChatNotificationsSummary

  /** None does, or the app may not notify. */
  data object Off : ChatNotificationsSummary

  /** Some groups' chats do: Nグループ. */
  data class Groups(val count: Int) : ChatNotificationsSummary
}

/**
 * 設定 › 通知 › チャット's value for the user's groups [groupIds], as the app may notify ([allowed])
 * or not (spec/vectors/unread.json, notificationsSummary): a one-to-one chat turned off counts for
 * nothing.
 */
fun chatNotificationsSummary(groupIds: List<String>, notifications: ChatNotificationState, allowed: Boolean): ChatNotificationsSummary {
  val heard = groupIds.count { !notifications.isMuted(it, GROUP_THREAD) }
  return when {
    !allowed || heard == 0 -> ChatNotificationsSummary.Off
    heard == groupIds.size -> ChatNotificationsSummary.On
    else -> ChatNotificationsSummary.Groups(heard)
  }
}
