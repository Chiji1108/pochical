package app.pochical

import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import app.pochical.kit.LinkedAccount
import app.pochical.kit.ProviderToken
import app.pochical.kit.signInNonce
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/** Sign in with Google did not hand back an ID token. */
class GoogleSignInFailed(cause: Throwable? = null) : Exception(cause)

/** The phone has no Google account to sign in with: one is added in its settings. */
class NoGoogleAccount(cause: Throwable) : Exception(cause)

/**
 * Googleで続ける through Credential Manager's Sign in with Google (spec/sync-protocol.md, Signing
 * in): an ID token for the Web client, carrying the email and the nonce as it is. The credential
 * state is cleared at once, so the device keeps no Google session: Pochical needs nothing of
 * Google's after the token. Null when the person cancelled; [NoGoogleAccount] or
 * [GoogleSignInFailed] otherwise.
 *
 * [context] is the activity the sheet shows over.
 */
suspend fun signInWithGoogle(context: Context): ProviderToken? {
  val manager = CredentialManager.create(context)
  val nonce = signInNonce()
  val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).setNonce(nonce).build()
  val credential =
    try {
      manager.getCredential(context, GetCredentialRequest(listOf(option))).credential
    } catch (_: GetCredentialCancellationException) {
      return null
    } catch (e: NoCredentialException) {
      throw NoGoogleAccount(e)
    } catch (e: GetCredentialException) {
      throw GoogleSignInFailed(e)
    } finally {
      manager.clearCredentialState(ClearCredentialStateRequest())
    }
  if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
    throw GoogleSignInFailed()
  }
  val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
  return ProviderToken(LinkedAccount.Provider.Google, idToken, nonce)
}
