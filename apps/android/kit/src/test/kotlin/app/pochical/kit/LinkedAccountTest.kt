package app.pochical.kit

import kotlin.io.encoding.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** An unsigned ID token carrying [claims], as a provider's is shaped. */
internal fun idToken(claims: String): String {
  val part = { text: String -> Base64.UrlSafe.withPadding(Base64.PaddingOption.ABSENT).encode(text.encodeToByteArray()) }
  return "${part("""{"alg":"RS256"}""")}.${part(claims)}.signature"
}

class LinkedAccountTest {
  @Test
  fun theAccountKeptNamesTheEmailTheTokenCarries() {
    val token = ProviderToken(LinkedAccount.Provider.Google, idToken("""{"email":"ア@example.com","aud":"web"}"""), "n")
    assertEquals(LinkedAccount(LinkedAccount.Provider.Google, "ア@example.com"), token.account)
  }

  @Test
  fun aTokenWithoutAnEmailKeepsNone() {
    assertNull(emailIn(idToken("""{"aud":"web"}""")))
    assertNull(emailIn(idToken("""{"email":7}""")))
    assertNull(emailIn("not.a-token"))
    assertNull(emailIn("a.%%%.c"))
  }

  @Test
  fun eachNonceIsNew() {
    val nonce = signInNonce()
    assertEquals(64, nonce.length)
    assertNotEquals(nonce, signInNonce())
  }
}
