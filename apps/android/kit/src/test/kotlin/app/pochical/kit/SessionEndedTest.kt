package app.pochical.kit

import app.pochical.v1.DayField
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * ログアウトされています and the person's two ways out of it, もう一度つなぐ and はじめから使う
 * (spec/sync-protocol.md, Reconnecting).
 */
@RunWith(RobolectricTestRunner::class)
class SessionEndedTest {
  private val server = FakeServer()
  private val devices = mutableListOf<Device>()

  @After
  fun closeAll() {
    devices.forEach { it.close() }
    server.close()
  }

  /** A device that noted a day, sent it, and then heard the server does not know its session. */
  private suspend fun endedDevice(): Device {
    val phone = Device(server).also { devices += it }
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    phone.edits.setDay("2026-10-04", DayField.DAY_FIELD_NOTE, "残す")
    withTimeout(10_000) { phone.outboxEmptied() }
    server.token = "another"
    phone.account.background()
    withTimeout(10_000) { phone.account.userSocket.first { it == SocketState.Closed } }
    phone.account.foreground()
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SessionEnded } }
    return phone
  }

  @Test
  fun tryingAgainWhileTheServerStillDoesNotKnowTheSessionEndsItAgain() = runBlocking<Unit> {
    val phone = endedDevice()
    val refused = server.refusedSockets.get()

    phone.account.tryAgain()

    eventually { server.refusedSockets.get() > refused }
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SessionEnded } }
    assertEquals(StoredSession("token-1", "user-1", ended = true), phone.sessions.read())
    assertEquals("残す", phone.note("2026-10-04"))
    assertEquals("no new anonymous user", 1, server.signIns.get())
  }

  @Test
  fun tryingAgainOnceTheServerKnowsTheSessionAgainReconnectsAsTheSameUser() = runBlocking<Unit> {
    val phone = endedDevice()
    server.token = "token-1"

    phone.account.tryAgain()

    withTimeout(10_000) { phone.current() }
    assertEquals(AccountState.SignedIn("user-1", linked = null), phone.account.state.value)
    assertEquals(StoredSession("token-1", "user-1"), phone.sessions.read())
    assertEquals("残す", phone.note("2026-10-04"))
    assertEquals(1, server.signIns.get())
    val again = SyncAccount(phone.database, phone.sessions, server.url, OkHttpClient(), phone.scope)
    again.foreground()
    withTimeout(10_000) { again.state.first { it == AccountState.SignedIn("user-1", linked = null) } }
  }

  @Test
  fun startingAfreshErasesTheDeviceAndSignsInAsSomeoneNew() = runBlocking<Unit> {
    val phone = endedDevice()

    phone.account.startAfresh()

    withTimeout(10_000) { phone.account.state.first { it is AccountState.SignedIn } }
    assertEquals(AccountState.SignedIn("user-2", linked = null), phone.account.state.value)
    assertNull(phone.note("2026-10-04"))
    assertEquals(StoredSession("token-2", "user-2"), phone.sessions.read())
    assertEquals("not said as a deletion", 0, phone.account.deleted.value)
    assertTrue("nothing deleted on the server", server.deleted.isEmpty())
  }

  @Test
  fun anAppEndedWhileStartingAfreshGoesOnAsLettingTheSessionGo() = runBlocking<Unit> {
    val phone = endedDevice()
    phone.kept.writable = false
    phone.account.startAfresh()
    val failed = AccountState.Erasing(AccountState.Erasing.Why.SignedOut, failed = true)
    withTimeout(10_000) { phone.account.state.first { it == failed } }
    // Ended there: the database is erased, the store still keeps the ended session.
    phone.scope.coroutineContext[Job]!!.cancelChildren()
    assertNull(phone.note("2026-10-04"))
    assertEquals(StoredSession("token-1", "user-1", ended = true), phone.sessions.read())

    val again = SyncAccount(phone.database, phone.sessions, server.url, OkHttpClient(), phone.scope)
    again.foreground()
    withTimeout(10_000) { again.state.first { it == failed } }
    phone.kept.writable = true
    again.eraseAgain()

    withTimeout(10_000) { again.state.first { it is AccountState.SignedIn } }
    assertEquals(AccountState.SignedIn("user-2", linked = null), again.state.value)
    assertEquals(0, again.deleted.value)
  }

  @Test
  fun neitherWayOutChangesADeviceSignedIn() = runBlocking<Unit> {
    val phone = Device(server).also { devices += it }
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    phone.edits.setDay("2026-10-04", DayField.DAY_FIELD_NOTE, "残す")

    phone.account.startAfresh()
    phone.account.tryAgain()
    delay(500)

    assertEquals(AccountState.SignedIn("user-1", linked = null), phone.account.state.value)
    assertEquals("残す", phone.note("2026-10-04"))
    assertEquals(StoredSession("token-1", "user-1"), phone.sessions.read())
  }
}
