package app.pochical.kit

import kotlinx.serialization.Serializable
import org.junit.Test

/** spec/vectors/unread.json: what notifies, and how 設定 › 通知 › チャット says so. */
class UnreadVectorsTest {
  @Serializable
  data class UnreadVectors(val notificationsSummary: List<Summary>) {
    @Serializable data class SummaryGroup(val muted: Boolean, val directMuted: Boolean)

    @Serializable
    data class Summary(override val name: String, val allowed: Boolean, val groups: List<SummaryGroup>, val expected: String) :
      VectorCase
  }

  private val unread = vectors<UnreadVectors>("unread")

  @Test
  fun theChatNotificationsRowSaysWhatTheVectorsSay() =
    unread.notificationsSummary.checkEach({ it.expected }) { case ->
      val muted =
        case.groups.withIndex().flatMap { (index, group) ->
          listOfNotNull(
            ChatKey("g$index", GROUP_THREAD).takeIf { group.muted },
            ChatKey("g$index", "direct:a:b").takeIf { group.directMuted },
          )
        }
      val summary = chatNotificationsSummary(case.groups.indices.map { "g$it" }, ChatNotificationState(muted.toSet()), case.allowed)
      // As the app words it.
      when (summary) {
        ChatNotificationsSummary.On -> "オン"
        ChatNotificationsSummary.Off -> "オフ"
        is ChatNotificationsSummary.Groups -> "${summary.count}グループ"
      }
    }
}
