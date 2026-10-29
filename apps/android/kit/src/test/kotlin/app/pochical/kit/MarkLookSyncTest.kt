package app.pochical.kit

import app.pochical.v1.MarkLook
import app.pochical.v1.change
import app.pochical.v1.LookPreference
import app.pochical.v1.markLook
import app.pochical.v1.profile
import java.io.IOException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@Serializable
private data class MarkLookVectors(val markLookToSend: List<Case>) {
  @Serializable data class Shape(val style: String, val fill: Boolean)

  @Serializable
  data class Case(override val name: String, val look: Shape?, val said: Shape?, val expected: Shape?) : VectorCase
}

private fun MarkLookVectors.Shape.message(): MarkLook = markLook {
  style = this@message.style
  fill = this@message.fill
}

@RunWith(RobolectricTestRunner::class)
class MarkLookSyncTest {
  @Test
  fun theLookToSendToTheAccount() =
    vectors<MarkLookVectors>("preferences").markLookToSend.checkEach({ it.expected?.message() }) { case ->
      val database = testDatabase()
      try {
        runBlocking {
          database.write {
            case.look?.let { look ->
              // The app's default look but for its shape and fill.
              val message = LookPreference.parseFrom(DeviceSettings().preferences.getValue("look")).toBuilder().setStyle(look.style).setFill(look.fill)
              upsert(PreferenceRow("look", message.build().toByteArray()))
            }
            case.said?.let { said -> take(listOf(change { profile = profile { markLook = said.message() } })) }
          }
          val look = accountLook(database.values().preferences().first().associate { it.key to it.value })
          markLookToSend(look, database.values().profile().first())
        }
      } finally {
        database.close()
      }
    }

  @Test
  fun theShapeGoesOnceTheSocketCaughtUpAndAgainEachTimeTillItIsTaken() = runTest {
    val look = MutableStateFlow<Look?>(Look(style = MarkStyle.Badge))
    val profile = MutableStateFlow<ProfileRow?>(null)
    val socket = MutableStateFlow<SocketState>(SocketState.CatchingUp(1))
    val sent = mutableListOf<MarkLook>()
    val badge = markLook { style = "badge"; fill = true }
    backgroundScope.syncMarkLook(look, profile, socket) {
      sent += it
      throw IOException("offline")
    }
    runCurrent()
    // Not before the account's word is taken.
    assertEquals(emptyList<MarkLook>(), sent)
    socket.value = SocketState.Current
    runCurrent()
    assertEquals(listOf(badge), sent)
    // Not taken: again as the socket catches up next.
    socket.value = SocketState.Waiting(1)
    runCurrent()
    socket.value = SocketState.Current
    runCurrent()
    assertEquals(listOf(badge, badge), sent)
    // The account's word coming back clears it, and nothing goes as the socket catches up again.
    profile.value = ProfileRow(name = "", photoId = "", markStyle = "badge", markFill = true)
    socket.value = SocketState.Waiting(1)
    runCurrent()
    socket.value = SocketState.Current
    runCurrent()
    assertEquals(listOf(badge, badge), sent)
  }
}
