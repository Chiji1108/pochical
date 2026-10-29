package app.pochical

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import app.pochical.kit.AccountSuspended
import app.pochical.kit.DeletionFailure
import app.pochical.kit.Holdings
import app.pochical.kit.InUse
import app.pochical.kit.LinkRefused
import app.pochical.kit.LinkedAccount
import app.pochical.kit.NotSignedIn
import app.pochical.kit.ProviderToken
import app.pochical.kit.SignInResult
import app.pochical.kit.SyncAccount
import app.pochical.kit.linked
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** The account the device syncs as, for the pages that show or change it. */
val LocalAccount = staticCompositionLocalOf<SyncAccount> { error("No account provided") }

/** 設定's アカウント row: the provider signed in with, or ログインしていません. */
@Composable
fun AccountRow(open: (RootPage) -> Unit) {
  val state by LocalAccount.current.state.collectAsState()
  val linked = state.linked
  SettingsRow(
    stringResource(R.string.account),
    R.drawable.ic_account_circle,
    onClick = { open(RootPage.Account) },
    value = linked?.provider?.displayName ?: stringResource(R.string.account_not_signed_in),
  )
}

/**
 * アカウント (/design's AccountPage): before signing in, what it keeps and the way in; after, which
 * account it is. Signing in is optional, so the page never pushes it beyond saying what it keeps.
 */
@Composable
fun AccountPage(onBack: () -> Unit) {
  val account = LocalAccount.current
  val state by account.state.collectAsState()
  SettingsPage(stringResource(R.string.account), onBack) { padding ->
    LazyColumn(contentPadding = padding) {
      val linked = state.linked
      if (linked != null) {
        item {
          SettingsSection(stringResource(R.string.account_signed_in), footnote = stringResource(R.string.account_signed_in_note)) {
            row {
              SettingsRow(
                linked.provider.displayName,
                icon = null,
                onClick = null,
                supporting = linked.email,
                leading = {
                  when (linked.provider) {
                    LinkedAccount.Provider.Apple -> Icon(painterResource(R.drawable.ic_apple_logo), contentDescription = null, Modifier.size(24.dp))
                    LinkedAccount.Provider.Google -> Image(painterResource(R.drawable.ic_google_g), contentDescription = null, Modifier.size(24.dp))
                  }
                },
              )
            }
          }
        }
        // Each asks first, on the spot, so no arrow as for a page; offered once the session is up,
        // and said so meanwhile, as iOS does.
        item {
          SettingsSection(footnote = stringResource(R.string.account_offline).takeIf { state !is AccountState.SignedIn }) {
            row { SignOutRow(state) }
            row { DeleteRow(state) }
          }
        }
      } else {
        item { SignInSection(state) }
      }
    }
  }
}

/** What signing in keeps, and the ways in. */
@Composable
private fun SignInSection(state: AccountState) {
  Column(
    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    // What is kept, in the accent on its tint, as /design and iOS head it.
    val colors = LocalThemeColors.current
    Icon(
      painterResource(R.drawable.ic_cloud_done),
      contentDescription = null,
      Modifier.padding(bottom = 8.dp).size(56.dp).background(colors.accentContainer, CircleShape).padding(14.dp),
      tint = colors.accentDefault,
    )
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
    SignInButtons(state)
  }
  Footnote(
    stringResource(
      when (state) {
        is AccountState.SignedIn, is AccountState.Changing -> R.string.account_sign_in_note
        // Neither erasing nor an ended session shows this page (AccountRoot).
        AccountState.SigningIn, is AccountState.Erasing, AccountState.SessionEnded -> R.string.account_sign_in_offline
      }
    )
  )
}

/**
 * Appleで続ける and Googleで続ける, as iOS's SignInButtons, for アカウント and はじめの設定's ログイン,
 * ready once the device has its session: one path for Apple and Google (spec/sync-protocol.md,
 * Signing in; Switching to an account in use). Either links the provider's account to this user, or,
 * when it is another user's already, keeps one side, asking which only when both hold something;
 * [onSignedIn] hears which, once done.
 */
@Composable
fun SignInButtons(state: AccountState, onSignedIn: suspend (SignInResult) -> Unit = {}) {
  val signedIn = state is AccountState.SignedIn
  val account = LocalAccount.current
  val apple = LocalAppleSignIn.current
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  // The provider whose sign-in runs, one at a time; the choice asked of the person; what went wrong.
  var busy by remember { mutableStateOf<LinkedAccount.Provider?>(null) }
  var choosing by remember { mutableStateOf<InUse?>(null) }
  var problem by remember { mutableStateOf<Pair<SignInProblem, LinkedAccount.Provider>?>(null) }
  fun run(provider: LinkedAccount.Provider, step: suspend () -> Unit) {
    if (busy != null) return
    busy = provider
    scope.launch {
      val failed =
        try {
          step()
          null
        } catch (e: CancellationException) {
          throw e
        } catch (_: NotSignedIn) {
          // Said in place of the app, as the server no longer knows the session.
          null
        } catch (e: LinkRefused) {
          // Linked already, as on another device: the page shows the account the server names.
          if (e.status == 417) null else SignInProblem.Failed
        } catch (_: AccountSuspended) {
          SignInProblem.Suspended
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
  fun signIn(provider: LinkedAccount.Provider, providerToken: suspend () -> ProviderToken?) =
    run(provider) {
      when (val result = providerToken()?.let { account.signIn(it) }) {
        is SignInResult.Choose -> choosing = result.inUse
        null -> Unit
        else -> onSignedIn(result)
      }
    }
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    AppleButton(enabled = signedIn, busy = busy == LinkedAccount.Provider.Apple) {
      signIn(LinkedAccount.Provider.Apple) { apple.signIn() }
    }
    GoogleButton(enabled = signedIn, busy = busy == LinkedAccount.Provider.Google) {
      signIn(LinkedAccount.Provider.Google) { signInWithGoogle(context) }
    }
  }
  choosing?.let { inUse ->
    val provider = inUse.token.provider
    AlertDialog(
      onDismissRequest = { choosing = null },
      title = { Text(stringResource(R.string.account_choose_title)) },
      text = {
        Text(
          stringResource(R.string.account_choose_body, provider.displayName, summary(inUse.account), summary(inUse.device))
        )
      },
      // Three answers, the account's first, as someone signing in to an account they used is more
      // often after its data.
      confirmButton = {
        Column(horizontalAlignment = Alignment.End) {
          TextButton(
            onClick = {
              choosing = null
              run(provider) {
                account.useAccount(inUse)
                onSignedIn(SignInResult.Switched)
              }
            }
          ) {
            Text(stringResource(R.string.account_use_account))
          }
          TextButton(
            onClick = {
              choosing = null
              run(provider) {
                account.keepDevice(inUse)
                onSignedIn(SignInResult.Linked)
              }
            }
          ) {
            Text(stringResource(R.string.account_keep_device))
          }
          TextButton(onClick = { choosing = null }) { Text(stringResource(R.string.cancel)) }
        }
      },
    )
  }
  problem?.let { (shown, provider) ->
    AlertDialog(
      onDismissRequest = { problem = null },
      confirmButton = { TextButton(onClick = { problem = null }) { Text(stringResource(R.string.ok)) } },
      title = { Text(stringResource(shown.title, provider.displayName)) },
      text = shown.message?.let { message -> { Text(stringResource(message, provider.displayName)) } },
    )
  }
}

/** What one side holds, in a few words, or なし. */
@Composable
private fun summary(held: Holdings): String {
  val parts =
    listOfNotNull(
      if (held.shiftDays > 0) stringResource(R.string.holdings_shift_days, held.shiftDays) else null,
      if (held.repeating) stringResource(R.string.holdings_repeating) else null,
      if (held.coworkers > 0) stringResource(R.string.holdings_coworkers, held.coworkers) else null,
      if (held.groups > 0) stringResource(R.string.holdings_groups, held.groups) else null,
    )
  return if (parts.isEmpty()) stringResource(R.string.none) else parts.joinToString(stringResource(R.string.holdings_separator))
}

/** Why signing in did not go, each said in a dialog naming the provider where it says one. */
private enum class SignInProblem(val title: Int, val message: Int?) {
  Failed(R.string.account_sign_in_failed, null),
  NoGoogleAccount(R.string.account_no_google_title, R.string.account_no_google_body),
  /** Suspended by Pochical's people: said as such, as trying again would not help. */
  Suspended(R.string.account_suspended_title, R.string.account_suspended_body),
}

/**
 * アカウントを削除 (spec/sync-protocol.md, Deleting an account), asked first, on the spot, and
 * offered only while the device has its session: an Apple account has Apple's page asked once more
 * for the code its tokens are revoked with. Once deleted, the app shows the device erasing in place
 * of every page (AccountRoot).
 */
@Composable
private fun DeleteRow(state: AccountState) {
  val account = LocalAccount.current
  val apple = LocalAppleSignIn.current
  val scope = rememberCoroutineScope()
  var confirming by remember { mutableStateOf(false) }
  var failure by remember { mutableStateOf<DeletionFailure.Reason?>(null) }
  // From the tap on, as the server and Apple are asked before the account begins changing.
  var deleting by remember { mutableStateOf(false) }
  SettingsRow(
    stringResource(R.string.account_delete),
    R.drawable.ic_person_remove,
    onClick = { confirming = true },
    end = RowEnd.None,
    valueContent = if (deleting) ({ CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) }) else null,
    enabled = state is AccountState.SignedIn && !deleting,
    danger = true,
  )
  if (confirming) {
    AlertDialog(
      onDismissRequest = { confirming = false },
      title = { Text(stringResource(R.string.account_delete_title)) },
      text = { Text(stringResource(R.string.account_delete_body)) },
      dismissButton = { TextButton(onClick = { confirming = false }) { Text(stringResource(R.string.cancel)) } },
      confirmButton = {
        TextButton(
          onClick = {
            confirming = false
            if (deleting) return@TextButton
            deleting = true
            scope.launch {
              try {
                account.deleteAccount(appleCode = apple::authorizationCode)
              } catch (e: DeletionFailure) {
                // A session the server does not know is said in place of the app, not here.
                if (e.reason != DeletionFailure.Reason.SessionEnded) failure = e.reason
              } finally {
                deleting = false
              }
            }
          },
          colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) {
          Text(stringResource(R.string.account_delete_confirm))
        }
      },
    )
  }
  failure?.let { reason ->
    AlertDialog(
      onDismissRequest = { failure = null },
      confirmButton = { TextButton(onClick = { failure = null }) { Text(stringResource(R.string.ok)) } },
      title = { Text(stringResource(R.string.account_not_deleted)) },
      text = { Text(stringResource(whatToDo(reason))) },
    )
  }
}

/**
 * ログアウト (spec/sync-protocol.md, Signing out), asked first, on the spot, and offered only while
 * the device has its session: what waits in the outbox goes, then the session ends on the server and
 * the app shows the device erasing in place of every page (AccountRoot), then はじめの設定.
 */
@Composable
private fun SignOutRow(state: AccountState) {
  val account = LocalAccount.current
  val scope = rememberCoroutineScope()
  var confirming by remember { mutableStateOf(false) }
  var failed by remember { mutableStateOf(false) }
  var signingOut by remember { mutableStateOf(false) }
  SettingsRow(
    stringResource(R.string.account_sign_out),
    R.drawable.ic_logout,
    onClick = { confirming = true },
    end = RowEnd.None,
    valueContent = if (signingOut) ({ CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) }) else null,
    enabled = state is AccountState.SignedIn && !signingOut,
    danger = true,
  )
  if (confirming) {
    AlertDialog(
      onDismissRequest = { confirming = false },
      title = { Text(stringResource(R.string.account_sign_out_title)) },
      text = { Text(stringResource(R.string.account_sign_out_body)) },
      dismissButton = { TextButton(onClick = { confirming = false }) { Text(stringResource(R.string.cancel)) } },
      confirmButton = {
        TextButton(
          onClick = {
            confirming = false
            signingOut = true
            scope.launch {
              try {
                account.signOut()
              } catch (e: CancellationException) {
                throw e
              } catch (_: NotSignedIn) {
                // A session the server does not know is said in place of the app, not here.
              } catch (_: Exception) {
                failed = true
              } finally {
                signingOut = false
              }
            }
          },
          colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) {
          Text(stringResource(R.string.account_sign_out))
        }
      },
    )
  }
  if (failed) {
    AlertDialog(
      onDismissRequest = { failed = false },
      confirmButton = { TextButton(onClick = { failed = false }) { Text(stringResource(R.string.ok)) } },
      title = { Text(stringResource(R.string.account_not_signed_out)) },
      text = { Text(stringResource(R.string.account_not_deleted_later)) },
    )
  }
}

/** What to do next after a deletion that did not go. */
private fun whatToDo(reason: DeletionFailure.Reason): Int =
  when (reason) {
    DeletionFailure.Reason.NotSignedIn -> R.string.account_not_deleted_not_signed_in
    DeletionFailure.Reason.AccountChanged -> R.string.account_not_deleted_changed
    DeletionFailure.Reason.Offline -> R.string.account_not_deleted_offline
    DeletionFailure.Reason.AppleUnconfirmed -> R.string.account_not_deleted_apple_unconfirmed
    DeletionFailure.Reason.AppleRefused -> R.string.account_not_deleted_apple_refused
    DeletionFailure.Reason.ServerFailed, DeletionFailure.Reason.SessionEnded -> R.string.account_not_deleted_later
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
