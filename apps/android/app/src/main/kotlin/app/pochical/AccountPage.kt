package app.pochical

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.pochical.design.GoogleButtonColors
import app.pochical.design.Metrics
import app.pochical.kit.AccountState
import app.pochical.kit.LinkResult
import app.pochical.kit.LinkRefused
import app.pochical.kit.LinkedAccount
import app.pochical.kit.NotSignedIn
import app.pochical.kit.ProviderToken
import app.pochical.kit.SyncAccount
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** The account the device syncs as, for the pages that show or change it. */
val LocalAccount = staticCompositionLocalOf<SyncAccount> { error("No account provided") }

/** 設定's アカウント row: the provider signed in with, or ログインしていません. */
@Composable
fun AccountRow(open: (RootPage) -> Unit) {
  val state by LocalAccount.current.state.collectAsState()
  val linked = (state as? AccountState.SignedIn)?.linked
  ListItem(
    headlineContent = { Text(stringResource(R.string.account)) },
    supportingContent = { Text(linked?.provider?.displayName ?: stringResource(R.string.account_not_signed_in)) },
    modifier = Modifier.clickable { open(RootPage.Account) },
  )
}

/**
 * アカウント (/design's AccountPage): before signing in, what it keeps and the way in; after, which
 * account it is. Signing in is optional, so the page never pushes it beyond saying what it keeps.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountPage(onBack: () -> Unit) {
  val account = LocalAccount.current
  val state by account.state.collectAsState()
  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text(stringResource(R.string.account)) },
        navigationIcon = {
          IconButton(onClick = onBack) {
            Icon(painterResource(R.drawable.ic_back), contentDescription = stringResource(R.string.back))
          }
        },
      )
    }
  ) { padding ->
    LazyColumn(contentPadding = padding) {
      val linked = (state as? AccountState.SignedIn)?.linked
      if (linked != null) {
        item { SectionHeader(stringResource(R.string.account_signed_in)) }
        item {
          ListItem(
            leadingContent = {
              when (linked.provider) {
                LinkedAccount.Provider.Apple ->
                  Icon(painterResource(R.drawable.ic_apple_logo), contentDescription = null, Modifier.size(24.dp))
                LinkedAccount.Provider.Google ->
                  Image(painterResource(R.drawable.ic_google_g), contentDescription = null, Modifier.size(24.dp))
              }
            },
            headlineContent = { Text(linked.provider.displayName) },
            supportingContent = linked.email?.let { email -> { Text(email) } },
          )
        }
        item { Footnote(stringResource(R.string.account_signed_in_note)) }
      } else {
        item { SignInSection(state) }
      }
    }
  }
}

/** What signing in keeps, and the ways in, ready once the device has its session. */
@Composable
private fun SignInSection(state: AccountState) {
  val signedIn = state is AccountState.SignedIn
  val account = LocalAccount.current
  val apple = LocalAppleSignIn.current
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  // The provider whose sign-in runs, one at a time, and what went wrong with whose.
  var busy by remember { mutableStateOf<LinkedAccount.Provider?>(null) }
  var problem by remember { mutableStateOf<Pair<SignInProblem, LinkedAccount.Provider>?>(null) }
  fun signIn(provider: LinkedAccount.Provider, providerToken: suspend () -> ProviderToken?) {
    if (busy != null) return
    busy = provider
    scope.launch {
      val failed =
        try {
          when (providerToken()?.let { account.link(it) }) {
            null, LinkResult.Linked -> null
            LinkResult.InUse -> SignInProblem.InUse
          }
        } catch (e: CancellationException) {
          throw e
        } catch (_: NotSignedIn) {
          // Said in place of the app, as the server no longer knows the session.
          null
        } catch (e: LinkRefused) {
          // Linked already, as on another device: the page shows the account the server names.
          if (e.status == 417) null else SignInProblem.Failed
        } catch (_: NoGoogleAccount) {
          SignInProblem.NoGoogleAccount
        } catch (_: Exception) {
          SignInProblem.Failed
        } finally {
          busy = null
        }
      problem = failed?.let { it to provider }
    }
  }
  Column(
    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    Text(
      stringResource(R.string.account_sign_in_title),
      style = MaterialTheme.typography.titleLarge,
      textAlign = TextAlign.Center,
    )
    Text(
      stringResource(R.string.account_sign_in_body),
      style = MaterialTheme.typography.bodyMedium,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      textAlign = TextAlign.Center,
    )
    Spacer(Modifier.size(16.dp))
    AppleButton(enabled = signedIn, busy = busy == LinkedAccount.Provider.Apple) {
      signIn(LinkedAccount.Provider.Apple) { apple.signIn() }
    }
    GoogleButton(enabled = signedIn, busy = busy == LinkedAccount.Provider.Google) {
      signIn(LinkedAccount.Provider.Google) { signInWithGoogle(context) }
    }
  }
  Footnote(
    stringResource(
      when (state) {
        is AccountState.SignedIn -> R.string.account_sign_in_note
        AccountState.SigningIn -> R.string.account_sign_in_offline
        AccountState.SessionEnded -> R.string.account_sign_in_session_ended
      }
    )
  )
  problem?.let { (shown, provider) ->
    AlertDialog(
      onDismissRequest = { problem = null },
      confirmButton = { TextButton(onClick = { problem = null }) { Text(stringResource(R.string.ok)) } },
      title = { Text(stringResource(shown.title, provider.displayName)) },
      text = shown.message?.let { message -> { Text(stringResource(message)) } },
    )
  }
}

/** Why signing in did not link the account, each said in a dialog naming the provider where it says one. */
private enum class SignInProblem(val title: Int, val message: Int?) {
  Failed(R.string.account_sign_in_failed, null),
  NoGoogleAccount(R.string.account_no_google_title, R.string.account_no_google_body),
  /**
   * The account is another user's, as from another phone: the device cannot switch to it yet
   * (spec/sync-protocol.md, Signing in), so nothing changes.
   */
  InUse(R.string.account_in_use_title, R.string.account_in_use_body),
}

/**
 * Appleで続ける, as Apple's guidelines draw Sign in with Apple's button where the system has none:
 * its logo and words in white on black, or black on white in dark mode, round ended as iOS's,
 * `Metrics.signIn` tall as Google's.
 */
@Composable
private fun AppleButton(enabled: Boolean, busy: Boolean, onClick: () -> Unit) {
  val dark = isDark(LocalDeviceSettings.current.device, isSystemInDarkTheme())
  val fill = if (dark) Color.White else Color.Black
  val text = if (dark) Color.Black else Color.White
  Button(
    onClick = onClick,
    enabled = enabled,
    shape = CircleShape,
    colors =
      ButtonDefaults.buttonColors(
        containerColor = fill,
        contentColor = text,
        disabledContainerColor = fill.copy(alpha = 0.38f),
        disabledContentColor = text.copy(alpha = 0.38f),
      ),
    modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.signIn),
  ) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      if (busy) {
        CircularProgressIndicator(Modifier.size(18.dp), color = text, strokeWidth = 2.dp)
      } else {
        Icon(painterResource(R.drawable.ic_apple_logo), contentDescription = null, Modifier.size(18.dp))
      }
      Spacer(Modifier.width(8.dp))
      Text(stringResource(R.string.account_continue_with_apple), style = MaterialTheme.typography.titleMedium)
    }
  }
}

/**
 * Googleで続ける, as Google's branding guidelines draw it: its four-color G, on white with a gray
 * outline, or on near-black in dark mode, round ended, `Metrics.signIn` tall.
 */
@Composable
private fun GoogleButton(enabled: Boolean, busy: Boolean, onClick: () -> Unit) {
  val dark = isDark(LocalDeviceSettings.current.device, isSystemInDarkTheme())
  val colors = if (dark) GoogleButtonColors.Dark else GoogleButtonColors.Light
  OutlinedButton(
    onClick = onClick,
    enabled = enabled,
    shape = CircleShape,
    border = BorderStroke(1.dp, colors.stroke),
    colors =
      ButtonDefaults.outlinedButtonColors(
        containerColor = colors.fill,
        contentColor = colors.text,
        disabledContainerColor = colors.fill.copy(alpha = 0.38f),
        disabledContentColor = colors.text.copy(alpha = 0.38f),
      ),
    modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.signIn),
  ) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      if (busy) {
        CircularProgressIndicator(Modifier.size(18.dp), color = colors.text, strokeWidth = 2.dp)
      } else {
        Image(painterResource(R.drawable.ic_google_g), contentDescription = null, Modifier.size(18.dp))
      }
      Spacer(Modifier.width(8.dp))
      Text(stringResource(R.string.account_continue_with_google), style = MaterialTheme.typography.titleMedium)
    }
  }
}
