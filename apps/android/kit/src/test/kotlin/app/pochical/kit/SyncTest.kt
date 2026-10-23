package app.pochical.kit

import app.pochical.design.SyncLimits
import app.pochical.design.SyncSocket
import app.pochical.v1.ClientFrame
import app.pochical.v1.DayField
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.random.Random
import kotlin.io.path.createTempDirectory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
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
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

private const val NOTE = 4

/** One of the user's devices: its own database, kept session and account. */
private class Device(
  server: FakeServer,
  now: () -> Long = System::currentTimeMillis,
  network: NetworkWatch? = null,
  random: Random = Random.Default,
) {
  val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  val database = AppDatabase.open(RuntimeEnvironment.getApplication(), inMemory = true)
  val sessionFile = File(createTempDirectory().toFile(), "session")
  val sessions = SessionStore(sessionFile, MarkedSeal)
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

  fun close() {
    scope.cancel()
    database.close()
  }
}

/** The OS's default network, as the test tells of it. */
private class FakeNetwork : NetworkWatch {
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
private suspend fun eventually(condition: suspend () -> Boolean) =
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
    assertEquals(AccountState.SignedIn(server.userId), phone.account.state.value)
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
}
