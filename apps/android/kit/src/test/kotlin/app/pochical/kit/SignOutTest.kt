package app.pochical.kit

import app.pochical.v1.DayField
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private const val PATTERN = 1

/** ログアウト (spec/sync-protocol.md, Signing out), as the device and the server see it. */
@RunWith(RobolectricTestRunner::class)
class SignOutTest {
  private val server = FakeServer()
  private val devices = mutableListOf<Device>()

  @After
  fun closeAll() {
    devices.forEach { it.close() }
    server.close()
  }

  private suspend fun signedInDevice(): Device {
    val phone = Device(server).also { devices += it }
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    return phone
  }

  private suspend fun Device.pattern(date: String) = database.values().days(date, date).first().singleOrNull()?.pattern

  @Test
  fun signingOutSendsTheOutboxFirstThenErasesAndStartsAsSomeoneNew() = runBlocking<Unit> {
    val phone = signedInDevice()
    FirstRun(phone.database).finish()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")

    phone.account.signOut()

    // Kept on the server under the user signed out, for signing in again to bring back.
    assertEquals("night", server.day("2026-11-02", PATTERN, user = "user-1")?.day?.value)
    assertEquals(listOf("/api/auth/sign-out" to "Bearer token-1"), server.calls.toList())
    withTimeout(10_000) { phone.account.state.first { it is AccountState.SignedIn && it.userId == "user-2" } }
    assertNull(phone.pattern("2026-11-02"))
    assertEquals("user-2", phone.sessions.read()?.userId)
    // Not a deletion: nothing says アカウントを削除しました. The device starts with はじめの設定.
    assertEquals(0, phone.account.deleted.value)
    assertFalse(FirstRun(phone.database).done.first())
  }

  @Test
  fun anAppEndedAfterSigningOutBeforeAnythingIsErasedGoesOnErasingAsItStarts() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    withTimeout(10_000) { phone.outboxEmptied() }
    // Ended just after the server ended the session and the erasing was noted, nothing erased yet.
    phone.scope.coroutineContext[Job]!!.cancelChildren()
    phone.database.write { upsert(state().copy(erased = "user-1", erasedWhy = AccountState.Erasing.Why.SignedOut.name)) }
    assertEquals("night", phone.pattern("2026-11-02"))

    val again = SyncAccount(phone.database, phone.sessions, server.url, lazyOf(OkHttpClient()), phone.scope, linePhotos = phone.linePhotos)
    again.foreground()

    withTimeout(10_000) { again.state.first { it is AccountState.SignedIn } }
    assertEquals("user-2", (again.state.value as AccountState.SignedIn).userId)
    assertNull(phone.pattern("2026-11-02"))
    assertEquals(0, again.deleted.value)
  }

  @Test
  fun signingOutNotesTheErasingBeforeErasing() = runBlocking<Unit> {
    val phone = signedInDevice()
    // The session cannot be forgotten, so erasing stops with the note kept.
    phone.kept.writable = false

    phone.account.signOut()

    withTimeout(10_000) { phone.account.state.first { it == AccountState.Erasing(AccountState.Erasing.Why.SignedOut, failed = true) } }
    assertEquals("user-1" to "SignedOut", phone.database.write { state().let { it.erased to it.erasedWhy } })
  }

  @Test
  fun aSignOutTheServerRefusesKeepsEverything() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    server.signOutStatus = 500

    assertThrows(SignOutRefused::class.java) { runBlocking { phone.account.signOut() } }

    assertEquals(AccountState.SignedIn("user-1", null), phone.account.state.value)
    assertEquals("night", phone.pattern("2026-11-02"))
    assertEquals(StoredSession("token-1", "user-1"), phone.sessions.read())
  }

  @Test
  fun aSessionTheServerForgotIsLetGoOfAsAnyIs() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    withTimeout(10_000) { phone.outboxEmptied() }
    server.token = "gone"

    phone.account.signOut()

    withTimeout(10_000) { phone.account.state.first { it is AccountState.SignedIn && it.userId != "user-1" } }
    assertNull(phone.pattern("2026-11-02"))
  }

  @Test
  fun leavingThePageWhileTheOutboxGoesDoesNotStopTheSignOut() = runBlocking<Unit> {
    val phone = signedInDevice()
    val caller = launch(start = CoroutineStart.UNDISPATCHED) { phone.account.signOut() }
    caller.cancel()

    withTimeout(10_000) { phone.account.state.first { it is AccountState.SignedIn && it.userId != "user-1" } }
    assertEquals(listOf("/api/auth/sign-out" to "Bearer token-1"), server.calls.toList())
  }
}
