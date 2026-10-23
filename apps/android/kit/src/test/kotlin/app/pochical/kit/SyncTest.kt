package app.pochical.kit

import app.pochical.design.SyncLimits
import app.pochical.v1.ClientFrame
import app.pochical.v1.DayField
import app.pochical.v1.SignInProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

private const val NOTE = 4

/** One of the user's devices: its own database, kept session and account. */
private class Device(server: FakeServer, now: () -> Long = System::currentTimeMillis) {
  val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  val database = AppDatabase.open(RuntimeEnvironment.getApplication(), inMemory = true)
  val kept = MemoryBytes()
  val sessions = SessionStore(kept)
  val edits = OwnEdits(database, now)
  /** How many times the account asked the OS for time to send in the background. */
  val backgroundSends = java.util.concurrent.atomic.AtomicInteger()
  val account =
    SyncAccount(database, sessions, server.url, OkHttpClient(), scope, now = now) { backgroundSends.incrementAndGet() }

  suspend fun note(date: String) = database.values().days(date, date).first().singleOrNull()?.note

  suspend fun outboxEmptied() = database.sync().lastWaiting().first { it == null }

  suspend fun current() = account.userSocket.first { it == SocketState.Current }

  fun close() {
    scope.cancel()
    database.close()
  }
}

/** Waits for [condition], polling, for a few seconds at most. */
private suspend fun eventually(condition: suspend () -> Boolean) =
  withTimeout(10_000) {
    while (!condition()) delay(20)
  }

@RunWith(RobolectricTestRunner::class)
class SyncTest {
  private val server = FakeServer()
  private val devices = mutableListOf<Device>()

  private fun device(now: () -> Long = System::currentTimeMillis) = Device(server, now).also { devices += it }

  @After
  fun closeAll() {
    devices.forEach { it.close() }
    server.close()
  }

  @Test
  fun anEditReachesTheServerAndComesBackAsItsValue() = runBlocking {
    val phone = device()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    assertEquals(AccountState.SignedIn(server.userId, linked = null), phone.account.state.value)
    assertEquals(StoredSession(server.token, server.userId), phone.sessions.read())

    phone.edits.setDay("2026-10-01", DayField.DAY_FIELD_NOTE, "夜勤明け")
    withTimeout(10_000) { phone.outboxEmptied() }
    val stored = server.day("2026-10-01", NOTE)!!
    assertEquals("夜勤明け", stored.day.value)
    assertEquals(phone.database.write { state().deviceId }, stored.day.hlc.deviceId)
    assertEquals("夜勤明け", phone.note("2026-10-01"))
    // Shown now as the server's, with nothing waiting.
    assertEquals(stored.cursor, phone.database.write { state().cursor })
  }

  @Test
  fun anotherDevicesEditArrivesWhileOpenAndInANewDevicesCatchUp() = runBlocking {
    val phone = device()
    val tablet = device()
    phone.account.foreground()
    tablet.account.foreground()
    withTimeout(10_000) {
      phone.current()
      tablet.current()
    }

    tablet.edits.setDay("2026-10-02", DayField.DAY_FIELD_NOTE, "健診")
    eventually { phone.note("2026-10-02") == "健診" }

    val newPhone = device()
    newPhone.account.foreground()
    eventually { newPhone.note("2026-10-02") == "健診" }
    val hellos = server.sockets.last().filter { it.kindCase == ClientFrame.KindCase.HELLO }
    assertEquals(listOf(0L), hellos.map { it.hello.cursor })
  }

  @Test
  fun editsMadeOfflineGoOnceSignedIn() = runBlocking {
    val phone = device()
    phone.edits.setDay("2026-10-03", DayField.DAY_FIELD_NOTE, "オフライン")
    phone.account.foreground()
    withTimeout(10_000) { phone.outboxEmptied() }
    assertEquals("オフライン", server.day("2026-10-03", NOTE)?.day?.value)
  }

  @Test
  fun leavingWithEditsWaitingAsksForTimeAndWhatRunsThenSendsThem() = runBlocking<Unit> {
    val phone = device()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    phone.account.background()
    withTimeout(10_000) { phone.account.userSocket.first { it == SocketState.Closed } }
    assertEquals("nothing waits, so nothing is asked", 0, phone.backgroundSends.get())

    // An app ended in the background comes back without its screens, for the work alone.
    val ended = Device(server).also { devices += it }
    ended.sessions.write(phone.sessions.read()!!)
    ended.edits.setDay("2026-10-07", DayField.DAY_FIELD_NOTE, "閉じる前")
    ended.account.background()
    eventually { ended.backgroundSends.get() == 1 }
    assertTrue(withTimeout(10_000) { ended.account.sendOutbox() })
    assertEquals("閉じる前", server.day("2026-10-07", NOTE)?.day?.value)
    // Still in the background, the socket closes once it is sent.
    withTimeout(10_000) { ended.account.userSocket.first { it == SocketState.Closed } }
  }

  @Test
  fun aSessionTheServerDoesNotKnowEndsSyncKeepingWhatTheDeviceHolds() = runBlocking {
    val phone = device()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    phone.edits.setDay("2026-10-04", DayField.DAY_FIELD_NOTE, "残す")
    withTimeout(10_000) { phone.outboxEmptied() }

    server.token = "another"
    phone.account.background()
    withTimeout(10_000) { phone.account.userSocket.first { it == SocketState.Closed } }
    phone.account.foreground()
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SessionEnded } }

    assertEquals(true, phone.sessions.read()?.ended)
    assertEquals("残す", phone.note("2026-10-04"))
    // Nothing tries again, a relaunch included: no new anonymous user.
    val again = SyncAccount(phone.database, phone.sessions, server.url, OkHttpClient(), phone.scope)
    again.foreground()
    withTimeout(10_000) { again.state.first { it == AccountState.SessionEnded } }
    assertEquals("token-1", phone.sessions.read()?.token)
  }

  @Test
  fun aStoreOutOfReachSignsInAsNoOneNewAndIsTriedAgainInTheForeground() = runBlocking {
    val phone = device()
    phone.sessions.write(StoredSession(server.token, server.userId))
    phone.kept.reachable = false
    phone.account.foreground()
    delay(500)
    assertEquals(AccountState.SigningIn, phone.account.state.value)
    assertEquals(0, server.signIns.get())

    phone.kept.reachable = true
    phone.account.background()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    assertEquals(AccountState.SignedIn(server.userId, linked = null), phone.account.state.value)
    assertEquals(0, server.signIns.get())
  }

  @Test
  fun aNewSessionThatCannotBeKeptIsNotUsed() = runBlocking {
    val phone = device()
    phone.kept.writable = false
    phone.account.foreground()
    eventually { server.signIns.get() == 1 }
    delay(500)
    assertEquals(AccountState.SigningIn, phone.account.state.value)
    assertTrue(server.sockets.isEmpty())
  }

  @Test
  fun linkingKeepsTheUserAndTheAccountWithTheSession() = runBlocking<Unit> {
    val phone = device()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    val token = "header.claims.signature"

    val result = phone.account.link(ProviderToken(LinkedAccount.Provider.Google, token, "nonce-1", "a@example.com"))

    assertEquals(LinkResult.Linked, result)
    val (authorization, body) = server.links.single()
    assertEquals("Bearer ${server.token}", authorization)
    assertEquals("""{"provider":"google","idToken":{"token":"$token","nonce":"nonce-1"}}""", body)
    val account = LinkedAccount(LinkedAccount.Provider.Google, "a@example.com")
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn(server.userId, account) } }
    assertEquals(StoredSession(server.token, server.userId, linked = account), phone.sessions.read())
    // A relaunch shows the account as kept.
    val again = SyncAccount(phone.database, phone.sessions, server.url, OkHttpClient(), phone.scope)
    again.foreground()
    withTimeout(10_000) { again.state.first { it == AccountState.SignedIn(server.userId, account) } }
  }

  @Test
  fun anAnswerAskedBeforeALinkDoesNotUndoIt() = runBlocking {
    // GetMe, asked as the device signs in, answers anonymous only after the link is made.
    server.getMeDelayMs = 1_000
    val phone = device()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }

    phone.account.link(ProviderToken(LinkedAccount.Provider.Google, "t", "n", "a@example.com"))
    val account = LinkedAccount(LinkedAccount.Provider.Google, "a@example.com")
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn(server.userId, account) } }
    delay(1_500)

    assertEquals(AccountState.SignedIn(server.userId, account), phone.account.state.value)
    assertEquals(account, phone.sessions.read()?.linked)
  }

  @Test
  fun anAccountInUseChangesNothing() = runBlocking {
    val phone = device()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    server.linkStatus = 409

    val result = phone.account.link(ProviderToken(LinkedAccount.Provider.Google, "header.claims.signature", "nonce-1", null))

    assertEquals(LinkResult.InUse, result)
    assertEquals(AccountState.SignedIn(server.userId, linked = null), phone.account.state.value)
    assertEquals(StoredSession(server.token, server.userId), phone.sessions.read())
  }

  @Test
  fun goingToTheBackgroundWhileSigningInMakesNoSecondUser() = runBlocking {
    server.signInDelayMs = 500
    val phone = device()
    phone.account.foreground()
    eventually { server.signIns.get() == 1 }
    // Back before the server has answered the sign-in the background cancelled.
    phone.account.background()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }

    assertEquals(1, server.signIns.get())
    assertEquals(StoredSession(server.token, server.userId), phone.sessions.read())
  }

  @Test
  fun anAnswerTheAppCannotReadIsTriedAgainAsAFailure() = runBlocking {
    server.signInBody = "<html>"
    val phone = device()
    phone.account.foreground()
    eventually { server.signIns.get() >= 2 }
    assertEquals(AccountState.SigningIn, phone.account.state.value)

    server.signInBody = null
    withTimeout(30_000) { phone.current() }
    assertEquals(StoredSession(server.token, server.userId), phone.sessions.read())
  }

  @Test
  fun aSessionTheServerDoesNotKnowWhenLinkingEndsIt() = runBlocking {
    val phone = device()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    server.linkStatus = 401

    assertThrows(NotSignedIn::class.java) {
      runBlocking { phone.account.link(ProviderToken(LinkedAccount.Provider.Google, "t", "n", null)) }
    }
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SessionEnded } }
    assertEquals(true, phone.sessions.read()?.ended)
  }

  @Test
  fun eachSignInAsksTheServerWhichProviderTheUserIsLinkedTo() = runBlocking {
    server.provider = SignInProvider.SIGN_IN_PROVIDER_GOOGLE
    val phone = device()
    phone.account.foreground()
    val google = LinkedAccount(LinkedAccount.Provider.Google, email = null)
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn(server.userId, google) } }
    assertEquals(google, phone.sessions.read()?.linked)

    server.provider = SignInProvider.SIGN_IN_PROVIDER_UNSPECIFIED
    val again = SyncAccount(phone.database, phone.sessions, server.url, OkHttpClient(), phone.scope)
    again.foreground()
    withTimeout(10_000) { again.state.first { it == AccountState.SignedIn(server.userId, null) } }
    assertNull(phone.sessions.read()?.linked)
  }

  @Test
  fun anEmailThisDeviceReadStaysWhileTheServerNamesTheSameProvider() = runBlocking<Unit> {
    val phone = device()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    phone.account.link(ProviderToken(LinkedAccount.Provider.Google, "t", "n", "a@example.com"))
    val account = LinkedAccount(LinkedAccount.Provider.Google, "a@example.com")
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn(server.userId, account) } }

    server.provider = SignInProvider.SIGN_IN_PROVIDER_GOOGLE
    val again = SyncAccount(phone.database, phone.sessions, server.url, OkHttpClient(), phone.scope)
    again.foreground()
    withTimeout(10_000) { again.userSocket.first { it == SocketState.Current } }
    delay(300)
    assertEquals(AccountState.SignedIn(server.userId, account), again.state.value)
    assertEquals(account, phone.sessions.read()?.linked)
  }

  @Test
  fun aLinkAlreadyMadeElsewhereIsSaidAsTheServerSaysIt() = runBlocking<Unit> {
    val phone = device()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    server.linkStatus = 417
    server.provider = SignInProvider.SIGN_IN_PROVIDER_GOOGLE

    assertThrows(LinkRefused::class.java) {
      runBlocking { phone.account.link(ProviderToken(LinkedAccount.Provider.Google, "t", "n", "a@example.com")) }
    }
    val google = LinkedAccount(LinkedAccount.Provider.Google, email = null)
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn(server.userId, google) } }
  }

  @Test
  fun aClockFarAheadIsTakenBackOnceTheServerHasCorrectedIt() = runBlocking {
    val ahead = SyncLimits.clockAheadMs * 2L
    val phone = device(now = { System.currentTimeMillis() + ahead })
    phone.edits.setDay("2026-10-05", DayField.DAY_FIELD_NOTE, "先走り")
    phone.account.foreground()
    withTimeout(10_000) { phone.outboxEmptied() }

    val stored = server.day("2026-10-05", NOTE)!!
    assertTrue(stored.day.hlc.physicalMs <= System.currentTimeMillis() + SyncLimits.clockAheadMs)
    assertEquals(2, server.sockets.size)
  }

  @Test
  fun aDatabaseAnotherUserLeftIsErasedBeforeTheUsersSocketOpens() = runBlocking {
    val phone = device()
    phone.database.write {
      claim("someone-before")
      takeOwn(app.pochical.v1.change { day = app.pochical.v1.dayValue { date = "2026-10-06"; field = DayField.DAY_FIELD_NOTE; value = "前の人" } })
    }
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    assertNull(phone.note("2026-10-06"))
    assertEquals(server.userId, phone.database.write { state().owner })
  }

  @Test
  fun aSocketNeverOpensOnADatabaseNotItsUsers() = runBlocking {
    val phone = device()
    phone.database.write { claim("someone-else") }
    val client =
      SyncClient(phone.database, Peer.User, server.url, OkHttpClient(), Credentials(1, server.token, server.userId) { 1 }, phone.scope)
    client.start()
    assertEquals(SocketState.Stopped(Stop.NotTheOwner), withTimeout(10_000) { client.state.first { it is SocketState.Stopped } })
    assertEquals(0, server.sockets.size)
  }
}
