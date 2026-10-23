package app.pochical.kit

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

/** The session kept in this device's Google Play services' Block Store, as the app keeps it. */
@RunWith(AndroidJUnit4::class)
class BlockStoreTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext

  @Test
  fun aSessionKeptIsReadBackByAnotherStoreAndReplaced() = runBlocking {
    val bytes = BlockStoreBytes(context, "e2e-block-store").apply { delete() }
    assertNull(SessionStore(bytes).read())

    val linked = StoredSession("token", "user", linked = LinkedAccount(LinkedAccount.Provider.Google, "a@example.com"))
    SessionStore(bytes).write(StoredSession("first", "user"))
    SessionStore(bytes).write(linked)
    assertEquals(linked, SessionStore(BlockStoreBytes(context, "e2e-block-store")).read())

    bytes.delete()
    assertNull(SessionStore(bytes).read())
  }
}
