package app.pochical.kit

import app.pochical.v1.DayField
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
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
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")

    phone.account.signOut()

    // Kept on the server under the user signed out, for signing in again to bring back.
    assertEquals("night", server.day("2026-11-02", PATTERN, user = "user-1")?.day?.value)
    assertEquals(listOf("/api/auth/sign-out" to "Bearer token-1"), server.calls.toList())
    withTimeout(10_000) { phone.account.state.first { it is AccountState.SignedIn && it.userId == "user-2" } }
    assertNull(phone.pattern("2026-11-02"))
    assertEquals("user-2", phone.sessions.read()?.userId)
    // Not a deletion: nothing says アカウントを削除しました.
    assertEquals(0, phone.account.deleted.value)
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
  fun signingOutASessionTheServerDoesNotKnowEndsIt() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    withTimeout(10_000) { phone.outboxEmptied() }
    server.token = "gone"

    assertThrows(NotSignedIn::class.java) { runBlocking { phone.account.signOut() } }

    assertEquals(AccountState.SessionEnded, phone.account.state.value)
    assertEquals("night", phone.pattern("2026-11-02"))
  }
}
