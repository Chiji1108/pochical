package app.pochical

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.pochical.chat.SupportRow
import app.pochical.kit.DeviceSettings
import app.pochical.kit.appVersion
import app.pochical.notifications.ChatNotificationsRow
import app.pochical.patterns.PatternsRow
import app.pochical.people.CoworkersRow
import app.pochical.people.UsualProfileRow
import app.pochical.reminders.RemindersRow
import app.pochical.repeat.RepeatRow
import kotlinx.coroutines.launch

/**
 * 設定: what the person sets, sorted as /design's settings are, each row's page pushed over the
 * tabs; the chat with Pochical's people under them, and Pochical itself at the foot. Its title
 * stands large over the sections, as Android's own Settings', and goes into the bar as they scroll.
 */
@Composable
fun SettingsScreen(open: (RootPage) -> Unit) {
  val device = LocalDeviceSettings.current.device
  val snackbar = remember { SnackbarHostState() }
  SettingsPage(stringResource(R.string.tab_settings), onBack = null, large = true, snackbar = snackbar) { padding ->
    LazyColumn(contentPadding = padding) {
      // The patterns first: every way of working has them, and the repeating order is made of them.
      item {
        SettingsSection(stringResource(R.string.settings_shifts)) {
          row { PatternsRow(open) }
          row { RepeatRow(open) }
          row { CoworkersRow(open) }
        }
      }
      item {
        SettingsSection(stringResource(R.string.settings_notifications)) {
          row { RemindersRow(open) }
          row { ChatNotificationsRow(open) }
        }
      }
      item {
        SettingsSection(stringResource(R.string.settings_display)) {
          row { StyleRow(open) }
          row {
            SettingsRow(stringResource(R.string.appearance), R.drawable.ic_contrast, onClick = { open(RootPage.Appearance) }, value = appearanceName(device))
          }
          row { CalendarSettingsRow(open) }
        }
      }
      item {
        SettingsSection(stringResource(R.string.account)) {
          row { UsualProfileRow(open) }
          row { AccountRow(open) }
        }
      }
      // The chat with the people who make Pochical, apart from the rows of settings.
      item { SupportRow(open) }
      item { About(snackbar) }
    }
  }
}

/**
 * Pochical itself, at the foot (/design's AboutSection), its version under it: rows that leave the
 * app end in ↗, opening the site's pages in Custom Tabs. The store's own review prompt comes by
 * itself only now and then (spec/review.md); the review row is there whenever someone wants to
 * write one.
 */
@Composable
private fun About(snackbar: SnackbarHostState) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val afterRelease = stringResource(R.string.settings_review_after_release)
  val opensBrowser = stringResource(R.string.settings_opens_browser)
  SettingsSection(stringResource(R.string.settings_about)) {
    row {
      SettingsRow(stringResource(R.string.settings_help), R.drawable.ic_help, onClick = { openLink(context, Site.page("support")) }, end = RowEnd.Outside, onClickLabel = opensBrowser)
    }
    row {
      // Before release it says so, once however often it is pressed.
      val review = Site.writeReview
      SettingsRow(
        stringResource(R.string.settings_write_review),
        R.drawable.ic_rate_review,
        onClick = {
          if (review != null) {
            openLink(context, review)
          } else if (snackbar.currentSnackbarData == null) {
            scope.launch { snackbar.showSnackbar(afterRelease) }
          }
        },
        end = RowEnd.Outside,
        onClickLabel = if (review != null) opensBrowser else null,
      )
    }
    row {
      SettingsRow(stringResource(R.string.settings_terms), R.drawable.ic_description, onClick = { openLink(context, Site.page("terms")) }, end = RowEnd.Outside, onClickLabel = opensBrowser)
    }
    row {
      SettingsRow(stringResource(R.string.settings_privacy), R.drawable.ic_privacy_tip, onClick = { openLink(context, Site.page("privacy")) }, end = RowEnd.Outside, onClickLabel = opensBrowser)
    }
  }
  Text(
    stringResource(R.string.settings_version, appVersion(context)),
    style = MaterialTheme.typography.bodySmall,
    color = MaterialTheme.colorScheme.onSurfaceVariant,
    textAlign = TextAlign.Center,
    modifier = Modifier.fillMaxWidth().padding(16.dp),
  )
}

/** 外観 as the screens are drawn: a テーマ drawn dark says so, whatever 外観 keeps for after it. */
@Composable
private fun appearanceName(device: DeviceSettings): String =
  if (device.theme.isAlwaysDark) {
    stringResource(R.string.appearance_dark_by_theme, device.theme.displayName)
  } else {
    stringResource(device.appearance.title)
  }
