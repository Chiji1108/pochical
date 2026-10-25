package app.pochical.kit

import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** The server answered a sign-in without a session the app can keep, as one it cannot read. */
class SignInRefused(status: Int) : IOException("Sign-in answered $status")

@Serializable private data class SignInAnswer(val user: User) {
  @Serializable data class User(val id: String)
}

private val answers = Json { ignoreUnknownKeys = true }

/**
 * Signs in as a new anonymous user (spec/sync-protocol.md, Signing in): better-auth's JSON, the one
 * part of the server outside proto/, answers with the token in `set-auth-token` and the user in its
 * body. The cookie it also sets is neither kept nor sent.
 */
suspend fun signInAnonymously(http: OkHttpClient, server: HttpUrl): StoredSession =
  withContext(Dispatchers.IO) {
    val request =
      Request.Builder()
        .url(server.resolve("/api/auth/sign-in/anonymous")!!)
        .post("{}".toRequestBody("application/json".toMediaType()))
        .build()
    signedIn(http, request)
  }

/**
 * Signs in to the user the provider's account is linked to (better-auth's `/sign-in/social`, with
 * its ID token), on the session [token] the device has now: the switch to the account's data
 * (spec/sync-protocol.md, Switching to an account in use). [AccountSuspended] for a user Pochical's
 * people suspended; [SignInRefused] otherwise.
 */
suspend fun signInSocial(http: OkHttpClient, server: HttpUrl, token: String, account: ProviderToken): StoredSession =
  withContext(Dispatchers.IO) {
    val request =
      Request.Builder()
        .url(server.resolve("/api/auth/sign-in/social")!!)
        .header("Authorization", "Bearer $token")
        .post(account.socialBody().toRequestBody("application/json".toMediaType()))
        .build()
    signedIn(http, request)
  }

@Serializable private data class Refusal(val code: String? = null)

/** The session a sign-in answered with: its token in `set-auth-token`, its user's id in the body. */
private suspend fun signedIn(http: OkHttpClient, request: Request): StoredSession =
  http.answer(request).use { response ->
    val token = response.header("set-auth-token")
    val body = response.body.string()
    if (response.code == 403 && refusalCode(body) == SUSPENDED) throw AccountSuspended()
    if (!response.isSuccessful || token.isNullOrEmpty()) throw SignInRefused(response.code)
    val answer =
      try {
        answers.decodeFromString(SignInAnswer.serializer(), body)
      } catch (_: SerializationException) {
        throw SignInRefused(response.code)
      }
    StoredSession(token, answer.user.id)
  }

private fun refusalCode(body: String): String? =
  try {
    answers.decodeFromString(Refusal.serializer(), body).code
  } catch (_: SerializationException) {
    null
  }

/** better-auth's code for a suspended user's sign-in (the server's `USER_SUSPENDED`). */
private const val SUSPENDED = "USER_SUSPENDED"

/** As better-auth's `/link-social` and `/sign-in/social` take it. */
private fun ProviderToken.socialBody(): String =
  buildJsonObject {
      put("provider", provider.serialName)
      putJsonObject("idToken") {
        put("token", idToken)
        put("nonce", nonce)
      }
    }
    .toString()

/** Linking was refused for another reason than the account being in use. */
class LinkRefused(val status: Int) : IOException("Linking answered $status")

/**
 * Links the provider's account to the user of the session [token] (better-auth's `/link-social`),
 * keeping the user and all of theirs. Its cookie is neither sent nor kept: with one and no Origin,
 * better-auth takes the call for a browser's from another site.
 */
internal suspend fun linkSocial(http: OkHttpClient, server: HttpUrl, token: String, account: ProviderToken): LinkResult =
  withContext(Dispatchers.IO) {
    val request =
      Request.Builder()
        .url(server.resolve("/api/auth/link-social")!!)
        .header("Authorization", "Bearer $token")
        .post(account.socialBody().toRequestBody("application/json".toMediaType()))
        .build()
    http.answer(request).use { response ->
      when (response.code) {
        200 -> LinkResult.Linked
        409 -> LinkResult.InUse
        else -> throw LinkRefused(response.code)
      }
    }
  }

/** better-auth answered a sign-out with [status], ending nothing. */
class SignOutRefused(val status: Int) : IOException("Sign-out answered $status")

/**
 * Ends the session [token] on the server (better-auth's `/sign-out`), which closes its sockets and
 * drops its push token (spec/sync-protocol.md, Signing out). [SignOutRefused] when it ends nothing.
 */
internal suspend fun signOutSession(http: OkHttpClient, server: HttpUrl, token: String) =
  withContext(Dispatchers.IO) {
    val request =
      Request.Builder()
        .url(server.resolve("/api/auth/sign-out")!!)
        .header("Authorization", "Bearer $token")
        .post("{}".toRequestBody("application/json".toMediaType()))
        .build()
    http.answer(request).use { response -> if (!response.isSuccessful) throw SignOutRefused(response.code) }
  }

private val LinkedAccount.Provider.serialName
  get() = LinkedAccount.Provider.serializer().descriptor.getElementName(ordinal)
