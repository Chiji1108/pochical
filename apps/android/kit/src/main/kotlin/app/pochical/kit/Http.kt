package app.pochical.kit

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.coroutines.executeAsync

/**
 * The server's answer to [request], the one way :kit's plain HTTP calls go (sign-in, photos):
 * cancelling the caller cancels the call, a body still going up with it, as × stops a photo's
 * upload. OkHttp's own coroutine bridge (okhttp-coroutines); the caller closes the response.
 */
internal suspend fun OkHttpClient.answer(request: Request): Response = newCall(request).executeAsync()
