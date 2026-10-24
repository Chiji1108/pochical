package app.pochical.kit

import app.pochical.design.SyncLimits
import app.pochical.design.SyncSocket
import app.pochical.v1.ClientFrame
import app.pochical.v1.DayField
import app.pochical.v1.SignInProvider
import java.time.LocalDate
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.random.Random
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

private const val NOTE = 4

/** One of the user's devices: its own database, kept session and account. */
internal class Device(
  server: FakeServer,
  now: () -> Long = System::currentTimeMillis,
  network: NetworkWatch? = null,
  random: Random = Random.Default,
) {
  val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  val database = AppDatabase.open(RuntimeEnvironment.getApplication(), inMemory = true)
  val kept = MemoryBytes()
  val sessions = SessionStore(kept)
  val edits = OwnEdits(database, now)
  /** How many times the account asked the OS for time to send in the background. */
  val backgroundSends = java.util.concurrent.atomic.AtomicInteger()
  val account =
    SyncAccount(database, sessions, server.url, OkHttpClient(), scope, network, now, random) {
      backgroundSends.incrementAndGet()
    }

  suspend fun note(date: String) = database.values().days(date, date).first().singleOrNull()?.note

  suspend fun outboxEmptied() = database.sync().lastWaiting().first { it == null }

  suspend fun current() = account.userSocket.first { it == SocketState.Current }

  // The account's work ends before the database closes: a read still running on another thread
  // would throw past the test, into the next one's.
  fun close() {
    runBlocking { scope.coroutineContext.job.cancelAndJoin() }
    database.close()
  }
}

/** The OS's default network, as the test tells of it. */
internal class FakeNetwork : NetworkWatch {
  lateinit var lost: () -> Unit
  lateinit var changed: () -> Unit

  override fun watch(lost: () -> Unit, changed: () -> Unit) {
    this.lost = lost
    this.changed = changed
  }
}

/** Draws the longest wait before each try, so that a try made at once is told from one after a wait. */
private object LongestWait : Random() {
  override fun nextBits(bitCount: Int) = Random.Default.nextBits(bitCount)

  override fun nextLong(until: Long) = until - 1
}

/** Waits for [condition], polling, for a few seconds at most. */
internal suspend fun eventually(condition: suspend () -> Boolean) =
  withTimeout(10_000) {
    while (!condition()) delay(20)
  }

@RunWith(RobolectricTestRunner::class)
class SyncTest {
  private val server = FakeServer()
  private val devices = mutableListOf<Device>()

  private fun device(
    now: () -> Long = System::currentTimeMillis,
    network: NetworkWatch? = null,
    random: Random = Random.Default,
  ) = Device(server, now, network, random).also { devices += it }

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
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    // The user's other devices, each given the phone's session as one restored from it would be.
    val session = phone.sessions.read()!!
    val tablet = device()
    tablet.sessions.write(session)
    tablet.account.foreground()
    withTimeout(10_000) { tablet.current() }

    tablet.edits.setDay("2026-10-02", DayField.DAY_FIELD_NOTE, "健診")
    eventually { phone.note("2026-10-02") == "健診" }

    val newPhone = device()
    newPhone.sessions.write(session)
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
  fun comingBackAtOnceAfterLeavingOpensANewSocket() = runBlocking<Unit> {
    val phone = device()
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }

    repeat(20) {
      val opened = server.sockets.size
      phone.account.background()
      phone.account.foreground()
      eventually { server.sockets.size > opened }
      withTimeout(10_000) { phone.current() }
    }
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

    val result = phone.account.signIn(ProviderToken(LinkedAccount.Provider.Google, token, "nonce-1", "a@example.com"))

    assertEquals(SignInResult.Linked, result)
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

    phone.account.signIn(ProviderToken(LinkedAccount.Provider.Google, "t", "n", "a@example.com"))
    val account = LinkedAccount(LinkedAccount.Provider.Google, "a@example.com")
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn(server.userId, account) } }
    delay(1_500)

    assertEquals(AccountState.SignedIn(server.userId, account), phone.account.state.value)
    assertEquals(account, phone.sessions.read()?.linked)
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
      runBlocking { phone.account.signIn(ProviderToken(LinkedAccount.Provider.Google, "t", "n", null)) }
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
    phone.account.signIn(ProviderToken(LinkedAccount.Provider.Google, "t", "n", "a@example.com"))
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
      runBlocking { phone.account.signIn(ProviderToken(LinkedAccount.Provider.Google, "t", "n", "a@example.com")) }
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

  @Test
  fun aSocketMovesAtOnceToTheNetworkThatBecomesTheDefault() = runBlocking {
    val network = FakeNetwork()
    val phone = device(network = network, random = LongestWait)
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    val states = CopyOnWriteArrayList<SocketState>()
    phone.scope.launch { phone.account.userSocket.collect { states += it } }
    eventually { states.isNotEmpty() }

    // Wi-Fi taking over from cellular, which is not lost but lingers.
    network.changed()
    eventually { server.sockets.size == 2 && states.last() == SocketState.Current }
    assertFalse("moved without a wait: $states", states.any { it is SocketState.Waiting })

    // Wi-Fi lost, then cellular the default again.
    network.lost()
    eventually { states.last() is SocketState.Waiting }
    val changedMs = System.currentTimeMillis()
    network.changed()
    eventually { server.sockets.size == 3 }
    val tookMs = System.currentTimeMillis() - changedMs
    assertTrue("tried in $tookMs ms, not after the wait", tookMs < SyncSocket.reconnectFirstMs / 2)
  }

  @Test
  fun aSocketMovesBeforeTakingFramesStillQueued() = runBlocking {
    val network = FakeNetwork()
    val phone = device(network = network)
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }

    // The database held, the socket takes its first frame no further and the rest queue behind it.
    val held = CompletableDeferred<Unit>()
    val release = CompletableDeferred<Unit>()
    val holding = phone.scope.launch {
      phone.database.write {
        held.complete(Unit)
        release.await()
      }
    }
    held.await()
    val dates = (0L until 50L).map { LocalDate.of(2026, 11, 1).plusDays(it).toString() }
    server.noteElsewhere(dates)
    delay(500)
    network.changed()
    release.complete(Unit)
    holding.join()

    eventually { server.sockets.size == 2 && server.sockets[1].isNotEmpty() }
    val hello = server.sockets[1].first().hello
    assertTrue("moved at cursor ${hello.cursor}, not after all ${dates.size} frames", hello.cursor < dates.size)
  }
}
