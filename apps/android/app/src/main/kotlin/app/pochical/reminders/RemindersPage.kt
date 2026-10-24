package app.pochical.reminders

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.LocalDeviceSettings
import app.pochical.PageNavigation
import app.pochical.R
import app.pochical.RootPage
import app.pochical.SectionHeader
import app.pochical.Segments
import app.pochical.SettingsPage
import app.pochical.ShiftMark
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.OwnCalendar
import app.pochical.calendar.Pattern
import app.pochical.calendar.TimeDialog
import app.pochical.calendar.fullText
import app.pochical.calendar.row
import app.pochical.kit.Reminder
import app.pochical.kit.ReminderFiring
import app.pochical.kit.ShownDay
import app.pochical.notifications.AskingCard
import app.pochical.notifications.LocalNotificationPermission
import app.pochical.notifications.PermissionCard
import app.pochical.notifications.rememberNotificationAsking
import java.time.LocalDate
import java.time.ZonedDateTime

/** The reminders' alarms, for the screens. */
val LocalReminderAlarms = staticCompositionLocalOf<ReminderAlarms> { error("No reminders above this screen") }

/** 設定 › 通知 › リマインド's row: オフ until the app may notify or while none is on, else the one, else how many. */
@Composable
fun RemindersRow(open: (RootPage) -> Unit) {
  val allowed by LocalNotificationPermission.current.allowed.collectAsStateWithLifecycle()
  val on = LocalDeviceSettings.current.device.reminders.filter { it.on }
  ListItem(
    headlineContent = { Text(stringResource(R.string.reminders)) },
    supportingContent = {
      Text(
        when {
          !allowed || on.isEmpty() -> stringResource(R.string.notifications_off)
          on.size == 1 -> on.single().name
          else -> stringResource(R.string.reminders_count, on.size)
        }
      )
    },
    modifier = Modifier.clickable { open(RootPage.Reminders) },
  )
}

/**
 * 設定 › 通知 › リマインド (spec/calendar.md, Reminders; /design's RemindersPage): reminders as the
 * Clock app lists alarms, each on its own switch, a tap to change it, and as many as wanted. Nothing
 * arrives until the system allows it, so the page leads with asking, and then, while the system may
 * bring them late, with asking for exact alarms.
 */
@Composable
fun RemindersPage(navigation: PageNavigation) {
  val settings = LocalDeviceSettings.current
  val reminders = settings.device.reminders
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  val asking = rememberNotificationAsking()
  SettingsPage(title = stringResource(R.string.reminders), onBack = navigation::back) { padding ->
    LazyColumn(contentPadding = padding) {
      item { PermissionCard() }
      item { ExactAlarmCard(reminders.any { it.on }) }
      items(reminders, key = { it.id }) { reminder ->
        ReminderRow(
          reminder,
          calendar,
          onOpen = { navigation.open(RootPage.ReminderEditor(reminder.id)) },
          onSwitch = { on ->
            settings.change { device -> device.copy(reminders = device.reminders.map { if (it.id == reminder.id) it.copy(on = on) else it }) }
            if (on) asking.ask()
          },
        )
      }
      item {
        ListItem(
          headlineContent = { Text(stringResource(R.string.reminders_add), color = MaterialTheme.colorScheme.primary) },
          leadingContent = { Icon(painterResource(R.drawable.ic_add), contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
          modifier = Modifier.clickable { navigation.open(RootPage.ReminderEditor(null)) },
        )
      }
    }
  }
}

/**
 * Over the reminders while the system may bring them up to an hour late: Android 14 leaves exact
 * alarms to the person (アラームとリマインダー), and the reminders say their minute.
 */
@Composable
private fun ExactAlarmCard(anyOn: Boolean) {
  val exact by LocalReminderAlarms.current.exact.collectAsStateWithLifecycle()
  val allowed by LocalNotificationPermission.current.allowed.collectAsStateWithLifecycle()
  if (exact || !allowed || !anyOn || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
  val context = LocalContext.current
  AskingCard(
    icon = R.drawable.ic_alarm,
    title = stringResource(R.string.reminder_exact),
    about = stringResource(R.string.reminder_exact_about),
    action = stringResource(R.string.reminder_exact_allow),
    onAction = {
      context.startActivity(
        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.fromParts("package", context.packageName, null))
      )
    },
  )
}

/** A reminder as a row of the alarms' list: what it is and when it next goes off, opening it to edit, and its switch. */
@Composable
private fun ReminderRow(reminder: Reminder, calendar: OwnCalendar, onOpen: () -> Unit, onSwitch: (Boolean) -> Unit) {
  val shown = remindable(reminder, calendar.patterns)
  val picked = shown.filter { it.id !in reminder.skip }
  ListItem(
    headlineContent = {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(reminder.name, color = if (reminder.on) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
        // The shifts it goes off for, when not all of them.
        if (picked.size < shown.size) {
          val only = stringResource(R.string.reminder_only, picked.joinToString("・") { it.name })
          Row(Modifier.clearAndSetSemantics { contentDescription = only }, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (pattern in picked) ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 16.dp)
          }
        }
      }
    },
    supportingContent =
      if (reminder.on) {
        {
          val next = nextFiring(reminder, calendar)
          Text(
            next?.let { stringResource(R.string.reminder_next, it.text, it.shift) } ?: stringResource(R.string.reminder_none_ahead)
          )
        }
      } else null,
    trailingContent = { Switch(checked = reminder.on, onCheckedChange = onSwitch) },
    modifier = Modifier.clickable(onClick = onOpen),
  )
}

/**
 * Adding or changing a reminder: when it goes off, the shifts it goes off for, and the next
 * notification it sends drawn under them, so what arrives is seen before saving.
 */
@Composable
fun ReminderEditorPage(id: String?, navigation: PageNavigation) {
  val settings = LocalDeviceSettings.current
  val reminders = settings.device.reminders
  val reminder = reminders.find { it.id == id }
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  val asking = rememberNotificationAsking()
  var dayBefore by rememberSaveable { mutableStateOf(reminder?.kind !is Reminder.Kind.BeforeStart) }
  var time by rememberSaveable { mutableStateOf((reminder?.kind as? Reminder.Kind.DayBefore)?.time ?: Reminder.DEFAULT_TIME) }
  var minutes by rememberSaveable {
    mutableIntStateOf((reminder?.kind as? Reminder.Kind.BeforeStart)?.minutes ?: Reminder.DEFAULT_MINUTES)
  }
  var skip by rememberSaveable { mutableStateOf(reminder?.skip.orEmpty()) }
  var pickingTime by rememberSaveable { mutableStateOf(false) }
  var pickingMinutes by rememberSaveable { mutableStateOf(false) }
  var deleting by rememberSaveable { mutableStateOf(false) }
  val draft =
    Reminder(
      id = reminder?.id ?: newId(reminders),
      on = reminder?.on ?: true,
      skip = skip,
      kind = if (dayBefore) Reminder.Kind.DayBefore(time) else Reminder.Kind.BeforeStart(minutes),
    )
  val shown = remindable(draft, calendar.patterns)
  val picked = shown.filter { it.id !in skip }
  SettingsPage(
    title = stringResource(if (reminder == null) R.string.reminders_add else R.string.reminder_edit),
    onBack = navigation::back,
    actions = {
      TextButton(
        enabled = picked.isNotEmpty(),
        onClick = {
          settings.change { device ->
            val kept = device.reminders
            device.copy(reminders = if (kept.any { it.id == draft.id }) kept.map { if (it.id == draft.id) draft else it } else kept + draft)
          }
          // The moment a notification is first wanted.
          asking.ask()
          navigation.back()
        },
      ) {
        Text(stringResource(R.string.save))
      }
    },
  ) { padding ->
    LazyColumn(contentPadding = padding) {
      item {
        Segments(
          options = listOf(true, false),
          picked = dayBefore,
          label = { stringResource(if (it) R.string.reminder_day_before else R.string.reminder_before_start) },
          onPick = { dayBefore = it },
        )
      }
      item {
        if (dayBefore) {
          ListItem(
            headlineContent = { Text(stringResource(R.string.reminder_time)) },
            trailingContent = { TextButton(onClick = { pickingTime = true }) { Text(time.removePrefix("0")) } },
          )
        } else {
          ListItem(
            headlineContent = { Text(stringResource(R.string.reminder_start)) },
            trailingContent = {
              TextButton(onClick = { pickingMinutes = true }) {
                Text(stringResource(R.string.reminder_minutes_before, Reminder.beforeText(minutes)))
                DropdownMenu(expanded = pickingMinutes, onDismissRequest = { pickingMinutes = false }) {
                  for (choice in Reminder.MINUTES_CHOICES) {
                    DropdownMenuItem(
                      text = { Text(stringResource(R.string.reminder_minutes_before, Reminder.beforeText(choice))) },
                      onClick = {
                        minutes = choice
                        pickingMinutes = false
                      },
                    )
                  }
                }
              }
            },
          )
        }
      }
      item { SectionHeader(stringResource(R.string.reminder_shifts)) }
      items(shown, key = { it.id }) { pattern ->
        val on = pattern.id !in skip
        ListItem(
          headlineContent = { Text(pattern.name) },
          leadingContent = { ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 24.dp) },
          trailingContent = {
            if (on) Icon(painterResource(R.drawable.ic_check), contentDescription = null, tint = MaterialTheme.colorScheme.primary)
          },
          modifier =
            Modifier.semantics { selected = on }.clickable { skip = if (on) skip + pattern.id else skip - pattern.id },
        )
      }
      sample(draft, calendar)?.let { (firing, next) ->
        item { SectionHeader(if (next) stringResource(R.string.reminder_next_sample, firing.text) else stringResource(R.string.reminder_sample)) }
        item { NotificationBanner(firing) }
      }
      if (reminder != null) {
        item {
          TextButton(onClick = { deleting = true }, Modifier.fillMaxWidth().padding(16.dp)) {
            Text(stringResource(R.string.reminder_delete), color = MaterialTheme.colorScheme.error)
          }
        }
      }
    }
  }
  if (pickingTime) {
    TimeDialog(time = time, onPick = { time = it }, onDismiss = { pickingTime = false })
  }
  if (deleting) {
    AlertDialog(
      onDismissRequest = { deleting = false },
      title = { Text(stringResource(R.string.reminder_delete_ask)) },
      confirmButton = {
        TextButton(
          onClick = {
            settings.change { device -> device.copy(reminders = device.reminders.filterNot { it.id == reminder?.id }) }
            deleting = false
            navigation.back()
          }
        ) {
          Text(stringResource(R.string.delete), color = MaterialTheme.colorScheme.error)
        }
      },
      dismissButton = { TextButton(onClick = { deleting = false }) { Text(stringResource(R.string.cancel)) } },
    )
  }
}

/** One notification from the app as it arrives: its name, then the title and its line. */
@Composable
private fun NotificationBanner(firing: ReminderFiring) {
  val description = listOfNotNull(firing.title, firing.body).joinToString(" ")
  Card(
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
    shape = RoundedCornerShape(24.dp),
    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).clearAndSetSemantics { contentDescription = description },
  ) {
    Column(
      Modifier.padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
      Text(stringResource(R.string.app_name), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
      Text(firing.title, style = MaterialTheme.typography.titleSmall)
      firing.body?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
    }
  }
}

/** The patterns [reminder] can go off for, of those in use. */
private fun remindable(reminder: Reminder, patterns: List<Pattern>): List<Pattern> {
  val ids = reminder.remindable(patterns.filterNot { it.archived }.map { it.row }).mapTo(HashSet()) { it.id }
  return patterns.filter { it.id in ids }
}

/** How far ahead a row looks for the next one it sends, as iOS's. */
private const val NEXT_DAYS = 60L

/** The next notification [reminder] sends from now, if any day in the next two months has one. */
private fun nextFiring(reminder: Reminder, calendar: OwnCalendar): ReminderFiring? {
  val now = ZonedDateTime.now()
  val today = now.toLocalDate()
  return calendar.firings(reminder, today, today.plusDays(NEXT_DAYS)).firstOrNull { it.at(now.zone) > now }
}

/**
 * The next one [draft] sends, and true; with nothing ahead, one for a shift it would go off for
 * tomorrow, so the words still show.
 */
private fun sample(draft: Reminder, calendar: OwnCalendar): Pair<ReminderFiring, Boolean>? {
  nextFiring(draft, calendar)?.let {
    return it to true
  }
  val tomorrow = LocalDate.now().plusDays(1)
  return remindable(draft, calendar.patterns)
    .filter { it.id !in draft.skip }
    .firstNotNullOfOrNull { draft.firing(tomorrow, ShownDay(it.id), it.row) }
    ?.let { it to false }
}

/** One no other reminder has. */
private fun newId(reminders: List<Reminder>): String {
  val used = reminders.mapTo(HashSet()) { it.id }
  return generateSequence(reminders.size) { it + 1 }.map { "reminder-$it" }.first { it !in used }
}

/** When it arrives, as a row says it: 10月9日(金) 21:00. */
private val ReminderFiring.text: String
  get() = "${day.fullText} ${minute / 60}:${"%02d".format(minute % 60)}"

