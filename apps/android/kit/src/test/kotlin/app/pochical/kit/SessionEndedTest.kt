package app.pochical.kit

import app.pochical.v1.DayField
import app.pochical.v1.SignInProvider
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
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
  fun tryingAgainWhileTheServerStillDoesNotKnowTheSessionStaysEnded() = runBlocking<Unit> {
    val phone = endedDevice()
    val refused = server.refusedSockets.get()
    val asked = server.refusedGetMes.get()
    val states = mutableListOf<AccountState>()
    val watching = phone.scope.launch(start = CoroutineStart.UNDISPATCHED) { phone.account.state.collect { states += it } }

    phone.account.tryAgain()
    watching.cancel()

    assertEquals("the server asked first", asked + 1, server.refusedGetMes.get())
    assertEquals("the app never shown", listOf(AccountState.SessionEnded), states.distinct())
    assertEquals("no socket tried", refused, server.refusedSockets.get())
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
    val again = SyncAccount(phone.database, phone.sessions, server.url, OkHttpClient(), phone.scope, linePhotos = phone.linePhotos)
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
  fun signingInToTheAccountAfterStartingAfreshBringsItsDataBack() = runBlocking<Unit> {
    val phone = endedDevice()
    phone.account.startAfresh()
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn("user-2", linked = null) } }
    // The account is user-1's, still on the server, whose session the device let go of.
    server.linkStatus = 409
    server.inUse = "token-1b" to "user-1"
    server.linked["user-1"] = SignInProvider.SIGN_IN_PROVIDER_GOOGLE
    val google = ProviderToken(LinkedAccount.Provider.Google, "header.claims.signature", "nonce-1", "a@example.com")

    assertEquals(SignInResult.Switched, phone.account.signIn(google))

    val account = LinkedAccount(LinkedAccount.Provider.Google, "a@example.com")
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn("user-1", account) } }
    eventually { phone.note("2026-10-04") == "残す" }
    assertEquals(0, phone.account.deleted.value)
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

    val again = SyncAccount(phone.database, phone.sessions, server.url, OkHttpClient(), phone.scope, linePhotos = phone.linePhotos)
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
    withTimeout(10_000) { phone.outboxEmptied() }

    phone.account.startAfresh()
    phone.account.tryAgain()
    // Commands are taken in order: the socket closing for this one says those before were taken.
    phone.account.background()
    withTimeout(10_000) { phone.account.userSocket.first { it == SocketState.Closed } }

    assertEquals(AccountState.SignedIn("user-1", linked = null), phone.account.state.value)
    assertEquals("残す", phone.note("2026-10-04"))
    assertEquals(StoredSession("token-1", "user-1"), phone.sessions.read())
  }
}
