package app.pochical.kit

import app.pochical.v1.SignInProvider
import app.pochical.v1.UserServiceClient
import app.pochical.v1.deleteAccountRequest
import app.pochical.v1.getMeRequest
import app.pochical.v1.peekAccountRequest
import app.pochical.v1.providerToken
import app.pochical.v1.takeAccountRequest
import com.connectrpc.Code
import com.connectrpc.ConnectException
import com.connectrpc.ProtocolClientConfig
import com.connectrpc.ResponseMessage
import com.connectrpc.extensions.GoogleJavaLiteProtobufStrategy
import com.connectrpc.impl.ProtocolClient
import com.connectrpc.okhttp.ConnectOkHttpClient
import java.io.IOException
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

  private val headers
    get() = mapOf("Authorization" to listOf("Bearer $token"))

  /** The provider the user is linked to, as the server says, null while anonymous; [ConnectException]. */
  suspend fun linkedProvider(): LinkedAccount.Provider? =
    when (users.getMe(getMeRequest {}, headers).answer().provider) {
      SignInProvider.SIGN_IN_PROVIDER_APPLE -> LinkedAccount.Provider.Apple
      SignInProvider.SIGN_IN_PROVIDER_GOOGLE -> LinkedAccount.Provider.Google
      else -> null
    }

  /**
   * What the account [account] is of holds, when it is another user's; [AccountSuspended] for one
   * Pochical's people suspended, [ConnectException] otherwise.
   */
  suspend fun peekAccount(account: ProviderToken): Holdings {
    val held = users.peekAccount(peekAccountRequest { this.account = account.proto }, headers).answer(suspendedOr)
    return Holdings(held.shiftDays, held.repeating, held.coworkers, held.groups)
  }

  /** Keeps this device's data: the account's user deleted, and [account] linked to this one instead. */
  suspend fun takeAccount(account: ProviderToken) {
    users.takeAccount(takeAccountRequest { this.account = account.proto }, headers).answer(suspendedOr)
  }

  /**
   * Deletes the user and everything of theirs (spec/sync-protocol.md, Deleting an account), with the
   * fresh authorization code Apple's web page gave when the user is linked to Apple, empty otherwise.
   */
  suspend fun deleteAccount(appleCode: String) {
    try {
      users
        .deleteAccount(
          deleteAccountRequest {
            appleAuthorizationCode = appleCode
            appleCodeFromWeb = appleCode.isNotEmpty()
          },
          headers,
        )
        .answer()
    } catch (e: ConnectException) {
      throw DeletionFailure(reasonOf(e), e)
    }
  }
}

private fun <T> ResponseMessage<T>.answer(failed: (ConnectException) -> Exception = { it }): T =
  when (this) {
    is ResponseMessage.Success -> message
    is ResponseMessage.Failure -> throw failed(cause)
  }

/** The server's PERMISSION_DENIED to switching as the account being suspended; any other error as it is. */
private val suspendedOr: (ConnectException) -> Exception = { if (it.code == Code.PERMISSION_DENIED) AccountSuspended() else it }

/** What the server's answer to a deletion says. */
internal fun reasonOf(e: ConnectException): DeletionFailure.Reason =
  when {
    e.code == Code.UNAUTHENTICATED -> DeletionFailure.Reason.SessionEnded
    e.code == Code.FAILED_PRECONDITION -> DeletionFailure.Reason.AppleRefused
    // No answer: OkHttp failed short of an HTTP status (a 503 carries none of this), or it timed out.
    e.exception is IOException || e.code == Code.DEADLINE_EXCEEDED -> DeletionFailure.Reason.Offline
    else -> DeletionFailure.Reason.ServerFailed
  }

private val ProviderToken.proto
  get() = providerToken {
    provider =
      when (this@proto.provider) {
        LinkedAccount.Provider.Apple -> SignInProvider.SIGN_IN_PROVIDER_APPLE
        LinkedAccount.Provider.Google -> SignInProvider.SIGN_IN_PROVIDER_GOOGLE
      }
    idToken = this@proto.idToken
    nonce = this@proto.nonce
  }
