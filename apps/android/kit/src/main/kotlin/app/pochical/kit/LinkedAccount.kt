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
enum class LinkResult {
  /** Linked: the user stays, no longer anonymous. */
  Linked,

  /**
   * The provider's account is another user's already, as from another phone (spec/sync-protocol.md,
   * Switching to an account in use).
   */
  InUse,
}
