package app.pochical

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
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
 * tabs; the chat with Pochical's people under them, and Pochical itself at the foot.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(open: (RootPage) -> Unit) {
  val device = LocalDeviceSettings.current.device
  val snackbar = remember { SnackbarHostState() }
  Scaffold(
    topBar = { TopAppBar(title = { Text(stringResource(R.string.tab_settings)) }) },
    snackbarHost = { SnackbarHost(snackbar) },
  ) { padding ->
    LazyColumn(contentPadding = padding) {
      // The patterns first: every way of working has them, and the repeating order is made of them.
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
      item { SectionHeader(stringResource(R.string.account)) }
      item { UsualProfileRow(open) }
      item { AccountRow(open) }
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
  Column {
    SectionHeader(stringResource(R.string.settings_about))
    OutsideRow(stringResource(R.string.settings_help)) { openLink(context, Site.page("support")) }
    // Before release it says so, once however often it is pressed.
    val review = Site.writeReview
    OutsideRow(stringResource(R.string.settings_write_review), opensBrowser = review != null) {
      if (review != null) {
        openLink(context, review)
      } else if (snackbar.currentSnackbarData == null) {
        scope.launch { snackbar.showSnackbar(afterRelease) }
      }
    }
    OutsideRow(stringResource(R.string.settings_terms)) { openLink(context, Site.page("terms")) }
    OutsideRow(stringResource(R.string.settings_privacy)) { openLink(context, Site.page("privacy")) }
    Text(
      stringResource(R.string.settings_version, appVersion(context)),
      style = MaterialTheme.typography.bodySmall,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      textAlign = TextAlign.Center,
      modifier = Modifier.fillMaxWidth().padding(16.dp),
    )
  }
}

/** A row that leaves the app, ending in ↗ rather than going on inside it, and saying so while it [opensBrowser]. */
@Composable
private fun OutsideRow(title: String, opensBrowser: Boolean = true, onClick: () -> Unit) {
  ListItem(
    headlineContent = { Text(title) },
    trailingContent = {
      Icon(
        painterResource(R.drawable.ic_arrow_outward),
        contentDescription = null,
        Modifier.size(20.dp),
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    },
    modifier =
      Modifier.clickable(
        onClickLabel = if (opensBrowser) stringResource(R.string.settings_opens_browser) else null,
        role = Role.Button,
        onClick = onClick,
      ),
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
