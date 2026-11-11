package app.pochical.kit

import java.io.File
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
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

  private val group = NewGroupRequest.asking("忘年会", GroupMarkValue(emoji = "🍻"), "さくら", last = null)
  private val draft = NewGroupDraft("忘年会", sent = group)

  /** The screen turned, or the page left, as グループを作る waits: the call is the kit's (#1178). */
  @Test
  fun aGroupBeingMadeIsMadeThoughThePageThatAskedIsGone() = runBlocking {
    phone.account.foreground()
    phone.account.state.first { it is AccountState.SignedIn }
    server.createGroupDelayMs = 300
    val making = calls.making.begin(draft, JoinFace.Usual, asUsual = false)
    // The page waits on it, and goes while the server still makes the group.
    val page = CoroutineScope(SupervisorJob())
    page.launch { making.answer.await() }
    page.cancel()

    assertEquals(InGroup("group-${group.id}", faceKept = true), withTimeout(5_000) { making.answer.await() })
    assertEquals(listOf(group.id), server.createdGroups.map { it.requestId })
  }

  /** A second tap before the page is drawn busy, and the page opened again while the first call goes on. */
  @Test
  fun aGroupAskedForAgainWhileItIsBeingMadeIsTheSameCall() = runBlocking {
    phone.account.foreground()
    phone.account.state.first { it is AccountState.SignedIn }
    server.createGroupDelayMs = 300
    val first = calls.making.begin(draft, JoinFace.Usual, asUsual = false)
    val again = calls.making.begin(NewGroupDraft("忘年会", sent = NewGroupRequest.asking("忘年会", GroupMarkValue(emoji = "🍻"), "さくら", last = null)), JoinFace.Usual, asUsual = false)

    assertSame(first, again)
    assertSame(first, calls.making.underWay.value)
    withTimeout(5_000) { first.answer.await() }
    assertEquals(listOf(group.id), server.createdGroups.map { it.requestId })
    // The page that waits takes the answer, and nothing is under way.
    calls.making.took(first)
    assertNull(calls.making.underWay.value)
  }

  /** The page left for good: the group is made all the same, and the call forgotten as it ends. */
  @Test
  fun aCallWhosePageWasLeftIsForgottenOnceItHasEnded() = runBlocking {
    phone.account.foreground()
    phone.account.state.first { it is AccountState.SignedIn }
    server.createGroupDelayMs = 300
    val call = calls.making.begin(draft, JoinFace.Usual, asUsual = false)
    calls.making.left(call)
    assertSame("Still under way for the page opened again", call, calls.making.underWay.value)

    withTimeout(5_000) { call.answer.await() }
    withTimeout(5_000) { calls.making.underWay.first { it == null } }
    assertEquals(listOf(group.id), server.createdGroups.map { it.requestId })
  }

  /**
   * The page left while its group is being made lets go of the photo held for the face, in turn:
   * after the call, which keeps the face first.
   */
  @Test
  fun aFaceIsKeptThoughItsPageLetsGoOfItsPhotoWhileTheGroupIsBeingMade() = runBlocking {
    phone.account.foreground()
    phone.account.state.first { it is AccountState.SignedIn }
    server.createGroupDelayMs = 300
    val face = JoinFace.Held(calls.holdPhoto(byteArrayOf(1, 2, 3)))
    val call = calls.making.begin(draft, face, asUsual = false)
    // As the page's leaving does.
    calls.making.left(call)
    val letGo = calls.letGoOfPhoto(face.photoId)

    assertEquals(InGroup("group-${group.id}", faceKept = true), withTimeout(5_000) { call.answer.await() })
    withTimeout(5_000) { letGo.await() }
    assertTrue("The face went to the group before its photo was let go of", face.photoId in server.groupPhotos)
  }

  /**
   * A photo picked for the face, 作る, the page left and opened again while the call is under way,
   * and the call fails: the photo is still there for 作る again, which keeps the face.
   */
  @Test
  fun aFaceIsKeptByTheRetryOfAPageOpenedAgainThoughTheFirstPageLetGoOfItsPhoto() = runBlocking {
    phone.account.foreground()
    phone.account.state.first { it is AccountState.SignedIn }
    server.createGroupDelayMs = 300
    server.createGroupFails = true
    val face = JoinFace.Held(calls.holdPhoto(byteArrayOf(1, 2, 3)))
    val first = calls.making.begin(draft, face, asUsual = false)
    // The first page is left, and the page opened again takes the call's face as its own.
    calls.making.left(first)
    calls.letGoOfPhoto(face.photoId)
    calls.holdPhotoAgain(first.face.let { (it as JoinFace.Held).photoId })
    calls.making.waitOn(first)
    assertTrue(runCatching { withTimeout(5_000) { first.answer.await() } }.isFailure)
    calls.making.took(first)

    server.createGroupFails = false
    val again = calls.making.begin(draft, face, asUsual = false)
    assertEquals(InGroup("group-${group.id}", faceKept = true), withTimeout(5_000) { again.answer.await() })
    assertTrue(face.photoId in server.groupPhotos)
    // The page gives way to the group: none holds the photo, and it goes.
    withTimeout(5_000) { calls.letGoOfPhoto(face.photoId).await() }
    assertTrue(runCatching { calls.sendHeldPhoto(face.photoId, PhotoShelf.Mine) }.exceptionOrNull() is MarkPhotoGone)
  }

  /** 作る with a photo for the face, the page left for good, and the call fails: the photo goes, once. */
  @Test
  fun aPhotoHeldForACallThatFailsAfterItsPageWasLeftGoesFromTheDevice() = runBlocking {
    phone.account.foreground()
    phone.account.state.first { it is AccountState.SignedIn }
    server.createGroupDelayMs = 300
    server.createGroupFails = true
    val face = JoinFace.Held(calls.holdPhoto(byteArrayOf(1, 2, 3)))
    val call = calls.making.begin(draft, face, asUsual = false)
    calls.making.left(call)
    val letGo = calls.letGoOfPhoto(face.photoId)

    assertTrue(runCatching { withTimeout(5_000) { call.answer.await() } }.isFailure)
    withTimeout(5_000) { letGo.await() }
    assertTrue(runCatching { calls.sendHeldPhoto(face.photoId, PhotoShelf.Mine) }.exceptionOrNull() is MarkPhotoGone)
    // Let go of again by mistake, nothing is there to take.
    withTimeout(5_000) { calls.letGoOfPhoto(face.photoId).await() }
  }
}
