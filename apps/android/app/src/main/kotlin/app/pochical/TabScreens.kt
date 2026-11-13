package app.pochical

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.pochical.chat.SupportRow
import app.pochical.chat.rememberChatList
import app.pochical.design.Chat
import app.pochical.groups.rememberMeId
import app.pochical.notifications.rememberChatNotifications
import app.pochical.kit.DeviceSettings
import app.pochical.kit.appVersion
import app.pochical.notifications.ChatNotificationsRow
import app.pochical.patterns.PatternsRow
import app.pochical.people.CoworkersRow
import app.pochical.people.UsualProfileRow
import app.pochical.reminders.RemindersRow
import app.pochical.repeat.RepeatRow

/**
 * 設定: what the person sets, sorted as /design's settings are, each row's page pushed over the
 * tabs; the chat with Pochical's people under them, and Pochical itself at the foot. Its title
 * stands large over the sections, as Android's own Settings', and goes into the bar as they scroll.
 */
@Composable
fun SettingsScreen(open: (RootPage) -> Unit) {
  val device = LocalDeviceSettings.current.device
  // The chat with Pochical's people, read over the list so its row comes back drawn as it was.
  val me = rememberMeId()
  val support = me?.let { rememberChatList(Chat.supportPlace, it) }
  val notifications = rememberChatNotifications()
  SettingsPage(stringResource(R.string.tab_settings), onBack = null, large = true) { padding ->
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
      if (me != null && support != null) item { SupportRow(me, support, notifications, open) }
      item { About(open) }
    }
  }
}

/**
 * Pochical itself, at the foot (/design's AboutSection), its version under it: rows that leave the
 * app end in ↗, opening the site's pages in Custom Tabs and Google Play's listing in the Play Store, and ライセンス, the app's own page, last. The store's own review prompt comes by
 * itself only now and then (spec/review.md); the review row is there whenever someone wants to
 * write one.
 */
@Composable
private fun About(open: (RootPage) -> Unit) {
  val context = LocalContext.current
  val opensBrowser = stringResource(R.string.settings_opens_browser)
  SettingsSection(stringResource(R.string.settings_about)) {
    row {
      SettingsRow(stringResource(R.string.settings_help), R.drawable.ic_help, onClick = { openLink(context, Site.page("support")) }, end = RowEnd.Outside, onClickLabel = opensBrowser)
    }
    row {
      SettingsRow(
        stringResource(R.string.settings_write_review),
        R.drawable.ic_rate_review,
        onClick = { openListing(context) },
        end = RowEnd.Outside,
        onClickLabel = stringResource(R.string.settings_opens_play),
      )
    }
    row {
      SettingsRow(stringResource(R.string.settings_terms), R.drawable.ic_description, onClick = { openLink(context, Site.page("terms")) }, end = RowEnd.Outside, onClickLabel = opensBrowser)
    }
    row {
      SettingsRow(stringResource(R.string.settings_privacy), R.drawable.ic_privacy_tip, onClick = { openLink(context, Site.page("privacy")) }, end = RowEnd.Outside, onClickLabel = opensBrowser)
    }
    row { SettingsRow(stringResource(R.string.settings_licenses), R.drawable.ic_license, onClick = { open(RootPage.Licenses) }) }
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
