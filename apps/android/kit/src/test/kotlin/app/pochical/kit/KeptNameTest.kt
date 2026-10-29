package app.pochical.kit

import java.io.File
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class KeptNameTest {
  private val server = FakeServer()
  private val phone = Device(server)
  private val calls =
    GroupCalls(
      phone.account,
      lazyOf(OkHttpClient()),
      server.url,
      Photos(lazyOf(OkHttpClient()), server.url, lazyOf(File(RuntimeEnvironment.getApplication().cacheDir, "held"))),
      phone.scope,
    )

  @After
  fun close() {
    phone.close()
    server.close()
  }

  @Test
  fun aNameKeptAsItsPageGoesReachesTheServerInTheOrderKept() = runBlocking {
    phone.account.foreground()
    phone.account.state.first { it is AccountState.SignedIn }
    server.displayNameDelayMs = 300
    // Kept with no coroutine of the caller's, so nothing of the page that kept them waits on them.
    calls.keepDisplayName("group-1", "さくら")
    val last = calls.keepDisplayName("group-1", "サクラ")

    withTimeout(5_000) { last.await() }
    assertEquals(listOf("さくら", "サクラ"), server.displayNames.map { it.displayName })
    assertEquals("group-1", server.displayNames.last().groupId)
  }

  @Test
  fun aUsualNameOrPhotoKeptSendsOnlyWhatChanged() = runBlocking {
    phone.account.foreground()
    phone.account.state.first { it is AccountState.SignedIn }
    calls.keepProfile(name = "さくら")
    calls.keepProfile(photo = UsualPhoto.New(byteArrayOf(1, 2, 3)))
    val last = calls.keepProfile(name = "サクラ")

    withTimeout(5_000) { last.await() }
    val photo = server.ownPhotos.single()
    // Each sends what changed alone, the server keeping the rest as it has it.
    assertEquals(
      listOf(("さくら" to null), (null to photo), ("サクラ" to null)),
      server.profiles.map { (if (it.hasName()) it.name else null) to (if (it.hasPhotoId()) it.photoId else null) },
    )
  }
}
