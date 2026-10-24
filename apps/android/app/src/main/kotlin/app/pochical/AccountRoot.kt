package app.pochical

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.pochical.design.Metrics
import app.pochical.kit.AccountState

/**
 * The app as the account is: its screens, or, while the device erases what it held after the
 * account was deleted, the erasing in place of all of them, so nothing of the user shows. The
 * screens after are a new install's, from the first tab, saying アカウントを削除しました once.
 */
@Composable
fun AccountRoot() {
  val account = LocalAccount.current
  val state by account.state.collectAsState()
  val deleted by account.deleted.collectAsState()
  // The deletions said so far, so each is said once, an activity made again included.
  var said by rememberSaveable { mutableIntStateOf(account.deleted.value) }
  when (val now = state) {
    is AccountState.Erasing -> ErasingScreen(now, retry = account::eraseAgain)
    else ->
      key(deleted) {
        RootScreen(rememberRootNavigator())
        if (deleted > said) {
          AlertDialog(
            onDismissRequest = { said = deleted },
            confirmButton = { TextButton(onClick = { said = deleted }) { Text(stringResource(R.string.ok)) } },
            title = { Text(stringResource(R.string.account_deleted)) },
          )
        }
      }
  }
}

/**
 * In place of the app while the device is still erasing after アカウントを削除
 * (spec/sync-protocol.md, Deleting an account): the account is deleted on the server already, so it
 * says so, and that this device's data is still being cleared. It tries again by itself; 再試行
 * tries at once.
 */
@Composable
private fun ErasingScreen(erasing: AccountState.Erasing, retry: () -> Unit) {
  Column(
    Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface).safeDrawingPadding().padding(horizontal = 20.dp, vertical = 12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Spacer(Modifier.weight(1f))
    if (!erasing.failed) CircularProgressIndicator()
    Text(
      stringResource(R.string.account_deleted),
      style = MaterialTheme.typography.titleLarge,
      color = MaterialTheme.colorScheme.onSurface,
      textAlign = TextAlign.Center,
    )
    Text(
      stringResource(if (erasing.failed) R.string.erasing_failed else R.string.erasing_body),
      style = MaterialTheme.typography.bodyMedium,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      textAlign = TextAlign.Center,
    )
    Spacer(Modifier.weight(1f))
    if (erasing.failed) {
      Button(onClick = retry, modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.control)) {
        Text(stringResource(R.string.retry))
      }
    }
  }
}
