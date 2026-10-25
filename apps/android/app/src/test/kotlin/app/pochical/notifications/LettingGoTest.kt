package app.pochical.notifications

import app.pochical.kit.AccountState
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class LettingGoTest {
  private val signedIn = AccountState.SignedIn("u1", null)

  private fun lettingGoIn(vararg states: AccountState) = runBlocking { lettingGo(flowOf(*states)).toList().size }

  @Test
  fun erasingLetsGoAtOnceEvenOffline() =
    assertEquals(1, lettingGoIn(signedIn, AccountState.Erasing(AccountState.Erasing.Why.SignedOut)))

  @Test
  fun aChangeWaitingOnTheServerDoesNot() =
    assertEquals(0, lettingGoIn(signedIn, AccountState.Changing(signedIn), signedIn))

  @Test
  fun anotherUserStraightAwayDoes() = assertEquals(1, lettingGoIn(signedIn, AccountState.SignedIn("u2", null)))

  @Test
  fun signingInAgainAsTheSameUserDoesNot() =
    assertEquals(0, lettingGoIn(AccountState.SigningIn, signedIn, AccountState.SigningIn, signedIn))
}
