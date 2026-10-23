package app.pochical.kit

import java.io.File
import java.security.GeneralSecurityException
import kotlin.io.path.createTempDirectory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Seals by marking the bytes, so the test can tell sealed from not. */
internal object MarkedSeal : SessionSeal {
  private val mark = "sealed:".encodeToByteArray()

  override fun seal(plain: ByteArray) = mark + plain

  override fun open(sealed: ByteArray): ByteArray {
    if (!sealed.take(mark.size).toByteArray().contentEquals(mark)) throw GeneralSecurityException("Not sealed here")
    return sealed.drop(mark.size).toByteArray()
  }
}

class SessionStoreTest {
  private val file = File(createTempDirectory().toFile(), "session")
  private val store = SessionStore(file, MarkedSeal)

  @Test
  fun aSessionKeptIsReadBackSealed() {
    assertNull(store.read())
    store.write(StoredSession("token", "user"))
    assertEquals(StoredSession("token", "user"), store.read())
    assertEquals("sealed:", file.readText().take("sealed:".length))
  }

  @Test
  fun anEndedSessionStaysEndedAcrossLaunches() {
    store.write(StoredSession("token", "user"))
    store.write(StoredSession("token", "user", ended = true))
    assertEquals(StoredSession("token", "user", ended = true), SessionStore(file, MarkedSeal).read())
  }

  @Test
  fun aSessionTheAppCannotReadIsNoSession() {
    file.writeText("sealed elsewhere")
    assertNull(store.read())
    file.writeBytes("sealed:{\"shape\":\"older\"}".encodeToByteArray())
    assertNull(store.read())

    store.write(StoredSession("new", "user"))
    assertEquals(StoredSession("new", "user"), store.read())
  }
}
