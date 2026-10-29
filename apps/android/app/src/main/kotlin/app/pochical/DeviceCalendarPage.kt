package app.pochical

import android.content.Intent
import android.provider.Settings
import android.util.Log
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import app.pochical.calendar.DeviceCalendar
import app.pochical.calendar.DeviceCalendars
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.OwnCalendar
import app.pochical.calendar.Pattern
import app.pochical.calendar.monthText
import app.pochical.calendar.row
import app.pochical.calendar.text
import app.pochical.design.Metrics
import app.pochical.groups.rememberMeId
import app.pochical.kit.CalendarAdd
import app.pochical.kit.Period
import app.pochical.kit.ShownDay
import app.pochical.kit.byPeriod
import app.pochical.kit.hoursText
import app.pochical.kit.page
import app.pochical.kit.picking
import app.pochical.kit.shiftEvents
import app.pochical.kit.shown
import app.pochical.patterns.SwitchRow
import java.time.LocalDate
import java.time.YearMonth
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** The page's name where a sentence names it: 10月, or a シフトの期間's 10/15〜11/14. */
private fun pageName(page: Period, byPeriod: Boolean): String = if (byPeriod) page.text else page.month.monthText


/**
 * 端末カレンダーに追加 (spec/calendar.md, Adding a month to the device calendar; iOS's
 * DeviceCalendarSheet): the page [month] names, a month's or a シフトの期間's, put in a calendar of
 * the device a day each, the patterns picked under 入れるシフト, and taken out again. The calendar's
 * access is asked for as the page opens, the moment it is needed; refused, the page says where to
 * allow it.
 */
@Composable
fun DeviceCalendarPage(month: YearMonth, navigation: PageNavigation) {
  val context = LocalContext.current
  val resources = LocalResources.current
  val activity = LocalActivity.current
  val settings = LocalDeviceSettings.current
  val device = settings.device
  val calendar by LocalOwnDays.current.calendar.collectAsState()
  val me = rememberMeId()
  val calendars = remember(context) { DeviceCalendars(context.applicationContext) }
  val scope = rememberCoroutineScope()
  val snackbar = remember { SnackbarHostState() }
  val page = device.period.page(month)
  val name = pageName(page, device.period.byPeriod)

  var allowed by remember { mutableStateOf(calendars.allowed) }
  // Asked once as the page opens; refused, whether Android would ask again.
  var refused by rememberSaveable { mutableStateOf(false) }
  var asksAgain by rememberSaveable { mutableStateOf(false) }
  val ask =
    rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
      allowed = granted.values.all { it } && calendars.allowed
      refused = !allowed
      asksAgain = DeviceCalendars.PERMISSIONS.any { activity?.shouldShowRequestPermissionRationale(it) == true }
    }
  // Once refused, asked again only by 許可する, not as the page is drawn anew (turned, or 外観 changed).
  LaunchedEffect(Unit) { if (!allowed && !refused) ask.launch(DeviceCalendars.PERMISSIONS) }
  // Allowed in the system's settings meanwhile, the page goes on as it comes back.
  LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { allowed = calendars.allowed }

  // The device's calendars, and how many of the page's events Pochical put in, followed while the
  // page is open: a calendar turned on meanwhile shows without opening it again.
  var list by remember { mutableStateOf<List<DeviceCalendar>?>(null) }
  var put by remember { mutableIntStateOf(0) }
  var pickedId by rememberSaveable { mutableStateOf<Long?>(null) }
  val lastCalendar by rememberUpdatedState(device.deviceCalendar)
  LaunchedEffect(allowed, page, me) {
    if (!allowed) return@LaunchedEffect
    calendars
      .changes()
      .map {
        withContext(Dispatchers.IO) {
          try {
            calendars.calendars() to (me?.let { calendars.marked(page, it).size } ?: 0)
          } catch (e: Exception) {
            // A provider that would not be read (a vendor's, or access taken away meanwhile): none to offer.
            Log.w("PochicalCalendarAdd", "The device's calendars were not read: $e")
            emptyList<DeviceCalendar>() to 0
          }
        }
      }
      .collect { (found, marked) ->
        list = found
        put = marked
        // The one picked stays while it still takes events, else the first pick.
        if (found.none { it.id == pickedId }) pickedId = calendars.pickedFirst(found, lastCalendar)?.id
      }
  }

  // What was done, once added or taken out: its title and its line.
  var doneTitle by rememberSaveable { mutableStateOf<String?>(null) }
  var doneText by rememberSaveable { mutableStateOf("") }
  var asksToRemove by rememberSaveable { mutableStateOf(false) }
  // While a write runs: its buttons wait, as a second tap would only queue the same again.
  var writing by remember { mutableStateOf(false) }
  var pickingCalendar by rememberSaveable { mutableStateOf(false) }

  // The patterns picked, the days' memos and who works them, kept with the account as last left:
  // the memos and people off at first, as a calendar may be shared with family.
  val putting = device.calendarAdd
  val adding = remember(calendar, page, putting) { Adding(calendar, page, putting) }
  val events = adding.events
  val picked = adding.picked
  val target = list?.find { it.id == pickedId }

  fun failed(words: Int) {
    ReviewPrompt.troubled = true
    scope.launch { snackbar.showSnackbar(resources.getString(words)) }
  }

  fun add() {
    val user = me ?: return failed(R.string.calendar_add_failed)
    val into = target ?: return failed(R.string.calendar_add_failed)
    writing = true
    scope.launch {
      try {
        calendars.add(events, page, user, into.id)
        settings.change { it.copy(deviceCalendar = into.id) }
        doneTitle = resources.getString(R.string.calendar_add_saved)
        doneText = resources.getString(R.string.calendar_add_added, into.name, name, events.size)
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        Log.w("PochicalCalendarAdd", "The events were not put in: $e")
        failed(R.string.calendar_add_failed)
      } finally {
        writing = false
      }
    }
  }

  fun remove() {
    val user = me ?: return failed(R.string.calendar_remove_failed)
    writing = true
    scope.launch {
      try {
        val removed = calendars.remove(page, user)
        doneTitle = resources.getString(R.string.calendar_add_removed_title)
        doneText = resources.getString(R.string.calendar_add_removed, name, removed)
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        Log.w("PochicalCalendarAdd", "The events were not taken out: $e")
        failed(R.string.calendar_remove_failed)
      } finally {
        writing = false
      }
    }
  }

  SettingsPage(doneTitle ?: stringResource(R.string.calendar_add), onBack = navigation::back, snackbar = snackbar) { padding ->
    LazyColumn(Modifier.fillMaxWidth(), contentPadding = padding) {
        when {
          !allowed && refused -> {
            item { Footnote(stringResource(R.string.calendar_add_denied)) }
            item {
              Wide(stringResource(if (asksAgain) R.string.calendar_add_allow else R.string.calendar_add_open_settings)) {
                if (asksAgain) {
                  ask.launch(DeviceCalendars.PERMISSIONS)
                } else {
                  context.startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, "package:${context.packageName}".toUri())
                  )
                }
              }
            }
          }
          !allowed || list == null ->
            item {
              Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            }
          doneTitle != null -> {
            item {
              SettingsSection(modifier = Modifier.padding(top = 8.dp).animateItem()) {
                row {
                  SettingsRow(doneText, icon = null, onClick = null, leading = { Icon(painterResource(R.drawable.ic_check), null, tint = LocalThemeColors.current.accentDefault) })
                }
              }
            }
            item { Wide(stringResource(R.string.close), onClick = navigation::back) }
          }
          else -> {
            item { Footnote(stringResource(R.string.calendar_add_about, name)) }
            item {
              SettingsSection(footnote = stringResource(R.string.calendar_add_again, name)) {
                row {
                  SettingsRow(
                    stringResource(R.string.calendar_add_target),
                    R.drawable.ic_calendar,
                    onClick = { pickingCalendar = true },
                    supporting = target?.name ?: stringResource(R.string.calendar_add_no_calendar),
                    leading = target?.let { { Box(Modifier.size(24.dp), contentAlignment = Alignment.Center) { CalendarDot(it.color) } } },
                    enabled = !list.isNullOrEmpty(),
                    end = RowEnd.None,
                  )
                }
                row {
                  // What is left out under it, every name of it, as a switch's line says what it does.
                  SettingsRow(
                    stringResource(R.string.calendar_add_patterns),
                    R.drawable.ic_work,
                    onClick = { navigation.open(RootPage.DeviceCalendarPatterns(month.toString())) },
                    supporting = leftOut(adding.listed, picked),
                  )
                }
                if (adding.offersNotes) {
                  row {
                    SettingsSwitchRow(
                      stringResource(R.string.calendar_add_notes),
                      R.drawable.ic_edit,
                      putting.notes,
                      { on -> settings.change { it.copy(calendarAdd = it.calendarAdd.copy(notes = on)) } },
                      supporting = stringResource(R.string.calendar_add_notes_note),
                    )
                  }
                }
                if (adding.offersPeople) {
                  row {
                    SettingsSwitchRow(
                      stringResource(R.string.calendar_add_people),
                      R.drawable.ic_handshake,
                      putting.people,
                      { on -> settings.change { it.copy(calendarAdd = it.calendarAdd.copy(people = on)) } },
                      supporting = stringResource(R.string.calendar_add_people_note),
                    )
                  }
                }
              }
            }
            item {
              Wide(
                stringResource(R.string.calendar_add_button, events.size),
                enabled = events.isNotEmpty() && target != null && !writing,
                onClick = ::add,
              )
            }
            // Only while some are in, as from a calendar picked by mistake, so none is taken out one by one.
            if (put > 0) {
              item {
                TextButton(
                  onClick = { asksToRemove = true },
                  enabled = !writing,
                  modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).heightIn(min = Metrics.control),
                  colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) {
                  Text(stringResource(R.string.calendar_add_remove, name))
                }
              }
            }
          }
        }
    }
  }

  if (asksToRemove) {
    AlertDialog(
      onDismissRequest = { asksToRemove = false },
      title = { Text(stringResource(R.string.calendar_add_remove_title, put)) },
      text = { Text(stringResource(R.string.calendar_add_remove_text, name)) },
      confirmButton = {
        TextButton(
          onClick = {
            asksToRemove = false
            remove()
          },
          colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) {
          Text(stringResource(R.string.calendar_add_remove_confirm))
        }
      },
      dismissButton = { TextButton(onClick = { asksToRemove = false }) { Text(stringResource(R.string.cancel)) } },
    )
  }
  if (pickingCalendar) {
    CalendarPicker(list.orEmpty(), pickedId, onPick = { pickedId = it }, onDismiss = { pickingCalendar = false })
  }
}

/**
 * What 端末カレンダーに追加 puts in from [page] as [putting] has it: the patterns to pick from and
 * those picked, the events, and which switches would put something in, worked out once for each.
 */
private class Adding(calendar: OwnCalendar, page: Period, putting: CalendarAdd) {
  private val rows = calendar.patterns.map { it.row }
  private val shownDays = calendar.shown(page.first, page.last)

  /** The patterns to pick from: those in use, and one left that still shows on the page. */
  val listed: List<Pattern> = calendar.patterns.filter { pattern -> !pattern.archived || shownDays.values.any { it.shift == pattern.id } }

  val picked: Set<String> = putting.shown(rows)

  private val memos = page.days.mapNotNull { day -> calendar.note(day)?.takeIf { it.isNotEmpty() }?.let { day to it } }.toMap()

  private val people: Map<LocalDate, List<String>> =
    calendar.coworkers.associate { it.id to it.name }.let { names ->
      shownDays.mapNotNull { (day, entry) -> entry.people.mapNotNull(names::get).takeIf { it.isNotEmpty() }?.let { day to it } }.toMap()
    }

  val events =
    shiftEvents(
      page,
      shownDays.mapValues { (_, entry) -> ShownDay(entry.shift, entry.start, entry.end) },
      rows.associateBy { it.id },
      picked,
      if (putting.notes) memos else emptyMap(),
      if (putting.people) people else emptyMap(),
    )

  // A switch only when it would put something in: a memo goes in any day, those on a day only in its shift's event.
  val offersNotes = memos.isNotEmpty()
  val offersPeople = people.keys.any { shownDays[it]?.shift in picked }
}

/** What the row under 入れるシフト says is left out, every name of it. */
@Composable
private fun leftOut(listed: List<Pattern>, picked: Set<String>): String {
  val out = listed.filter { it.id !in picked }
  return when {
    out.isEmpty() -> stringResource(R.string.calendar_add_all)
    out.size == listed.size -> stringResource(R.string.calendar_add_none)
    else -> stringResource(R.string.calendar_add_left_out, out.joinToString("・") { it.name })
  }
}

/** The page's main button, wide at its foot. */
@Composable
private fun Wide(title: String, enabled: Boolean = true, onClick: () -> Unit) {
  Button(
    onClick = onClick,
    enabled = enabled,
    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).heightIn(min = Metrics.control),
  ) {
    Text(title)
  }
}

/** A calendar's own color, as the device's calendar apps mark it. */
@Composable
private fun CalendarDot(color: Int) {
  Box(Modifier.size(12.dp).background(Color(color), CircleShape))
}

/** 追加先: the calendars that take new events, under their accounts, one picked as Material picks one of a list. */
@Composable
private fun CalendarPicker(calendars: List<DeviceCalendar>, picked: Long?, onPick: (Long) -> Unit, onDismiss: () -> Unit) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(stringResource(R.string.calendar_add_target)) },
    text = {
      LazyColumn(Modifier.selectableGroup()) {
        for ((account, inAccount) in calendars.groupBy { it.account }) {
          item(key = "account:$account") {
            Text(
              account,
              style = MaterialTheme.typography.titleSmall,
              color = MaterialTheme.colorScheme.primary,
              modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
            )
          }
          items(inAccount, key = { it.id }) { item ->
            ListItem(
              headlineContent = { Text(item.name) },
              leadingContent = { RadioButton(selected = item.id == picked, onClick = null) },
              trailingContent = { CalendarDot(item.color) },
              colors = ListItemDefaults.colors(containerColor = Color.Transparent),
              modifier =
                Modifier.selectable(selected = item.id == picked, role = Role.RadioButton) {
                  onPick(item.id)
                  onDismiss()
                },
            )
          }
        }
      }
    },
    confirmButton = {},
    dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
  )
}

/**
 * 入れるシフト: each pattern by its mark, name and time, checked when its days go in, kept with the
 * account (spec/calendar.md), as a day's シフト is picked, but several at once with Material's checkboxes.
 */
@Composable
fun DeviceCalendarPatternsPage(month: YearMonth, onBack: () -> Unit) {
  val settings = LocalDeviceSettings.current
  val calendar by LocalOwnDays.current.calendar.collectAsState()
  val page = settings.device.period.page(month)
  val rows = calendar.patterns.map { it.row }
  val shown = settings.device.calendarAdd.shown(rows)
  val listed = remember(calendar, page) { Adding(calendar, page, CalendarAdd()).listed }
  SettingsPage(stringResource(R.string.calendar_add_patterns), onBack) { padding ->
    LazyColumn(contentPadding = padding) {
      item {
        SettingsSection(footnote = stringResource(R.string.calendar_add_patterns_note)) {
          for (pattern in listed) {
            val on = pattern.id in shown
            row {
              SettingsCheckRow(
                pattern.name,
                checked = on,
                onCheckedChange = { checked ->
                  settings.change { it.copy(calendarAdd = it.calendarAdd.picking(pattern.id, checked, calendar.patterns.map { p -> p.row })) }
                },
                supporting = pattern.time?.let { hoursText(it.start, it.end) } ?: stringResource(R.string.pattern_no_time),
                leading = { ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 24.dp) },
              )
            }
          }
        }
      }
    }
  }
}
