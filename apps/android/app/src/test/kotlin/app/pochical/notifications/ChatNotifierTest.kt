package app.pochical.notifications

import android.Manifest
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import app.pochical.kit.AppLink
import app.pochical.kit.ChatWithdrawal
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.Localized
import app.pochical.kit.PushedAlert
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class ChatNotifierTest {
  private val context: Application = RuntimeEnvironment.getApplication()
  private val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  private var signedIn: String? = ME
  private val notifier =
    ChatNotifier(context, { signedIn }, { groupId -> if (groupId == GROUP) listOf(member(ME, "ゆうき"), member(WRITER, "さくら")) else emptyList() })

  @Before
  fun allow() {
    shadowOf(context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    Channels.create(context)
  }

  private fun shown() = manager.activeNotifications.toList()

  private fun messagesOf(index: Int = 0) =
    NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(shown()[index].notification)!!

  @Test
  fun aGroupChatsLineIsAMessageFromItsWriterInTheGroupsName() = runTest {
    notifier.show(groupLine(2, "今週どう？"))
    val style = messagesOf()
    assertEquals("いとこ会", style.conversationTitle)
    assertTrue(style.isGroupConversation)
    assertEquals("ゆうき", style.user.name)
    val message = style.messages.single()
    // Its words alone, as the sender shows who wrote them.
    assertEquals("今週どう？", message.text)
    assertEquals("さくら", message.person?.name)
    assertEquals(Channels.CHAT, shown().single().notification.channelId)
  }

  @Test
  fun aChatsLinesStackInItsOneNotification() = runTest {
    notifier.show(groupLine(2, "今週どう？"))
    notifier.show(groupLine(3, "土曜とか"))
    notifier.show(groupLine(4, "", kind = "PHOTO"))
    assertEquals(1, shown().size)
    assertEquals(listOf("今週どう？", "土曜とか", "写真を送りました"), messagesOf().messages.map { it.text.toString() })
  }

  @Test
  fun aOneToOneChatsLineIsFromItsWriterAlone() = runTest {
    notifier.show(
      PushedAlert(
        title = Localized("CHAT_TITLE", listOf("さくら")),
        body = Localized("CHAT_TEXT", listOf("明日あいてる？")),
        groupId = GROUP,
        threadId = "direct:$ME:$WRITER",
        line = PushedAlert.Line(WRITER, 1),
        badge = 1,
        recipientId = ME,
      )
    )
    val style = messagesOf()
    assertEquals(false, style.isGroupConversation)
    assertNull(style.conversationTitle)
    assertEquals("明日あいてる？", style.messages.single().text)
  }

  @Test
  fun aGroupTheDeviceDoesNotHoldYetShowsAsTheServerWordsIt() = runTest {
    notifier.show(groupLine(2, "はじめまして", groupId = "unknown"))
    val message = messagesOf().messages.single()
    assertEquals("さくら", message.person?.name)
    assertEquals("はじめまして", message.text)
  }

  @Test
  fun oneForSomeoneElseShowsNothing() = runTest {
    notifier.show(groupLine(2, "今週どう？", recipient = "someone-else"))
    signedIn = null
    notifier.show(groupLine(3, "まだ？"))
    assertEquals(emptyList<Any>(), shown())
  }

  @Test
  fun anAnswerFromPochicalsPeopleIsAPlainNotification() = runTest {
    notifier.show(
      PushedAlert(
        title = Localized("SUPPORT_TITLE", emptyList()),
        body = Localized("CHAT_TEXT", listOf("ありがとうございます")),
        groupId = "support",
        threadId = "support:$ME",
        recipientId = ME,
      )
    )
    val notification = shown().single().notification
    assertEquals(Channels.SUPPORT, notification.channelId)
    assertEquals("作っている人とチャット", notification.extras.getCharSequence(NotificationCompat.EXTRA_TITLE))
    assertEquals("ありがとうございます", notification.extras.getCharSequence(NotificationCompat.EXTRA_TEXT))
  }

  @Test
  fun aTapOpensTheChat() = runTest {
    notifier.show(groupLine(2, "今週どう？"))
    val opened = shadowOf(shown().single().notification.contentIntent).savedIntent
    assertEquals(ChatNotifier.ACTION_OPEN_CHAT, opened.action)
    assertEquals(GROUP, opened.getStringExtra(ChatNotifier.EXTRA_GROUP_ID))
    assertEquals("group", opened.getStringExtra(ChatNotifier.EXTRA_THREAD_ID))
    assertEquals(AppLink.Chat(GROUP, "group"), ChatNotifier.openedChat(opened))
  }

  @Test
  fun anAnswerFromPochicalsPeopleOpensTheirChat() = runTest {
    notifier.show(support(5, "ありがとうございます"))
    val opened = shadowOf(shown().single().notification.contentIntent).savedIntent
    assertEquals(AppLink.Chat("support", "support:$ME"), ChatNotifier.openedChat(opened))
  }

  @Test
  fun theChatOnTheScreenIsNotNotified() = runTest {
    notifier.onScreen(GROUP, "group")
    notifier.show(groupLine(2, "今週どう？"))
    // Another chat's lines are.
    notifier.show(groupLine(3, "まだ？", groupId = "g2"))
    assertEquals(listOf("g2/group"), shown().map { it.tag })
    // Another chat going on the screen, then leaving it, changes nothing; once it leaves, its lines are notified again.
    notifier.onScreen(GROUP, "group")
    notifier.offScreen(GROUP, "direct:$ME:$WRITER")
    notifier.show(groupLine(4, "土曜とか"))
    assertEquals(1, shown().size)
    notifier.offScreen(GROUP, "group")
    notifier.show(groupLine(5, "土曜とか"))
    assertEquals(setOf("g2/group", "$GROUP/group"), shown().map { it.tag }.toSet())
  }

  @Test
  fun aReadTakesBackItsLinesAndTheNotificationOnceNoneIsLeft() = runTest {
    notifier.show(groupLine(2, "今週どう？"))
    notifier.show(groupLine(3, "土曜とか"))
    notifier.withdraw(ChatWithdrawal(GROUP, "group", readTo = 2))
    assertEquals(listOf("土曜とか"), messagesOf().messages.map { it.text.toString() })
    // Another chat's read leaves it.
    notifier.withdraw(ChatWithdrawal(GROUP, "direct:$ME:$WRITER", readTo = 9))
    assertEquals(1, shown().size)
    notifier.withdraw(ChatWithdrawal(GROUP, "group", readTo = 3))
    assertEquals(emptyList<Any>(), shown())
  }

  @Test
  fun anAnswerFromPochicalsPeopleGoesOnceEveryAnswerIsRead() = runTest {
    notifier.show(support(5, "ありがとうございます"))
    notifier.show(support(6, "直しました"))
    notifier.withdraw(ChatWithdrawal("support", "support:$ME", readTo = 5))
    // The latest, which it shows, is still unread.
    assertEquals("直しました", shown().single().notification.extras.getCharSequence(NotificationCompat.EXTRA_TEXT))
    notifier.withdraw(ChatWithdrawal("support", "support:$ME", readTo = 6))
    assertEquals(emptyList<Any>(), shown())
  }

  @Test
  fun aChatOpenedFromItsNotificationLetsItGo() = runTest {
    notifier.show(groupLine(2, "今週どう？"))
    notifier.opened(GROUP, "group")
    assertEquals(emptyList<Any>(), shown())
    notifier.show(groupLine(3, "土曜とか"))
    assertEquals(listOf("土曜とか"), messagesOf().messages.map { it.text.toString() })
  }

  @Test
  fun aNotificationDismissedStartsAnewWithTheNextLine() = runTest {
    notifier.show(groupLine(2, "今週どう？"))
    // As the person swipes it away: the system takes it, and tells the app.
    manager.cancelAll()
    notifier.dismissed(ChatNotifier.tagOf(GROUP, "group"))
    notifier.show(groupLine(3, "土曜とか"))
    assertEquals(listOf("土曜とか"), messagesOf().messages.map { it.text.toString() })
  }

  @Test
  fun lettingGoOfTheUserTakesEveryNotificationAway() = runTest {
    notifier.show(groupLine(2, "今週どう？"))
    notifier.forgetAll()
    assertEquals(emptyList<Any>(), shown())
  }

  private fun support(seq: Long, words: String) =
    PushedAlert(
      title = Localized("SUPPORT_TITLE", emptyList()),
      body = Localized("CHAT_TEXT", listOf(words)),
      groupId = "support",
      threadId = "support:$ME",
      line = PushedAlert.Line("pochical", seq),
      recipientId = ME,
    )

  private fun groupLine(seq: Long, words: String, kind: String = "TEXT", groupId: String = GROUP, recipient: String = ME) =
    PushedAlert(
      title = Localized("CHAT_TITLE", listOf("いとこ会")),
      body = Localized("CHAT_GROUP_$kind", if (kind == "TEXT") listOf("さくら", words) else listOf("さくら")),
      groupId = groupId,
      threadId = "group",
      line = PushedAlert.Line(WRITER, seq),
      badge = seq.toInt(),
      recipientId = recipient,
    )

  private fun member(userId: String, name: String) =
    GroupMemberRow(
      groupId = GROUP,
      userId = userId,
      displayName = name,
      joinedAtMs = 0,
      left = false,
      deleted = false,
      ownName = false,
      photoId = "",
      ownPhoto = false,
      markStyle = "",
      markFill = false,
    )

  private companion object {
    const val ME = "me"
    const val WRITER = "writer"
    const val GROUP = "g1"
  }
}
