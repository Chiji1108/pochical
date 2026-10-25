package app.pochical.notifications

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pochical.kit.PochicalKit
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The server's FCM messages handed to the app on a device as FCM hands them, worded as
 * apps/server/src/fcm.ts words them, for the user the app is signed in as and the first of their
 * groups: the lines stack in the chat's one notification, and a read takes back those it reached.
 * The notification is left in the shade, to look at and tap. Run on an emulator signed in, with a
 * group: `./gradlew :app:connectedDebugAndroidTest`. CI does not run it.
 */
@RunWith(AndroidJUnit4::class)
class PushDeliveryTest {
  private val app = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
  private val push = (app as Push.Holder).push
  private val kit = (app as PochicalKit.Holder).pochicalKit

  @Test
  fun aGroupChatsLinesStackAndAReadTakesThemBack() = runBlocking {
    val me = kit.database.owner() ?: error("Sign the app in first")
    val group = kit.database.values().groups().first().firstOrNull() ?: error("Make a group first")
    val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    // From the start, whatever an earlier run left.
    manager.cancelAll()
    val line = { seq: Int, body: String ->
      mapOf(
        "alert" to
          """{"title":{"key":"CHAT_TITLE","args":["${group.name}"]},"body":$body,"groupId":"${group.id}",""" +
            """"threadId":"group","line":{"authorId":"writer","seq":$seq},"badge":$seq,"recipientId":"$me"}"""
      )
    }
    for (data in
      listOf(
        line(2, """{"key":"CHAT_GROUP_TEXT","args":["さくら","今週どう？"]}"""),
        line(3, """{"key":"CHAT_GROUP_TEXT","args":["さくら","土曜とか"]}"""),
        line(4, """{"key":"CHAT_GROUP_PHOTO","args":["さくら"]}"""),
      )) {
      push.handle(RemoteMessage.Builder("test@fcm.googleapis.com").setData(data).build().data)
    }
    push.handle(mapOf("withdraw" to """{"groupId":"${group.id}","threadId":"group","readTo":2}"""))

    val shown = manager.activeNotifications.single { it.tag == "${group.id}/group" }
    val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(shown.notification)!!
    assertEquals(group.name, style.conversationTitle)
    assertEquals(listOf("土曜とか", "写真を送りました"), style.messages.map { it.text.toString() })
  }

  /**
   * A line of the first group's chat from another member, and an answer from Pochical's people,
   * left in the shade for a tap to open each chat (spec/chat.md, Notifications).
   */
  @Test
  fun aGroupChatsLineAndAnAnswerToTap() = runBlocking {
    val me = kit.database.owner() ?: error("Sign the app in first")
    val group = kit.database.values().groups().first().firstOrNull() ?: error("Join a group first")
    val writer = kit.database.values().members(group.id).first().first { it.userId != me }
    val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancelAll()
    push.handle(
      mapOf(
        "alert" to
          """{"title":{"key":"CHAT_TITLE","args":["${group.name}"]},"body":{"key":"CHAT_GROUP_TEXT","args":["${writer.displayName}","今週どう？"]},""" +
            """"groupId":"${group.id}","threadId":"group","line":{"authorId":"${writer.userId}","seq":2},"badge":1,"recipientId":"$me"}"""
      )
    )
    push.handle(
      mapOf(
        "alert" to
          """{"title":{"key":"SUPPORT_TITLE","args":[]},"body":{"key":"CHAT_TEXT","args":["ありがとうございます。直しました"]},""" +
            """"groupId":"support","threadId":"group","line":{"authorId":"pochical","seq":2},"badge":2,"recipientId":"$me"}"""
      )
    )
    assertEquals(setOf("${group.id}/group", "support/group"), manager.activeNotifications.map { it.tag }.toSet())
  }
}
