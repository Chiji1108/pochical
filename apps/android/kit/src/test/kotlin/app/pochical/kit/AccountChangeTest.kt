package app.pochical.kit

import app.pochical.v1.DayField
import app.pochical.v1.SignInProvider
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private const val NOTE = 4

/**
 * Switching to an account in use and deleting the account (spec/sync-protocol.md, Switching to an
 * account in use; Deleting an account), as the device and the server see them.
 */
@RunWith(RobolectricTestRunner::class)
class AccountChangeTest {
  private val server = FakeServer()
  private val devices = mutableListOf<Device>()
  private val google = ProviderToken(LinkedAccount.Provider.Google, "header.claims.signature", "nonce-1", "a@example.com")
  private val account = LinkedAccount(LinkedAccount.Provider.Google, "a@example.com")

  @After
  fun closeAll() {
    devices.forEach { it.close() }
    server.close()
  }

  /** A device signed in anonymously, its socket current. */
  private suspend fun signedInDevice(network: NetworkWatch? = null): Device {
    val phone = Device(server, network = network).also { devices += it }
    phone.account.foreground()
    withTimeout(10_000) { phone.current() }
    return phone
  }

  /** The provider's account is another user's, who noted [date] on their own phone. */
  private fun accountInUse(date: String = "2026-11-01", held: Holdings = Holdings(shiftDays = 3)) {
    server.linkStatus = 409
    server.inUse = "token-b" to "user-b"
    // As GetMe answers once the device is linked, or signed in as the account's user.
    server.provider = SignInProvider.SIGN_IN_PROVIDER_GOOGLE
    server.held = held
    server.noteElsewhere(listOf(date), user = "user-b")
  }

  private suspend fun Device.pattern(date: String) = database.values().days(date, date).first().singleOrNull()?.pattern

  private fun called(path: String) = server.calls.filter { it.first == path }

  @Test
  fun anAccountInUseWithNothingOnTheDeviceIsSwitchedToWithoutAsking() = runBlocking<Unit> {
    val phone = signedInDevice()
    accountInUse()

    assertEquals(SignInResult.Switched, phone.account.signIn(google))

    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn("user-b", account) } }
    eventually { phone.note("2026-11-01") == "ほかの端末から" }
    // The anonymous user it was is deleted, with no Apple code, and then forgotten.
    eventually { phone.sessions.leftBehind().isEmpty() }
    assertEquals(StoredSession("token-b", "user-b", linked = account), phone.sessions.read())
    assertEquals(listOf("user-1" to ""), server.deleted.map { it.first to it.second.appleAuthorizationCode })
    assertEquals(listOf("Bearer token-1"), called("/api/auth/sign-in/social").map { it.second })
  }

  @Test
  fun aSignInAskedBeforeTheDeviceHasItsSessionWaitsForIt() = runBlocking<Unit> {
    // As a sign-in whose Apple page returned to an app started anew: the account is had before the
    // device has signed in again.
    server.signInDelayMs = 500
    val phone = Device(server).also { devices += it }
    phone.account.foreground()

    assertEquals(SignInResult.Linked, phone.account.signIn(google))

    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn("user-1", account) } }
    assertEquals(StoredSession("token-1", "user-1", linked = account), phone.sessions.read())
  }

  @Test
  fun anAccountSwitchedToThatHoldsNoPatternsSaysSoOnceCaughtUp() = runBlocking<Unit> {
    val phone = signedInDevice()
    accountInUse()

    val switched = phone.account.signIn(google)

    assertFalse(FirstRun(phone.database).holdsPatternsAfter(switched, phone.account))
  }

  @Test
  fun anAccountSwitchedToBringsItsPatternsBeforeItIsAsked() = runBlocking<Unit> {
    val phone = signedInDevice()
    accountInUse()
    server.patternElsewhere("day", user = "user-b")

    val switched = phone.account.signIn(google)

    assertTrue(FirstRun(phone.database).holdsPatternsAfter(switched, phone.account))
  }

  @Test
  fun anAccountInUseHoldingNothingIsTakenWithoutAsking() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    accountInUse(held = Holdings())

    assertEquals(SignInResult.Linked, phone.account.signIn(google))

    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn("user-1", account) } }
    assertEquals("night", phone.pattern("2026-11-02"))
    assertEquals(listOf("Bearer token-1"), called("/pochical.v1.UserService/TakeAccount").map { it.second })
    assertEquals(StoredSession("token-1", "user-1", linked = account), phone.sessions.read())
    assertTrue(server.deleted.isEmpty())
  }

  @Test
  fun bothSidesHoldingSomethingAskWhichToKeepChangingNothingMeanwhile() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    phone.edits.setDay("2026-11-03", DayField.DAY_FIELD_NOTE, "メモだけ")
    accountInUse(held = Holdings(shiftDays = 40, repeating = true, coworkers = 2, groups = 1))

    val choose = phone.account.signIn(google) as SignInResult.Choose

    assertEquals(
      listOf(Holdings(shiftDays = 40, repeating = true, coworkers = 2, groups = 1), Holdings(shiftDays = 1)),
      listOf(choose.inUse.account, choose.inUse.device),
    )
    assertEquals(AccountState.SignedIn("user-1", null), phone.account.state.value)
    assertEquals(StoredSession("token-1", "user-1"), phone.sessions.read())
    assertTrue(called("/api/auth/sign-in/social").isEmpty() && called("/pochical.v1.UserService/TakeAccount").isEmpty())
  }

  @Test
  fun usingTheAccountsDataLetsGoOfWhatTheDeviceHeld() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    withTimeout(10_000) { phone.outboxEmptied() }
    accountInUse()
    val choose = phone.account.signIn(google) as SignInResult.Choose

    phone.account.useAccount(choose.inUse)

    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn("user-b", account) } }
    eventually { phone.note("2026-11-01") == "ほかの端末から" }
    assertNull(phone.pattern("2026-11-02"))
    eventually { server.deleted.map { it.first } == listOf("user-1") }
  }

  @Test
  fun keepingTheDevicesDataTakesTheAccountForThisUser() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    accountInUse()
    val choose = phone.account.signIn(google) as SignInResult.Choose

    phone.account.keepDevice(choose.inUse)

    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn("user-1", account) } }
    assertEquals("night", phone.pattern("2026-11-02"))
    assertNull(phone.note("2026-11-01"))
    assertEquals(StoredSession("token-1", "user-1", linked = account), phone.sessions.read())
  }

  @Test
  fun aSuspendedAccountIsSaidAsSuchAndChangesNothing() = runBlocking<Unit> {
    val phone = signedInDevice()
    accountInUse()
    server.socialStatus = 403

    assertThrows(AccountSuspended::class.java) { runBlocking { phone.account.signIn(google) } }

    assertEquals(AccountState.SignedIn("user-1", null), phone.account.state.value)
    assertEquals(StoredSession("token-1", "user-1"), phone.sessions.read())
  }

  @Test
  fun aSignInToTheAccountTheServerRefusesLeavesTheDeviceAsItWas() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    accountInUse()
    val choose = phone.account.signIn(google) as SignInResult.Choose
    server.inUse = null

    assertThrows(SignInRefused::class.java) { runBlocking { phone.account.useAccount(choose.inUse) } }

    assertEquals(AccountState.SignedIn("user-1", null), phone.account.state.value)
    assertEquals("night", phone.pattern("2026-11-02"))
    assertEquals(StoredSession("token-1", "user-1"), phone.sessions.read())
    withTimeout(10_000) { phone.current() }
  }

  @Test
  fun aUserLeftBehindIsDeletedWhenTheAppComesBackShouldTheFirstTryFail() = runBlocking<Unit> {
    val phone = signedInDevice()
    accountInUse()
    server.deleteRefusal = "unavailable"
    // Answered slowly, so the app comes back while the first try is still under way.
    server.deleteDelayMs = 300
    phone.account.signIn(google)
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn("user-b", account) } }
    eventually { called("/pochical.v1.UserService/DeleteAccount").isNotEmpty() }
    assertEquals(listOf("token-1"), phone.sessions.leftBehind())

    server.deleteRefusal = null
    // One try at a time: a return while one is under way starts none, so it takes the next return.
    eventually {
      phone.account.background()
      phone.account.foreground()
      delay(100)
      phone.sessions.leftBehind().isEmpty()
    }
    assertEquals(listOf("user-1"), server.deleted.map { it.first })
  }

  @Test
  fun aRelaunchAfterTheSwitchIsTheAccountsUser() = runBlocking<Unit> {
    val phone = signedInDevice()
    accountInUse()
    phone.account.signIn(google)
    eventually { phone.sessions.leftBehind().isEmpty() }

    val again = SyncAccount(phone.database, phone.sessions, server.url, okhttp3.OkHttpClient(), phone.scope, linePhotos = phone.linePhotos)
    again.foreground()
    withTimeout(10_000) { again.state.first { it == AccountState.SignedIn("user-b", account) } }
  }

  @Test
  fun deletingAGoogleAccountAsksNoOneAndStartsAsSomeoneNewHoldingNothing() = runBlocking<Unit> {
    server.provider = SignInProvider.SIGN_IN_PROVIDER_GOOGLE
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    withTimeout(10_000) { phone.outboxEmptied() }

    assertTrue(phone.account.deleteAccount { error("Apple is asked only for an Apple account") })

    assertEquals(listOf("user-1" to ""), server.deleted.map { it.first to it.second.appleAuthorizationCode })
    withTimeout(10_000) { phone.account.state.first { it is AccountState.SignedIn && it.userId == "user-2" } }
    // Counted once done, for the screens to start over, whether or not anyone saw it erasing.
    assertEquals(1, phone.account.deleted.value)
    assertNull(phone.pattern("2026-11-02"))
    assertEquals(listOf("token-2", "user-2"), phone.sessions.read()?.let { listOf(it.token, it.userId) })
  }

  @Test
  fun aChangeWhoseCallerStopsWaitingIsStillSettled() = runBlocking<Unit> {
    val phone = signedInDevice()
    server.deleteDelayMs = 500
    val caller = launch { phone.account.deleteAccount { null } }
    eventually { phone.account.state.value is AccountState.Changing }

    caller.cancel()

    withTimeout(10_000) { phone.account.state.first { it is AccountState.SignedIn && it.userId == "user-2" } }
    assertEquals(listOf("user-1"), server.deleted.map { it.first })
    assertEquals(1, phone.account.deleted.value)
  }

  @Test
  fun aCallAskedWhileAChangeWaitsGoesAsTheUserBefore() = runBlocking<Unit> {
    val phone = signedInDevice()
    server.deleteDelayMs = 500
    val deleting = async { phone.account.deleteAccount { null } }
    eventually { phone.account.state.value is AccountState.Changing }

    // Never as whoever the change leaves the device signed in as (spec/sync-protocol.md, Sockets).
    assertEquals("user-1", phone.account.asSignedIn { it.userId })
    assertTrue(deleting.await())
  }

  @Test
  fun anAppEndedWhileErasingGoesOnErasingAndNeverSignsInAsTheUserDeleted() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    phone.kept.writable = false
    assertTrue(phone.account.deleteAccount { null })
    withTimeout(10_000) { phone.account.state.first { it == AccountState.Erasing(AccountState.Erasing.Why.Deleted, failed = true) } }
    // Ended there: the store still keeps the deleted user's session.
    phone.scope.coroutineContext[kotlinx.coroutines.Job]!!.cancelChildren()
    assertEquals("user-1", phone.sessions.read()?.userId)
    assertNull(phone.pattern("2026-11-02"))

    phone.kept.writable = true
    val again = SyncAccount(phone.database, phone.sessions, server.url, okhttp3.OkHttpClient(), phone.scope, linePhotos = phone.linePhotos)
    again.foreground()

    withTimeout(10_000) { again.state.first { it is AccountState.SignedIn } }
    assertEquals("user-2", (again.state.value as AccountState.SignedIn).userId)
    assertEquals(1, again.deleted.value)
  }

  @Test
  fun keepingTheDevicesDataOnASessionTheServerDoesNotKnowEndsIt() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    accountInUse()
    val choose = phone.account.signIn(google) as SignInResult.Choose
    server.token = "gone"

    assertThrows(NotSignedIn::class.java) { runBlocking { phone.account.keepDevice(choose.inUse) } }

    assertEquals(AccountState.SessionEnded, phone.account.state.value)
    assertEquals("night", phone.pattern("2026-11-02"))
  }

  @Test
  fun aUserLeftBehindIsStillDeletedAfterTheAccountSwitchedToIsDeleted() = runBlocking<Unit> {
    val phone = signedInDevice()
    accountInUse()
    server.deleteRefusal = "unavailable"
    phone.account.signIn(google)
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SignedIn("user-b", account) } }
    eventually { called("/pochical.v1.UserService/DeleteAccount").isNotEmpty() }

    server.deleteRefusal = null
    server.provider = SignInProvider.SIGN_IN_PROVIDER_GOOGLE
    assertTrue(phone.account.deleteAccount { null })
    withTimeout(10_000) { phone.account.state.first { it is AccountState.SignedIn && it.userId != "user-b" } }

    eventually { phone.sessions.leftBehind().isEmpty() }
    assertEquals(setOf("user-b", "user-1"), server.deleted.map { it.first }.toSet())
  }

  @Test
  fun deletingAnAppleAccountSendsTheCodeAppleGaveTheWebPage() = runBlocking<Unit> {
    server.provider = SignInProvider.SIGN_IN_PROVIDER_APPLE
    val phone = signedInDevice()

    assertTrue(phone.account.deleteAccount { "apple-code" })

    val asked = server.deleted.single().second
    assertEquals(listOf("apple-code", true), listOf(asked.appleAuthorizationCode, asked.appleCodeFromWeb))
  }

  @Test
  fun cancellingAppleDeletesNothing() = runBlocking<Unit> {
    server.provider = SignInProvider.SIGN_IN_PROVIDER_APPLE
    val phone = signedInDevice()

    assertFalse(phone.account.deleteAccount { null })

    assertTrue(called("/pochical.v1.UserService/DeleteAccount").isEmpty())
    assertTrue(phone.account.state.value is AccountState.SignedIn)
  }

  @Test
  fun aDeletionTheServerRefusesSaysWhyAndKeepsEverything() = runBlocking<Unit> {
    server.provider = SignInProvider.SIGN_IN_PROVIDER_APPLE
    // The sign-in's own GetMe answers only after the deletion is refused: the deletion's tells of Apple.
    server.getMeDelayMs = 1_000
    val phone = signedInDevice()
    eventually { server.getMes.get() == 1 }
    server.getMeDelayMs = 0
    phone.edits.setDay("2026-11-02", DayField.DAY_FIELD_PATTERN, "night")
    server.deleteRefusal = "failed_precondition"

    val failure = assertThrows(DeletionFailure::class.java) { runBlocking { phone.account.deleteAccount { "of another Apple ID" } } }

    assertEquals(DeletionFailure.Reason.AppleRefused, failure.reason)
    assertEquals(AccountState.SignedIn("user-1", LinkedAccount(LinkedAccount.Provider.Apple, null)), phone.account.state.value)
    assertEquals("night", phone.pattern("2026-11-02"))
    assertEquals("token-1", phone.sessions.read()?.token)
  }

  @Test
  fun anAnswerAskedBeforeTheDeletionsNeverUndoesItsOnceItIsRefused() = runBlocking<Unit> {
    // The sign-in's own GetMe, asked while the user was linked to nothing, answers only once the
    // deletion has begun; the deletion's, asked after Apple was linked elsewhere, says Apple.
    server.getMeDelayMs = 1_000
    val phone = signedInDevice()
    eventually { server.getMes.get() == 1 }
    server.provider = SignInProvider.SIGN_IN_PROVIDER_APPLE
    server.getMeDelayMs = 0
    server.deleteDelayMs = 2_000
    server.deleteRefusal = "failed_precondition"

    assertThrows(DeletionFailure::class.java) { runBlocking { phone.account.deleteAccount { "of another Apple ID" } } }

    assertEquals(AccountState.SignedIn("user-1", LinkedAccount(LinkedAccount.Provider.Apple, null)), phone.account.state.value)
  }

  @Test
  fun aDeletionTheServerDoesNotKnowTheSessionOfEndsIt() = runBlocking<Unit> {
    val phone = signedInDevice()
    server.token = "another"

    val failure = assertThrows(DeletionFailure::class.java) { runBlocking { phone.account.deleteAccount { null } } }

    assertEquals(DeletionFailure.Reason.SessionEnded, failure.reason)
    withTimeout(10_000) { phone.account.state.first { it == AccountState.SessionEnded } }
  }

  @Test
  fun aSessionEndingWhileTheServerDeletesIsSettledByItsAnswer() = runBlocking<Unit> {
    val network = FakeNetwork()
    val phone = signedInDevice(network)
    server.deleteDelayMs = 1_000
    val deleting = async { phone.account.deleteAccount { null } }
    eventually { called("/pochical.v1.UserService/DeleteAccount").isNotEmpty() }

    // The user's socket hears the session is gone before the deletion answers.
    server.token = "gone"
    network.changed()
    eventually { (phone.account.state.value as? AccountState.Changing)?.heardUnknown == true }

    assertTrue(deleting.await())
    withTimeout(10_000) { phone.account.state.first { it is AccountState.SignedIn } }
    assertEquals(server.token, phone.sessions.read()?.token)
  }

  @Test
  fun aDeletionThatFailsAfterASessionEndedMeanwhileEndsIt() = runBlocking<Unit> {
    val network = FakeNetwork()
    val phone = signedInDevice(network)
    server.deleteDelayMs = 1_000
    server.deleteRefusal = "internal"
    val deleting = async { runCatching { phone.account.deleteAccount { null } } }
    eventually { called("/pochical.v1.UserService/DeleteAccount").isNotEmpty() }
    server.token = "gone"
    network.changed()

    assertEquals(DeletionFailure.Reason.SessionEnded, (deleting.await().exceptionOrNull() as DeletionFailure).reason)
    assertEquals(AccountState.SessionEnded, phone.account.state.value)
    assertEquals(true, phone.sessions.read()?.ended)
  }

  @Test
  fun erasingThatFailsIsTriedAgainUntilDone() = runBlocking<Unit> {
    val phone = signedInDevice()
    phone.kept.writable = false

    assertTrue(phone.account.deleteAccount { null })

    withTimeout(10_000) { phone.account.state.first { it == AccountState.Erasing(AccountState.Erasing.Why.Deleted, failed = true) } }
    phone.kept.writable = true
    phone.account.eraseAgain()
    withTimeout(10_000) { phone.account.state.first { it is AccountState.SignedIn } }
    delay(100)
    assertEquals(StoredSession(server.token, server.userId), phone.sessions.read())
  }
}
