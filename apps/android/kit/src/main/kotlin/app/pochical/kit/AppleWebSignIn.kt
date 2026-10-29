package app.pochical.kit

import android.net.Uri
import android.util.Base64
import java.io.IOException
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** Apple's page gave no account: the server or Apple failed, or the return was not this sign-in's. */
class AppleSignInFailed(message: String) : IOException(message)

@Serializable private data class Redeemed(val idToken: String, val authorizationCode: String)

/**
 * What Apple's page answered: the person's account, and the authorization code Apple gave the
 * Services ID with it, which deleting the account sends for Apple's tokens to be revoked
 * (spec/sync-protocol.md, Deleting an account).
 */
class AppleAnswer(val token: ProviderToken, val authorizationCode: String)

private val answers = Json { ignoreUnknownKeys = true }

/**
 * Sign in with Apple on Android (spec/sync-protocol.md, Signing in), which has none of its own:
 * Apple's web page, opened by way of the server, posts back to the server, which hands its answer
 * on to the app's scheme under a one-time code. The app redeems the code with the verifier only it
 * holds, and goes on with Apple's ID token as iOS does.
 */
class AppleWebSignIn(private val server: HttpUrl, http: Lazy<OkHttpClient>) {
  private val http by http

  /** A new sign-in, with its own verifier and nonce. */
  fun start(): Attempt = Attempt(nonce = signInNonce(), verifier = signInNonce())

  /** What the app keeps of a sign-in while its page is open, as an activity's saved state. */
  data class Kept(val nonce: String, val verifier: String)

  /** The sign-in [kept] was kept as, for an app whose process ended while its page was open. */
  fun resume(kept: Kept): Attempt = Attempt(kept.nonce, kept.verifier)

  /** One sign-in: the page the browser opens, and the account from what it returns to. */
  inner class Attempt internal constructor(private val nonce: String, private val verifier: String) {
    /** What the app keeps of it while its page is open. */
    val kept: Kept
      get() = Kept(nonce, verifier)

    /** Its verifier's S256 challenge, which Apple echoes as the state. */
    private val challenge = base64Url(sha256(verifier))

    /** Apple's page, by way of the server, asked with the nonce's SHA-256, as iOS asks. */
    val url: Uri =
      Uri.parse(
        server
          .resolve("/apple/authorize")!!
          .newBuilder()
          .addQueryParameter("challenge", challenge)
          .addQueryParameter("nonce", sha256(nonce).joinToString("") { "%02x".format(it) })
          .build()
          .toString()
      )

    /** Whether [returned] is where this sign-in's page came back to, not another's. */
    fun isItsReturn(returned: Uri): Boolean =
      returned.scheme == RETURN_SCHEME && returned.host == RETURN_HOST && returned.getQueryParameter("state") == challenge

    /**
     * Apple's answer from [returned], the URI the browser came back to: null when they
     * cancelled, [AppleSignInFailed] when it is not this attempt's or Apple's page or the server
     * failed. A code is redeemed once, so this is called once.
     */
    suspend fun finish(returned: Uri): AppleAnswer? {
      if (!isItsReturn(returned)) throw AppleSignInFailed("Not this sign-in's return")
      when (returned.getQueryParameter("error")) {
        null -> {}
        "cancelled" -> return null
        else -> throw AppleSignInFailed("Apple's page failed")
      }
      val code = returned.getQueryParameter("code") ?: throw AppleSignInFailed("No code came back")
      val redeemed = redeem(code)
      val token = ProviderToken(LinkedAccount.Provider.Apple, redeemed.idToken, nonce, emailOf(redeemed.idToken))
      return AppleAnswer(token, redeemed.authorizationCode)
    }

    private suspend fun redeem(code: String): Redeemed =
      withContext(Dispatchers.IO) {
        val body =
          buildJsonObject {
              put("code", code)
              put("verifier", verifier)
            }
            .toString()
        val request =
          Request.Builder()
            .url(server.resolve("/apple/redeem")!!)
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        http.answer(request).use { response ->
          if (!response.isSuccessful) throw AppleSignInFailed("Redeeming answered ${response.code}")
          try {
            answers.decodeFromString(Redeemed.serializer(), response.body.string())
          } catch (_: SerializationException) {
            throw AppleSignInFailed("Redeeming answered no ID token and code")
          }
        }
      }
  }

  companion object {
    /** Where the server sends the browser back to: the app's own scheme, which its Auth Tab awaits. */
    const val RETURN_SCHEME = "pochical"
    const val RETURN_HOST = "apple-sign-in"
  }
}

private fun sha256(text: String): ByteArray = MessageDigest.getInstance("SHA-256").digest(text.toByteArray())

private fun base64Url(bytes: ByteArray): String =
  Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

/** The email Apple's ID token carries, for 設定's アカウント; it is checked by the server, not here. */
private fun emailOf(idToken: String): String? =
  try {
    val claims = String(Base64.decode(idToken.split('.')[1], Base64.URL_SAFE))
    answers.parseToJsonElement(claims).jsonObject["email"]?.jsonPrimitive?.contentOrNull
  } catch (_: IllegalArgumentException) {
    null
  } catch (_: IndexOutOfBoundsException) {
    null
  }
