package app.pochical.kit

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Bytes kept in memory, as Block Store keeps them; [reachable] false as without Play services, and
 * [writable] false for a store that went out of reach between a read and a write.
 */
internal class MemoryBytes : KeptBytes {
  @Volatile var bytes: ByteArray? = null
  @Volatile var reachable = true
  @Volatile var writable = true

  override suspend fun read(): ByteArray? {
    if (!reachable) throw StoreUnreachable(IllegalStateException("Play services unavailable"))
    return bytes
  }

  /** How many writes go before every later one fails, null for no end. */
  @Volatile private var writesLeft: Int? = null

  /** The next [count] writes go, and every one after fails. */
  fun failWritesAfter(count: Int) {
    writesLeft = count
  }

  override suspend fun write(bytes: ByteArray) {
    if (!reachable || !writable || writesLeft == 0) throw StoreUnreachable(IllegalStateException("Play services unavailable"))
    writesLeft = writesLeft?.minus(1)
    this.bytes = bytes
  }
}

class SessionStoreTest {
  private val kept = MemoryBytes()
  private val store = SessionStore(kept)

  @Test
  fun aSessionKeptIsReadBackWithItsAccount() = runBlocking {
    assertNull(store.read())
    val session = StoredSession("token", "user", linked = LinkedAccount(LinkedAccount.Provider.Google, "a@example.com"))
    store.write(session)
    assertEquals(session, SessionStore(kept).read())
  }

  @Test
  fun anEndedSessionStaysEndedAcrossLaunches() = runBlocking {
    store.write(StoredSession("token", "user"))
    store.write(StoredSession("token", "user", ended = true))
    assertEquals(StoredSession("token", "user", ended = true), SessionStore(kept).read())
  }

  @Test
  fun aSessionTheAppCannotReadIsNoSession() = runBlocking {
    kept.bytes = "not json".encodeToByteArray()
    assertNull(store.read())
    kept.bytes = """{"shape":"older"}""".encodeToByteArray()
    assertNull(store.read())

    store.write(StoredSession("new", "user"))
    assertEquals(StoredSession("new", "user"), store.read())
  }

  @Test
  fun theUsersSwitchesLeftBehindStayUntilEachIsDeletedWhateverTheSessionDoes() = runBlocking {
    store.write(StoredSession("a", "user-a"))
    store.switchTo(StoredSession("b", "user-b"), leaving = "a")
    store.switchTo(StoredSession("c", "user-c"), leaving = "b")
    store.forgetSession()
    assertEquals(listOf(null, listOf("a", "b")), listOf(store.read(), SessionStore(kept).leftBehind()))

    store.write(StoredSession("d", "user-d"))
    store.deleted("a")
    assertEquals(listOf(StoredSession("d", "user-d"), listOf("b")), listOf(store.read(), store.leftBehind()))
  }

  @Test
  fun aStoreOutOfReachForgetsNothing() = runBlocking {
    store.write(StoredSession("token", "user"))
    val before = kept.bytes
    kept.reachable = false
    assertThrows(StoreUnreachable::class.java) { runBlocking { store.read() } }
    assertThrows(StoreUnreachable::class.java) { runBlocking { store.write(StoredSession("other", "user")) } }
    assertArrayEquals(before, kept.bytes)
  }
}
