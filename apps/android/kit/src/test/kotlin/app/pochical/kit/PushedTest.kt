package app.pochical.kit

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PushedTest {
  @Test
  fun aReadTakesBackWhatTheVectorsSay() =
    vectors<ChatVectors>("chat").withdrawn.checkEach({ it.expected }) { case ->
      withdrawn(
        case.shown.map { NotifiedLine(it.id, it.groupId, it.threadId, it.seq) },
        case.read.groupId,
        case.read.threadId,
        case.read.readTo,
      )
    }

  @Test
  fun aNotificationIsReadAsTheServerWordsIt() {
    // As apps/server/src/fcm.ts puts it in the message's data.
    val data =
      mapOf(
        "alert" to
          """{"title":{"key":"CHAT_TITLE","args":["いとこ会"]},"body":{"key":"CHAT_GROUP_TEXT","args":["さくら","今週どう？"]},""" +
            """"groupId":"g1","threadId":"group","line":{"authorId":"u1","seq":2},"badge":1,"recipientId":"u2"}"""
      )
    assertEquals(
      Pushed.Alert(
        PushedAlert(
          title = Localized("CHAT_TITLE", listOf("いとこ会")),
          body = Localized("CHAT_GROUP_TEXT", listOf("さくら", "今週どう？")),
          groupId = "g1",
          threadId = "group",
          line = PushedAlert.Line("u1", 2),
          badge = 1,
          recipientId = "u2",
        )
      ),
      pushedOf(data),
    )
  }

  @Test
  fun anAnswerFromPochicalsPeopleHasItsLine() {
    val data =
      mapOf(
        "alert" to
          """{"title":{"key":"SUPPORT_TITLE","args":[]},"body":{"key":"CHAT_TEXT","args":["どうぞ"]},""" +
            """"groupId":"support","threadId":"support:u2","line":{"authorId":"pochical","seq":5},"badge":0,"recipientId":"u2"}"""
      )
    assertEquals(PushedAlert.Line("pochical", 5), (pushedOf(data) as Pushed.Alert).alert.line)
  }

  @Test
  fun aWithdrawalIsReadAsTheServerSendsIt() =
    assertEquals(
      Pushed.Withdraw(ChatWithdrawal("g1", "group", 5)),
      pushedOf(mapOf("withdraw" to """{"groupId":"g1","threadId":"group","readTo":5}""")),
    )

  @Test
  fun anythingElseIsNothing() {
    assertNull(pushedOf(mapOf("other" to "{}")))
    assertNull(pushedOf(mapOf("alert" to "not json")))
  }
}
