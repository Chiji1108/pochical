package app.pochical.kit

import java.io.File
import app.pochical.v1.change
import app.pochical.v1.profile
import kotlinx.coroutines.delay
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
      OkHttpClient(),
      server.url,
      Photos(OkHttpClient(), server.url, File(RuntimeEnvironment.getApplication().cacheDir, "held")),
      phone.scope,
      phone.database.values(),
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
  fun aUsualNameAndPhotoKeptOneAfterTheOtherKeepEachOther() = runBlocking {
    phone.account.foreground()
    phone.account.state.first { it is AccountState.SignedIn }
    calls.keepProfile(name = "さくら")
    calls.keepProfile(photo = UsualPhoto.New(byteArrayOf(1, 2, 3)))
    val last = calls.keepProfile(name = "サクラ")

    withTimeout(5_000) { last.await() }
    val photo = server.ownPhotos.single()
    assertEquals(listOf("さくら" to "", "さくら" to photo, "サクラ" to photo), server.profiles.map { it.name to it.photoId })
  }

  @Test
  fun aNameFromAnotherDeviceAfterTheWordCameBackIsKeptWithANewPhoto() = runBlocking {
    phone.account.foreground()
    phone.account.state.first { it is AccountState.SignedIn }
    withTimeout(5_000) { calls.keepProfile(name = "さくら").await() }
    // The account's word on it, then another device's new name, come back on the socket.
    phone.database.write { takeMembership(change { profile = profile { name = "さくら" } }) }
    phone.database.write { takeMembership(change { profile = profile { name = "はな" } }) }
    phone.database.values().profile().first { it?.name == "はな" }
    delay(200)

    withTimeout(5_000) { calls.keepProfile(photo = UsualPhoto.New(byteArrayOf(1))).await() }
    assertEquals("はな" to server.ownPhotos.single(), server.profiles.last().let { it.name to it.photoId })
  }
}
