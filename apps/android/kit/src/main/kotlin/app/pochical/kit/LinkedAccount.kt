package app.pochical.kit

import java.security.SecureRandom
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The account the user is linked to (spec/sync-protocol.md, Signing in), as 設定's アカウント shows
 * it: the email is the provider's, read from its ID token as the person signs in and kept on this
 * device alone, as the server keeps none.
 */
@Serializable
data class LinkedAccount(val provider: Provider, val email: String?) {
  /** Where the person signs in besides anonymously, each by better-auth's id for it. */
  @Serializable
  enum class Provider(val displayName: String) {
    @SerialName("apple") Apple("Apple"),
    @SerialName("google") Google("Google"),
  }
}

/**
 * A provider's ID token as signing in got it, with the nonce it was asked with: what proves the
 * person holds the provider's account, to link it. [email] is the one the provider says the token
 * carries.
 */
class ProviderToken(val provider: LinkedAccount.Provider, val idToken: String, val nonce: String, val email: String?) {
  /** The account as this device keeps it. */
  val account: LinkedAccount
    get() = LinkedAccount(provider, email)
}

/**
 * A nonce for signing in: Google puts it in the ID token as it is (Apple its SHA-256), and the
 * server, given it, checks the token carries it, so a token taken from elsewhere is not sent again.
 */
fun signInNonce(): String {
  val bytes = ByteArray(32).also(SecureRandom()::nextBytes)
  return bytes.joinToString("") { "%02x".format(it) }
}

/** What linking a provider's account said. */
internal enum class LinkResult {
  /** Linked: the user stays, no longer anonymous. */
  Linked,

  /**
   * The provider's account is another user's already, as from another phone (spec/sync-protocol.md,
   * Switching to an account in use).
   */
  InUse,
}

/**
 * What a user holds that the person entered (spec/sync-protocol.md, Switching to an account in use),
 * from which a few taps tried can be told from months of use. Patterns are not counted, as every
 * user has some.
 */
data class Holdings(val shiftDays: Int = 0, val repeating: Boolean = false, val coworkers: Int = 0, val groups: Int = 0) {
  /** Nothing entered: a side that holds nothing is let go without asking. */
  val isEmpty: Boolean
    get() = shiftDays == 0 && !repeating && coworkers == 0 && groups == 0
}

/** The provider's account is another user's: what each side holds, for the person to choose which to keep. */
class InUse(val token: ProviderToken, val account: Holdings, val device: Holdings)

/** How signing in with a provider ended. */
sealed interface SignInResult {
  /** The provider's account is this user's now, keeping what the device holds. */
  data object Linked : SignInResult

  /** The device is the account's user now, catching up from it. */
  data object Switched : SignInResult

  /** Both sides hold something: the person chooses, [SyncAccount.useAccount] or [SyncAccount.keepDevice]. */
  class Choose(val inUse: InUse) : SignInResult
}

/**
 * The account is suspended by Pochical's people (spec/admin.md, ユーザー): signing in or switching
 * to it is refused, which the app says as such rather than as a failure to try again.
 */
class AccountSuspended : Exception()

/** The device is no longer signed in as the account a change was asked for: nothing changed. */
class AccountChanged : Exception()

/**
 * Why the account was not deleted (spec/sync-protocol.md, Deleting an account), each for the app to
 * say what to do next. Nothing was deleted, or the deletion was cut off part way and finishes as it
 * is tried again.
 */
class DeletionFailure(val reason: Reason, cause: Throwable? = null) : Exception(reason.name, cause) {
  enum class Reason {
    /** No session yet, as before the first sign-in reaches the server. */
    NotSignedIn,

    /** The account changed, or the device signed out or started afresh, while Apple was asked. */
    AccountChanged,

    /** The server does not know the session (401): said in place of the app, not where it was asked. */
    SessionEnded,

    /** Apple, asked once more for its code, gave none, the person not having cancelled. */
    AppleUnconfirmed,

    /** The server could not revoke Apple's tokens (FAILED_PRECONDITION). */
    AppleRefused,

    /** The server was not reached: offline, the connection dropped, or the call timed out. */
    Offline,

    /** The server answered with an error of its own. */
    ServerFailed,
  }
}
