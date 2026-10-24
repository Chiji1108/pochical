package app.pochical

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import app.pochical.kit.Appearance

/**
 * 外観: light or dark as the phone is, or one of them always, picked from
 * the three as Android's own dark theme setting is, rather than iOS's two
 * pictures and a switch.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppearancePage(onBack: () -> Unit) {
  val settings = LocalDeviceSettings.current
  val current = settings.device
  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text(stringResource(R.string.appearance)) },
        navigationIcon = {
          IconButton(onClick = onBack) {
            Icon(painterResource(R.drawable.ic_back), contentDescription = stringResource(R.string.back))
          }
        },
      )
    },
  ) { padding ->
    LazyColumn(Modifier.selectableGroup(), contentPadding = padding) {
      items(Appearance.entries) { appearance ->
        val picked = appearance == current.appearance
        ListItem(
          headlineContent = { Text(stringResource(appearance.title)) },
          leadingContent = { RadioButton(selected = picked, onClick = null) },
          modifier =
            Modifier.selectable(selected = picked, role = Role.RadioButton) {
              settings.change { it.copy(appearance = appearance) }
            },
        )
      }
      item {
        Text(
          if (current.theme.isAlwaysDark) {
            stringResource(R.string.appearance_always_dark, current.theme.displayName)
          } else {
            stringResource(R.string.appearance_system)
          },
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
      }
    }
  }
}

/** The choice's name in 外観. */
val Appearance.title: Int
  get() =
    when (this) {
      Appearance.System -> R.string.appearance_system_name
      Appearance.Light -> R.string.appearance_light
      Appearance.Dark -> R.string.appearance_dark
    }
