package app.pochical

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.pochical.design.Metrics
import kotlinx.coroutines.launch

/**
 * In place of the app while the server does not know the session (spec/sync-protocol.md,
 * Reconnecting): signed out or deleted on another device or by request, or the server set wrong for
 * a while. Nothing more syncs, and nothing on the device is cleared but by the person: もう一度つなぐ
 * asks the server about the session again, the app coming back only if it knows it, and はじめから使う,
 * asked first, erases what the device holds and starts as a new install does, where signing in with
 * Apple or Google again brings back an account's data.
 */
@Composable
fun SessionEndedScreen(tryAgain: suspend () -> Unit, startAfresh: () -> Unit) {
  var confirming by rememberSaveable { mutableStateOf(false) }
  var trying by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  Column(
    Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface).safeDrawingPadding().padding(horizontal = 20.dp, vertical = 12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Spacer(Modifier.weight(1f))
    Text(
      stringResource(R.string.session_ended),
      style = MaterialTheme.typography.titleLarge,
      color = MaterialTheme.colorScheme.onSurface,
      textAlign = TextAlign.Center,
    )
    Text(
      stringResource(R.string.session_ended_body),
      style = MaterialTheme.typography.bodyMedium,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      textAlign = TextAlign.Center,
    )
    Spacer(Modifier.weight(1f))
    Button(onClick = { confirming = true }, shapes = ButtonDefaults.shapes(), modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.control)) {
      Text(stringResource(R.string.session_ended_start_afresh))
    }
    TextButton(
      onClick = {
        trying = true
        scope.launch {
          try {
            tryAgain()
          } finally {
            trying = false
          }
        }
      },
      enabled = !trying,
    ) {
      // The label keeps its size under the spinner, so nothing moves.
      Box(contentAlignment = Alignment.Center) {
        Text(stringResource(R.string.session_ended_try_again), Modifier.alpha(if (trying) 0f else 1f))
        if (trying) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
      }
    }
  }
  if (confirming) {
    AlertDialog(
      onDismissRequest = { confirming = false },
      title = { Text(stringResource(R.string.start_afresh_title)) },
      text = { Text(stringResource(R.string.start_afresh_body)) },
      dismissButton = { TextButton(onClick = { confirming = false }) { Text(stringResource(R.string.cancel)) } },
      confirmButton = {
        TextButton(
          onClick = {
            confirming = false
            startAfresh()
          },
          colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) {
          Text(stringResource(R.string.start_afresh_confirm))
        }
      },
    )
  }
}
