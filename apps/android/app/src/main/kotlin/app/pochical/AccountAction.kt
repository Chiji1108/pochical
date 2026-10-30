package app.pochical

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import app.pochical.kit.AccountState
import app.pochical.kit.DeletionFailure
import app.pochical.kit.NotSignedIn
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch

/** ログアウト and アカウントを削除 under way, for 設定 › アカウント. */
val LocalAccountActions = staticCompositionLocalOf<AccountActions> { error("No account actions provided") }

/**
 * 設定 › アカウント's ログアウト and アカウントを削除 (spec/sync-protocol.md, Signing out; Deleting an
 * account), kept by the app, in [scope] on the main thread, as [SignIns] keeps a sign-in. [signOut] is
 * `SyncAccount.signOut`, [deleteAccount] `SyncAccount.deleteAccount` with Apple asked for its code,
 * and [account] their account's state.
 */
class AccountActions(
  signOut: suspend () -> Unit,
  deleteAccount: suspend () -> Unit,
  account: Flow<AccountState>,
  scope: CoroutineScope,
) {
  /**
   * ログアウト: any failure said as one, as the device is signed in as before; a session the server
   * does not know is said in place of the app, not here.
   */
  val signOut = AccountAction(signOut, { if (it is NotSignedIn) null else Unit }, account, scope)

  /** アカウントを削除, saying why it did not go, an ended session again in place of the app. */
  val deletion =
    AccountAction(
      deleteAccount,
      { e ->
        ((e as? DeletionFailure)?.reason ?: DeletionFailure.Reason.ServerFailed).takeIf {
          it != DeletionFailure.Reason.SessionEnded
        }
      },
      account,
      scope,
    )

  /** Either under way, as one change of who the device is goes at a time. */
  val running get() = signOut.running || deletion.running
}

/**
 * One change of the account the person asked for, kept by the app rather than the page that asked:
 * an activity made anew meanwhile, as it is turned or while Apple's page is open for a deletion's code
 * ([AppleSignIn.authorizationCode]), shows the same change going on, and hears how it went. [act] is
 * the account's own call, and [failureOf] what is said of what it threw, null for nothing; [account]
 * is the account's state.
 */
class AccountAction<F : Any>(
  private val act: suspend () -> Unit,
  private val failureOf: (Exception) -> F?,
  account: Flow<AccountState>,
  private val scope: CoroutineScope,
) {
  /** From the tap on, as the outbox, the server and Apple are asked before the account begins changing. */
  var running by mutableStateOf(false)
    private set

  /** Why it did not go, until the person has read it. */
  var failure by mutableStateOf<F?>(null)
    private set

  init {
    // The device letting go of the user, or its session ended, a failure of theirs goes too, as
    // SignIns' answers do: it was of an account no longer here.
    scope.launch {
      account.collect { if (it is AccountState.Erasing || it == AccountState.SessionEnded) failure = null }
    }
  }

  /** Asked once, one at a time. */
  fun run() {
    if (running) return
    running = true
    scope.launch {
      try {
        act()
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        failure = failureOf(e)
      } finally {
        running = false
      }
    }
  }

  /** The failure said has been read. */
  fun failureRead() {
    failure = null
  }
}
