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
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
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

/** 設定 › 通知 › チャット's row: オン while the app may notify, オフ otherwise. */
@Composable
fun ChatNotificationsRow(open: (RootPage) -> Unit) {
  val allowed by LocalNotificationPermission.current.allowed.collectAsStateWithLifecycle()
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
  val allowed by LocalNotificationPermission.current.allowed.collectAsStateWithLifecycle()
  if (allowed) return
  val context = LocalContext.current
  val asking = rememberNotificationAsking()
  val mayAsk = asking.mayAsk
  AskingCard(
    icon = if (mayAsk) R.drawable.ic_notifications else R.drawable.ic_notifications_off,
    title = stringResource(if (mayAsk) R.string.permission_not_asked else R.string.permission_denied),
    about = stringResource(if (mayAsk) R.string.permission_not_asked_about else R.string.permission_denied_about),
    action = stringResource(if (mayAsk) R.string.permission_ask else R.string.permission_open_settings),
    onAction = { if (mayAsk) asking.ask() else context.startActivity(systemSettings(context.packageName)) },
  )
}

/** A card over a settings page asking for what the system has not allowed yet: what, why, and the way to it. */
@Composable
fun AskingCard(icon: Int, title: String, about: String, action: String, onAction: () -> Unit) {
  Card(
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest),
    modifier = Modifier.fillMaxWidth().padding(16.dp),
  ) {
    Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      Box(
        Modifier.size(40.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
        contentAlignment = Alignment.Center,
      ) {
        Icon(painterResource(icon), contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
      }
      Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall)
        Text(about, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = onAction, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) { Text(action) }
      }
    }
  }
}

/** Android 13's question whether the app may notify: whether it may be put now, and putting it. */
@Stable
class NotificationAsking(val mayAsk: Boolean, private val put: () -> Unit) {
  /** Puts the question, while it may be put; otherwise nothing, as iOS asks only once. */
  fun ask() {
    if (mayAsk) put()
  }
}

/**
 * The question whether the app may notify, put while Android 13 can put it: not before Android 13,
 * where notifications need no asking, while the app may notify, or once turned down for good.
 */
@Composable
fun rememberNotificationAsking(): NotificationAsking {
  val permission = LocalNotificationPermission.current
  val allowed by permission.allowed.collectAsStateWithLifecycle()
  val settings = LocalDeviceSettings.current
  val activity = LocalActivity.current
  // Whether the question was refused before it was put this time: refused again, it is refused for
  // good, as Android then puts it no more. Refused once, or dismissed unanswered, it is put again.
  var refusedBefore by rememberSaveable { mutableStateOf(false) }
  val launcher =
    rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      if (!granted && refusedBefore) settings.change { it.copy(notificationsRefused = true) }
      permission.read()
    }
  val mayAsk = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !allowed && !settings.device.notificationsRefused
  return NotificationAsking(mayAsk) put@{
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return@put
    refusedBefore = activity?.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) == true
    launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
  }
}

/** The system's settings of the app's notifications. */
private fun systemSettings(packageName: String) =
  Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
