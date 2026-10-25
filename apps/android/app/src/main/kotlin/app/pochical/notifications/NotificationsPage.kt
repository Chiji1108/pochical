package app.pochical.notifications

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.LocalDeviceSettings
import app.pochical.R
import app.pochical.RootPage
import app.pochical.SettingsPage

/** The app's notifications from the server, for the screens. */
val LocalPush = staticCompositionLocalOf<Push> { error("No notifications above this screen") }

/** 設定 › 通知 › チャット's row: オン while the app may notify, オフ otherwise. */
@Composable
fun ChatNotificationsRow(open: (RootPage) -> Unit) {
  val allowed by LocalPush.current.allowed.collectAsStateWithLifecycle()
  ListItem(
    headlineContent = { Text(stringResource(R.string.notifications_chat)) },
    supportingContent = { Text(stringResource(if (allowed) R.string.notifications_on else R.string.notifications_off)) },
    modifier = Modifier.clickable { open(RootPage.ChatNotifications) },
  )
}

/**
 * 設定 › 通知 › チャット (spec/chat.md, Notifications; /design's ChatNotificationsPage): the card
 * that asks for notifications while the app may not show them, and the system's settings, where
 * Android keeps each channel's sound and look.
 */
@Composable
fun ChatNotificationsPage(onBack: () -> Unit) {
  val context = LocalContext.current
  SettingsPage(title = stringResource(R.string.notifications_chat), onBack = onBack) { padding ->
    LazyColumn(contentPadding = padding) {
      item { PermissionCard() }
      item {
        ListItem(
          headlineContent = { Text(stringResource(R.string.notifications_system)) },
          supportingContent = { Text(stringResource(R.string.notifications_system_about)) },
          modifier = Modifier.clickable { context.startActivity(systemSettings(context.packageName)) },
        )
      }
    }
  }
}

/**
 * Over the notification settings while Pochical may not notify (/design's PermissionCard): a way
 * to be asked, Android 13's question put while it can be, or to the system's settings once it was
 * turned down for good or notifications were turned off there.
 */
@Composable
fun PermissionCard() {
  val push = LocalPush.current
  val allowed by push.allowed.collectAsStateWithLifecycle()
  if (allowed) return
  val settings = LocalDeviceSettings.current
  val activity = LocalActivity.current
  val context = LocalContext.current
  // Whether the question was refused before it was put this time: refused again, it is refused for
  // good, as Android then puts it no more. Refused once, or dismissed unanswered, it is put again.
  var refusedBefore by rememberSaveable { mutableStateOf(false) }
  val ask =
    rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      if (!granted && refusedBefore) settings.change { it.copy(notificationsRefused = true) }
      push.readPermission()
    }
  val mayAsk = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !settings.device.notificationsRefused
  Card(
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest),
    modifier = Modifier.fillMaxWidth().padding(16.dp),
  ) {
    Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      Box(
        Modifier.size(40.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
        contentAlignment = Alignment.Center,
      ) {
        Icon(
          painterResource(if (mayAsk) R.drawable.ic_notifications else R.drawable.ic_notifications_off),
          contentDescription = null,
          tint = MaterialTheme.colorScheme.onPrimaryContainer,
        )
      }
      Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
          stringResource(if (mayAsk) R.string.permission_not_asked else R.string.permission_denied),
          style = MaterialTheme.typography.titleSmall,
        )
        Text(
          stringResource(if (mayAsk) R.string.permission_not_asked_about else R.string.permission_denied_about),
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(
          onClick = {
            if (mayAsk) {
              refusedBefore =
                activity?.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) == true
              ask.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
              context.startActivity(systemSettings(context.packageName))
            }
          },
          modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        ) {
          Text(stringResource(if (mayAsk) R.string.permission_ask else R.string.permission_open_settings))
        }
      }
    }
  }
}

/** The system's settings of the app's notifications. */
private fun systemSettings(packageName: String) =
  Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
