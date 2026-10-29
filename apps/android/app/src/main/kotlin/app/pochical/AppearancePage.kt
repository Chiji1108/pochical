package app.pochical

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.pochical.kit.Appearance

/**
 * 外観: light or dark as the phone is, or one of them always, picked from
 * the three as Android's own dark theme setting is, rather than iOS's two
 * pictures and a switch.
 */
@Composable
fun AppearancePage(onBack: () -> Unit) {
  val settings = LocalDeviceSettings.current
  val current = settings.device
  SettingsPage(stringResource(R.string.appearance), onBack) { padding ->
    LazyColumn(contentPadding = padding) {
      item {
        SettingsSection(
          modifier = Modifier.selectableGroup(),
          footnote =
            if (current.theme.isAlwaysDark) {
              stringResource(R.string.appearance_always_dark, current.theme.displayName)
            } else {
              stringResource(R.string.appearance_system)
            },
        ) {
          for (appearance in Appearance.entries) {
            row {
              SettingsRadioRow(stringResource(appearance.title), selected = appearance == current.appearance, onClick = {
                settings.change { it.copy(appearance = appearance) }
              })
            }
          }
        }
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
