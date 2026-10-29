package app.pochical

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import app.pochical.kit.AccountState
import app.pochical.kit.AccountSuspended
import app.pochical.kit.FirstRun
import app.pochical.kit.InUse
import app.pochical.kit.LinkRefused
import app.pochical.kit.LinkedAccount
import app.pochical.kit.NotSignedIn
import app.pochical.kit.ProviderToken
import app.pochical.kit.SignInResult
import app.pochical.kit.SyncAccount
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** The sign-ins under way, for the pages that offer Appleで続ける and Googleで続ける. */
val LocalSignIns = staticCompositionLocalOf<SignIns> { error("No sign-ins provided") }

/** Why signing in did not go, each said in a dialog naming the provider where it says one. */
enum class SignInProblem(val title: Int, val message: Int?) {
  Failed(R.string.account_sign_in_failed, null),
  NoGoogleAccount(R.string.account_no_google_title, R.string.account_no_google_body),
  /** Suspended by Pochical's people: said as such, as trying again would not help. */
  Suspended(R.string.account_suspended_title, R.string.account_suspended_body),
}

/**
 * What a sign-in came to, once the device holds what it brought: [holdsPatterns] when the patterns
 * are there, as an account in use brings its own (FirstRun.holdsPatternsAfter).
 */
data class SignedIn(val result: SignInResult, val holdsPatterns: Boolean)

/**
 * Appleで続ける and Googleで続ける under way (spec/sync-protocol.md, Signing in; Switching to an
 * account in use), kept by the app rather than the page that asked, in [scope] on the main thread:
 * an activity made anew while Apple's page or Google's sheet is open, as it is turned, shows the same
 * sign-in going on, and hears how it went. One whose Apple page was open as the app's process ended
 * goes on too, once the page returns ([AppleSignIn.resumed]).
 */
class SignIns(
  private val account: SyncAccount,
  private val firstRun: FirstRun,
  apple: AppleSignIn,
  private val scope: CoroutineScope,
) {
  /** The provider whose sign-in runs, one at a time. */
  var busy by mutableStateOf<LinkedAccount.Provider?>(null)
    private set

  /** The account in use the person is asked to choose a side of, until they answer. */
  var choosing by mutableStateOf<InUse?>(null)
    private set

  /** What went wrong, until the person has read it. */
  var problem by mutableStateOf<Pair<SignInProblem, LinkedAccount.Provider>?>(null)
    private set

  /**
   * What signing in came to, decided here rather than by the page, so it is had however the page
   * changes meanwhile; until the page that asked goes on from it ([handled]).
   */
  var done by mutableStateOf<SignedIn?>(null)
    private set

  init {
    scope.launch { for (resumed in apple.resumed) signIn(LinkedAccount.Provider.Apple, resumed) }
    // The device letting go of the user, or its session ended, what was asked of them goes too.
    scope.launch {
      account.state.collect {
        if (it is AccountState.Erasing || it == AccountState.SessionEnded) {
          choosing = null
          done = null
        }
      }
    }
  }

  /** Signs in with the account [providerToken] gives, null when the person cancelled. */
  fun signIn(provider: LinkedAccount.Provider, providerToken: suspend () -> ProviderToken?) =
    run(provider) {
      when (val result = providerToken()?.let { account.signIn(it) }) {
        is SignInResult.Choose -> choosing = result.inUse
        null -> Unit
        else -> finished(result)
      }
    }

  /** アカウントのデータを使う, asked of [inUse]. */
  fun useAccount(inUse: InUse) {
    choosing = null
    run(inUse.token.provider) {
      account.useAccount(inUse)
      finished(SignInResult.Switched)
    }
  }

  /** この端末のデータを使う, asked of [inUse]. */
  fun keepDevice(inUse: InUse) {
    choosing = null
    run(inUse.token.provider) {
      account.keepDevice(inUse)
      finished(SignInResult.Linked)
    }
  }

  /** キャンセル, asked which side to keep. */
  fun cancelChoosing() {
    choosing = null
  }

  /** The problem said has been read. */
  fun problemRead() {
    problem = null
  }

  /** The page that asked has gone on from what signing in came to. */
  fun handled() {
    done = null
  }

  private suspend fun finished(result: SignInResult) {
    done = SignedIn(result, firstRun.holdsPatternsAfter(result, account))
  }

  private fun run(provider: LinkedAccount.Provider, step: suspend () -> Unit) {
    if (busy != null) return
    busy = provider
    scope.launch {
      val failed =
        try {
          step()
          null
        } catch (e: CancellationException) {
          throw e
        } catch (e: NotSignedIn) {
          // Said in place of the app, as the server no longer knows the session; otherwise the
          // device has none to sign in with, as when it could not reach the server.
          if (account.state.value == AccountState.SessionEnded) null else SignInProblem.Failed
        } catch (e: LinkRefused) {
          // Linked already, as on another device: the page shows the account the server names.
          if (e.status == 417) null else SignInProblem.Failed
        } catch (_: AccountSuspended) {
          SignInProblem.Suspended
        } catch (_: NoGoogleAccount) {
          SignInProblem.NoGoogleAccount
        } catch (_: Exception) {
          SignInProblem.Failed
        } finally {
          busy = null
        }
      problem = failed?.let { it to provider }
    }
  }
}
