package app.pochical

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.pochical.chat.SupportRow
import app.pochical.kit.DeviceSettings
import app.pochical.notifications.ChatNotificationsRow
import app.pochical.patterns.PatternsRow
import app.pochical.people.CoworkersRow
import app.pochical.people.UsualProfileRow
import app.pochical.reminders.RemindersRow
import app.pochical.repeat.RepeatRow

/** 設定: each row's page pushed over the tabs. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(open: (RootPage) -> Unit) {
  val device = LocalDeviceSettings.current.device
  Scaffold(topBar = { TopAppBar(title = { Text(stringResource(R.string.tab_settings)) }) }) { padding ->
    LazyColumn(contentPadding = padding) {
      item { AccountRow(open) }
      item { UsualProfileRow(open) }
      item { SectionHeader(stringResource(R.string.settings_shifts)) }
      item { PatternsRow(open) }
      item { RepeatRow(open) }
      item { CoworkersRow(open) }
      item { SectionHeader(stringResource(R.string.settings_notifications)) }
      item { RemindersRow(open) }
      item { ChatNotificationsRow(open) }
      item { SectionHeader(stringResource(R.string.settings_display)) }
      item { StyleRow(open) }
      item {
        ListItem(
          headlineContent = { Text(stringResource(R.string.appearance)) },
          supportingContent = { Text(appearanceName(device)) },
          modifier = Modifier.clickable { open(RootPage.Appearance) },
        )
      }
      item { CalendarSettingsRow(open) }
      // The chat with the people who make Pochical, apart from the rows of settings.
      item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }
      item { SupportRow(open) }
    }
  }
}

/** 外観 as the screens are drawn: a テーマ drawn dark says so, whatever 外観 keeps for after it. */
@Composable
private fun appearanceName(device: DeviceSettings): String =
  if (device.theme.isAlwaysDark) {
    stringResource(R.string.appearance_dark_by_theme, device.theme.displayName)
  } else {
    stringResource(device.appearance.title)
  }

/** A section's heading in a settings list. */
@Composable
fun SectionHeader(text: String) {
  Text(
    text,
    style = MaterialTheme.typography.titleSmall,
    color = MaterialTheme.colorScheme.primary,
    modifier = Modifier.padding(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 8.dp),
  )
}

/** What a settings list says under its rows. */
@Composable
fun Footnote(text: String) {
  Text(
    text,
    style = MaterialTheme.typography.bodyMedium,
    color = MaterialTheme.colorScheme.onSurfaceVariant,
    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
  )
}
