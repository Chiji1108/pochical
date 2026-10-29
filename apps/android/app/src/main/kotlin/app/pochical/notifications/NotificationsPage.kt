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
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import app.pochical.kit.ChatNotificationState
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import app.pochical.Footnote
import app.pochical.SectionHeader
import app.pochical.chat.blockedMembers
import app.pochical.chat.rememberBlockedPeople
import app.pochical.chat.rememberUnblocking
import app.pochical.chat.shownName
import app.pochical.groups.GroupMarkBadge
import app.pochical.groups.LocalValues
import app.pochical.groups.MemberAvatar
import app.pochical.groups.rememberMeId
import app.pochical.kit.ChatKey
import app.pochical.kit.ChatNotificationsSummary
import app.pochical.kit.GROUP_THREAD
import app.pochical.kit.PhotoShelf
import app.pochical.kit.chatNotificationsSummary
import app.pochical.kit.otherIn
import kotlinx.coroutines.launch

/** 設定 › 通知 › チャット's row, its value as iOS's (spec/vectors/unread.json, notificationsSummary). */
@Composable
fun ChatNotificationsRow(open: (RootPage) -> Unit) {
  val allowed by LocalNotificationPermission.current.allowed.collectAsStateWithLifecycle()
  val values = LocalValues.current
  val groups by remember(values) { values.groups() }.collectAsState(emptyList())
  // Its value once the device has read the switches, never a guess before.
  val summary = rememberChatNotifications()?.let { chatNotificationsSummary(groups.map { it.id }, it, allowed) }
  ListItem(
    headlineContent = { Text(stringResource(R.string.notifications_chat)) },
    supportingContent = {
      Text(
        when (summary) {
          null -> ""
          ChatNotificationsSummary.On -> stringResource(R.string.notifications_on)
          ChatNotificationsSummary.Off -> stringResource(R.string.notifications_off)
          is ChatNotificationsSummary.Groups -> stringResource(R.string.notifications_groups, summary.count)
        }
      )
    },
    modifier = Modifier.clickable { open(RootPage.ChatNotifications) },
  )
}

/**
 * 設定 › 通知 › チャット (spec/chat.md, Notifications; /design's and iOS's ChatNotificationsPage): the
 * card that asks for notifications while the app may not show them; each group's chat's switch;
 * the one-to-one chats turned off as the page opened, to turn back on; メンションはいつも通知; whom the
 * user has blocked, to unblock; and the system's settings, where Android keeps each channel's sound
 * and look.
 */
@Composable
fun ChatNotificationsPage(onBack: () -> Unit) {
  val context = LocalContext.current
  val values = LocalValues.current
  val groups by remember(values) { values.groups() }.collectAsState(emptyList())
  val members by remember(values) { values.allMembers() }.collectAsState(emptyList())
  val read = rememberChatNotifications()
  val me = rememberMeId()
  val snackbar = remember { SnackbarHostState() }
  val scope = rememberCoroutineScope()
  val failed = stringResource(R.string.notifications_change_failed)
  val switching = rememberChatSwitching()
  // Shown as turned at once (ChatNotificationSwitches); said should the server not keep it.
  val done = { kept: Boolean -> if (!kept) scope.launch { snackbar.showSnackbar(failed) } }
  // The one-to-one chats turned off as the page opened, as the switches show them: one turned on
  // again stays, to turn off again here. Read once they are, and kept while the page is.
  var directOff by rememberSaveable(stateSaver = chatKeysSaver) { mutableStateOf<List<ChatKey>?>(null) }
  LaunchedEffect(read) {
    if (directOff == null && read != null) directOff = read.muted.filter { it.threadId != GROUP_THREAD }.sortedBy { it.threadId }
  }
  // Nothing of the switches is shown until they are read, so none shows what it is not.
  val notifications = read ?: ChatNotificationState()
  val chatSwitch = { groupId: String, threadId: String ->
    ChatSwitch(!notifications.isMuted(groupId, threadId)) { on -> switching.setMuted(groupId, threadId, !on) { done(it) } }
  }
  val blocked = rememberBlockedPeople()
  val unblock = rememberUnblocking(snackbar)
  SettingsPage(title = stringResource(R.string.notifications_chat), onBack = onBack) { padding ->
    Box(Modifier.padding(padding).fillMaxSize()) {
      LazyColumn {
        item { PermissionCard() }
        item { SectionHeader(stringResource(R.string.notifications_group_chats)) }
        items(if (read == null) emptyList() else groups, key = { "group-${it.id}" }) { group ->
          SwitchRow(chatSwitch(group.id, GROUP_THREAD), headline = group.name) {
            GroupMarkBadge(group.mark, shelf = PhotoShelf.Group(group.id))
          }
        }
        if (read?.mentionsWhenMuted == true) item { Footnote(stringResource(R.string.notifications_group_chats_note)) }
        item { SectionHeader(stringResource(R.string.notifications_direct_chats)) }
        items(directOff.orEmpty(), key = { "direct-${it.groupId}-${it.threadId}" }) { chat ->
          val group = groups.firstOrNull { it.id == chat.groupId }
          val other = me?.let { otherIn(chat.threadId, it) }
          val person = members.firstOrNull { it.groupId == chat.groupId && it.userId == other }
          val name = person?.shownName() ?: stringResource(R.string.blocked_someone)
          SwitchRow(chatSwitch(chat.groupId, chat.threadId), headline = name, supporting = group?.name) {
            MemberAvatar(name, person?.photoId.orEmpty(), PhotoShelf.Group(chat.groupId), 40.dp)
          }
        }
        item { Footnote(stringResource(R.string.notifications_direct_chats_note)) }
        item { SectionHeader(stringResource(R.string.notifications_mentions)) }
        if (read != null) item {
          SwitchRow(
            ChatSwitch(notifications.mentionsWhenMuted) { on -> switching.setMentionsWhenMuted(on) { done(it) } },
            headline = stringResource(R.string.notifications_mentions_always),
            supporting = stringResource(R.string.notifications_mentions_always_about),
          )
        }
        blockedMembers(blocked, unblock)
        item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }
        item {
          ListItem(
            headlineContent = { Text(stringResource(R.string.notifications_system)) },
            supportingContent = { Text(stringResource(R.string.notifications_system_about)) },
            modifier = Modifier.clickable { context.startActivity(systemSettings(context.packageName)) },
          )
        }
      }
      SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
    }
  }
}

/**
 * A group's own 通知 (spec/chat.md, Notifications; iOS's GroupSettingsPage): the same switch as the
 * group's on 設定 › 通知 › チャット, and the note that mentions still notify while that is so. A change
 * the server does not keep is said in [snackbar].
 */
@Composable
fun GroupChatNotifications(groupId: String, snackbar: SnackbarHostState) {
  val read = rememberChatNotifications() ?: return
  val switching = rememberChatSwitching()
  val scope = rememberCoroutineScope()
  val failed = stringResource(R.string.notifications_change_failed)
  Column {
    SwitchRow(
      ChatSwitch(!read.isMuted(groupId, GROUP_THREAD)) { on ->
        switching.setMuted(groupId, GROUP_THREAD, !on) { kept -> if (!kept) scope.launch { snackbar.showSnackbar(failed) } }
      },
      headline = stringResource(R.string.group_chat_notifications),
    )
    if (read.mentionsWhenMuted) Footnote(stringResource(R.string.notifications_group_chats_note))
  }
}

/** A switch as shown, and what turning it does. */
private class ChatSwitch(val on: Boolean, val turn: (Boolean) -> Unit)

/** A row its switch turns on and off, the whole row toggling it as Material's lists do. */
@Composable
private fun SwitchRow(switch: ChatSwitch, headline: String, supporting: String? = null, leading: (@Composable () -> Unit)? = null) {
  ListItem(
    headlineContent = { Text(headline, maxLines = 1, overflow = TextOverflow.Ellipsis) },
    supportingContent = supporting?.takeIf { it.isNotEmpty() }?.let { { Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis) } },
    leadingContent = leading,
    trailingContent = { Switch(checked = switch.on, onCheckedChange = null) },
    modifier = Modifier.toggleable(value = switch.on, role = Role.Switch, onValueChange = switch.turn),
  )
}

/** The one-to-one chats turned off as the page opened, kept across the process's death; none kept before they are read. */
private val chatKeysSaver =
  Saver<List<ChatKey>?, ArrayList<String>>(
    save = { keys -> keys?.flatMapTo(ArrayList()) { listOf(it.groupId, it.threadId) } },
    restore = { saved -> saved.chunked(2).map { (groupId, threadId) -> ChatKey(groupId, threadId) } },
  )

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
  val asking = LocalNotificationAsking.current
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

/**
 * Android 13's question whether the app may notify: whether it may be put now, whether it was ever
 * put, and putting it.
 */
@Stable
class NotificationAsking(private val state: State<Asked>, private val put: () -> Unit) {
  /** Where the question stands: whether it may be put now, and whether it ever was. */
  data class Asked(val mayAsk: Boolean, val asked: Boolean)

  val mayAsk: Boolean
    get() = state.value.mayAsk

  /** It may be put and never was: what iOS calls not asked, when the reminders are offered. */
  val notAsked: Boolean
    get() = state.value.mayAsk && !state.value.asked

  /** Puts the question, while it may be put; otherwise nothing. */
  fun ask() {
    if (mayAsk) put()
  }

  /**
   * Puts the question the first time a notification is wanted, until it is answered (spec/chat.md,
   * Notifications): as a line is sent, a chat's notifications are turned on, or a reminder is
   * taken. Until it is answered yes the device does not hear the server's notifications at all.
   */
  fun askOnce() {
    if (notAsked) put()
  }
}

/** The question whether the app may notify, for the screens: [rememberNotificationAsking]'s, at the root. */
val LocalNotificationAsking = staticCompositionLocalOf<NotificationAsking> { error("No notification question above this screen") }

/**
 * The question whether the app may notify, put while Android 13 can put it: not before Android 13,
 * where notifications need no asking, while the app may notify, or once turned down for good. Held
 * at the root of the screens and handed down ([LocalNotificationAsking]), so its answer is heard
 * whatever page put it, one that closed as it was put too (saving a reminder).
 */
@Composable
fun rememberNotificationAsking(): NotificationAsking {
  val permission = LocalNotificationPermission.current
  val allowed by permission.allowed.collectAsStateWithLifecycle()
  val settings by rememberUpdatedState(LocalDeviceSettings.current)
  val activity = LocalActivity.current
  // Whether the question was refused before it was put this time: refused again, it is refused for
  // good, as Android then puts it no more. Refused once, or dismissed unanswered, it is put again.
  var refusedBefore by rememberSaveable { mutableStateOf(false) }
  // Put and not yet answered: a second call meanwhile (two taps in one frame) puts nothing.
  var putting by remember { mutableStateOf(false) }
  val launcher =
    rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      putting = false
      if (!granted && refusedBefore) settings.change { it.copy(notificationsRefused = true) }
      // Asked once answered: allowed, or turned down (Android then gives its rationale). A dialog
      // dismissed unanswered leaves it not asked, as iOS's not determined, to be put again.
      val answered = granted || refusedBefore || activity?.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) == true
      if (answered && !settings.device.notificationsAsked) settings.change { it.copy(notificationsAsked = true) }
      permission.read()
    }
  val state = rememberUpdatedState(
    NotificationAsking.Asked(
      mayAsk = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !allowed && !settings.device.notificationsRefused,
      asked = settings.device.notificationsAsked,
    )
  )
  return remember(launcher, activity) {
    NotificationAsking(state) put@{
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || putting) return@put
      putting = true
      refusedBefore = activity?.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) == true
      launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
  }
}

/** The system's settings of the app's notifications. */
private fun systemSettings(packageName: String) =
  Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
