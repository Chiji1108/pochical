package app.pochical

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import app.pochical.kit.AccountState
import app.pochical.kit.DeletionFailure
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch

/** アカウントを削除 under way, for 設定 › アカウント. */
val LocalAccountDeletion = staticCompositionLocalOf<AccountDeletion> { error("No account deletion provided") }

/**
 * アカウントを削除 under way (spec/sync-protocol.md, Deleting an account), kept by the app rather
 * than the page that asked, in [scope] on the main thread, as [SignIns] keeps a sign-in: an activity
 * made anew while Apple's page is open for its code ([AppleSignIn.authorizationCode]), as it is
 * turned, shows the same deletion going on, and hears how it went. [deleteAccount] is
 * `SyncAccount.deleteAccount`, given Apple's code to ask with, and [account] its state.
 */
class AccountDeletion(
  private val deleteAccount: suspend (appleCode: suspend () -> String?) -> Boolean,
  private val appleCode: suspend () -> String?,
  account: Flow<AccountState>,
  private val scope: CoroutineScope,
) {
  /** From the tap on, as the server and Apple are asked before the account begins changing. */
  var deleting by mutableStateOf(false)
    private set

  /** Why the deletion did not go, until the person has read it. */
  var failure by mutableStateOf<DeletionFailure.Reason?>(null)
    private set

  init {
    // The device letting go of the user, or its session ended, a failure of theirs goes too, as
    // SignIns' answers do: it was of an account no longer here.
    scope.launch {
      account.collect { if (it is AccountState.Erasing || it == AccountState.SessionEnded) failure = null }
    }
  }

  /** アカウントとすべてのデータを削除, one deletion at a time. */
  fun delete() {
    if (deleting) return
    deleting = true
    scope.launch {
      try {
        deleteAccount(appleCode)
      } catch (e: DeletionFailure) {
        // A session the server does not know is said in place of the app, not here.
        if (e.reason != DeletionFailure.Reason.SessionEnded) failure = e.reason
      } finally {
        deleting = false
      }
    }
  }

  /** The failure said has been read. */
  fun failureRead() {
    failure = null
  }
}
