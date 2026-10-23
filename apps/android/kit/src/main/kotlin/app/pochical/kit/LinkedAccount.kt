package app.pochical.kit

import java.security.SecureRandom
import kotlin.io.encoding.Base64
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

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
 * person holds the provider's account, to link it.
 */
class ProviderToken(val provider: LinkedAccount.Provider, val idToken: String, val nonce: String) {
  /** The account as this device keeps it, its email read from the token. */
  val account: LinkedAccount
    get() = LinkedAccount(provider, emailIn(idToken))
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

private val claims = Json { ignoreUnknownKeys = true }

/** The email an ID token carries, if it does. */
internal fun emailIn(idToken: String): String? {
  val body = idToken.split('.').takeIf { it.size == 3 }?.get(1) ?: return null
  return try {
    val payload = Base64.UrlSafe.withPadding(Base64.PaddingOption.ABSENT_OPTIONAL).decode(body).decodeToString()
    (claims.parseToJsonElement(payload).jsonObject["email"] as? JsonPrimitive)?.takeIf { it.isString }?.content
  } catch (_: IllegalArgumentException) {
    null
  }
}
