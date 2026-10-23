package app.pochical

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.datastore.core.DataStore
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** カレンダー, which its month heads, with no bar of its own (POC-206 draws it). */
@Composable
fun CalendarScreen() {
  Placeholder(stringResource(R.string.tab_calendar))
}

/** グループ, which heads itself (the group's hub comes with sync). */
@Composable
fun GroupsScreen() {
  Placeholder(stringResource(R.string.tab_groups))
}

/** 設定: each row's page pushed over the tabs. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(deviceSettings: DataStore<DeviceSettings>, open: (RootPage) -> Unit) {
  val settings by deviceSettings.data.collectAsStateWithLifecycle(initialValue = null)
  Scaffold(topBar = { TopAppBar(title = { Text(stringResource(R.string.tab_settings)) }) }) { padding ->
    LazyColumn(contentPadding = padding) {
      item {
        Text(
          stringResource(R.string.settings_display),
          style = MaterialTheme.typography.titleSmall,
          color = MaterialTheme.colorScheme.primary,
          modifier = Modifier.padding(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 8.dp),
        )
      }
      item {
        ListItem(
          headlineContent = { Text(stringResource(R.string.appearance)) },
          supportingContent = { settings?.let { Text(stringResource(it.appearance.title)) } },
          modifier = Modifier.clickable { open(RootPage.Appearance) },
        )
      }
    }
  }
}

@Composable
private fun Placeholder(name: String) {
  Box(Modifier.fillMaxSize().safeDrawingPadding(), contentAlignment = Alignment.Center) {
    Text(name, style = MaterialTheme.typography.titleLarge)
  }
}
