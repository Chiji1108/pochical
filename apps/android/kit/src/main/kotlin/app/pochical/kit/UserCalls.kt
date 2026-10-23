package app.pochical.kit

import app.pochical.v1.SignInProvider
import app.pochical.v1.UserServiceClient
import app.pochical.v1.getMeRequest
import com.connectrpc.ConnectException
import com.connectrpc.ProtocolClientConfig
import com.connectrpc.ResponseMessage
import com.connectrpc.extensions.GoogleJavaLiteProtobufStrategy
import com.connectrpc.impl.ProtocolClient
import com.connectrpc.okhttp.ConnectOkHttpClient
import okhttp3.HttpUrl
import okhttp3.OkHttpClient

/** UserService, as the session [token]'s user. */
internal class UserCalls(http: OkHttpClient, server: HttpUrl, private val token: String) {
  private val users =
    UserServiceClient(
      ProtocolClient(
        ConnectOkHttpClient(http),
        ProtocolClientConfig(host = server.toString().trimEnd('/'), serializationStrategy = GoogleJavaLiteProtobufStrategy()),
      )
    )

  /** The provider the user is linked to, as the server says, null while anonymous; [ConnectException]. */
  suspend fun linkedProvider(): LinkedAccount.Provider? =
    when (val answer = users.getMe(getMeRequest {}, mapOf("Authorization" to listOf("Bearer $token")))) {
      is ResponseMessage.Success ->
        when (answer.message.provider) {
          SignInProvider.SIGN_IN_PROVIDER_APPLE -> LinkedAccount.Provider.Apple
          SignInProvider.SIGN_IN_PROVIDER_GOOGLE -> LinkedAccount.Provider.Google
          else -> null
        }
      is ResponseMessage.Failure -> throw answer.cause
    }
}
