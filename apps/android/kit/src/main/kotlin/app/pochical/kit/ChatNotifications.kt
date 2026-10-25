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
