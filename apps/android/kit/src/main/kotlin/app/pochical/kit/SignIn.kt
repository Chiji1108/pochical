package app.pochical.kit

import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** The server answered a sign-in without a session the app can keep. */
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
    http.newCall(request).execute().use { response ->
      val token = response.header("set-auth-token")
      if (!response.isSuccessful || token.isNullOrEmpty()) throw SignInRefused(response.code)
      val answer = answers.decodeFromString(SignInAnswer.serializer(), response.body.string())
      StoredSession(token, answer.user.id)
    }
  }
