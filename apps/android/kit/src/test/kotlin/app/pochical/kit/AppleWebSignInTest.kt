package app.pochical.kit

import android.net.Uri
import android.util.Base64
import java.security.MessageDigest
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AppleWebSignInTest {
  private val server = MockWebServer()
  private val redeemed = CopyOnWriteArrayList<String>()
  private var redeemStatus = 200

  /** An ID token as Apple's page gives it: only its claims are read on the device. */
  private val idToken =
    "head." +
      Base64.encodeToString(
        """{"sub":"apple-1","email":"x7k2@privaterelay.appleid.com"}""".toByteArray(),
        Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP,
      ) +
      ".signature"

  @Before
  fun start() {
    server.dispatcher =
      object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
          redeemed += request.body!!.utf8()
          return MockResponse.Builder()
            .code(redeemStatus)
            .body(if (redeemStatus == 200) """{"idToken":"$idToken","authorizationCode":"c"}""" else "{}")
            .build()
        }
      }
    server.start()
  }

  @After
  fun stop() = server.close()

  private val signIn
    get() = AppleWebSignIn(server.url("/"), OkHttpClient())

  private fun returned(vararg params: Pair<String, String>): Uri =
    Uri.Builder()
      .scheme("pochical")
      .authority("apple-sign-in")
      .apply { params.forEach { (key, value) -> appendQueryParameter(key, value) } }
      .build()

  private fun sha256(text: String) = MessageDigest.getInstance("SHA-256").digest(text.toByteArray())

  @Test
  fun redeemsTheCodeWithTheVerifierItAskedWith() = runTest {
    val attempt = signIn.start()
    val challenge = attempt.url.getQueryParameter("challenge")!!
    val answer = attempt.finish(returned("code" to "one-time", "state" to challenge))!!
    val token = answer.token
    val body = Json.parseToJsonElement(redeemed.single()).jsonObject
    val verifier = body["verifier"]!!.jsonPrimitive.content
    val verifierChallenge =
      Base64.encodeToString(sha256(verifier), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    val nonceHash = sha256(token.nonce).joinToString("") { "%02x".format(it) }
    assertEquals(
      listOf(
        "/apple/authorize",
        "one-time",
        challenge,
        attempt.url.getQueryParameter("nonce"),
        LinkedAccount(LinkedAccount.Provider.Apple, "x7k2@privaterelay.appleid.com"),
        idToken,
        "c",
      ),
      listOf(
        attempt.url.path,
        body["code"]!!.jsonPrimitive.content,
        verifierChallenge,
        nonceHash,
        token.account,
        token.idToken,
        answer.authorizationCode,
      ),
    )
  }

  @Test
  fun takesNoReturnOfAnotherAttempt() = runTest {
    val attempt = signIn.start()
    val other = signIn.start()
    val otherState = other.url.getQueryParameter("challenge")!!
    val failure = runCatching { attempt.finish(returned("code" to "theirs", "state" to otherState)) }
    assertEquals(listOf(AppleSignInFailed::class, null), listOf(failure.exceptionOrNull()?.let { it::class }, redeemed.firstOrNull()))
  }

  @Test
  fun aCancelIsNoAccount() = runTest {
    val attempt = signIn.start()
    val state = attempt.url.getQueryParameter("challenge")!!
    assertNull(attempt.finish(returned("error" to "cancelled", "state" to state)))
    assertTrue(redeemed.isEmpty())
  }

  @Test
  fun aRefusedCodeFails() = runTest {
    redeemStatus = 400
    val attempt = signIn.start()
    val state = attempt.url.getQueryParameter("challenge")!!
    val failure = runCatching { attempt.finish(returned("code" to "used", "state" to state)) }
    assertEquals(AppleSignInFailed::class, failure.exceptionOrNull()?.let { it::class })
  }

  @Test
  fun eachAttemptHasItsOwnChallengeAndNonce() {
    val first = signIn.start().url
    val second = signIn.start().url
    assertTrue(first.getQueryParameter("challenge") != second.getQueryParameter("challenge"))
    assertTrue(first.getQueryParameter("nonce") != second.getQueryParameter("nonce"))
  }
}
