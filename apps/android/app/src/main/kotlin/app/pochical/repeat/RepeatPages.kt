package app.pochical.repeat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.Footnote
import app.pochical.LocalThemeColors
import app.pochical.PageNavigation
import app.pochical.R
import app.pochical.RootPage
import app.pochical.SectionHeader
import app.pochical.SettingsPage
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.Pattern
import app.pochical.calendar.holidayCountry
import app.pochical.calendar.monthDayText
import app.pochical.calendar.slashText
import app.pochical.design.Metrics
import app.pochical.design.Radius
import app.pochical.kit.RepeatOrder
import app.pochical.kit.holidaySetting
import app.pochical.kit.holidaysOffByDefault
import java.time.LocalDate
import kotlinx.coroutines.launch

// 設定 › 繰り返し (/design's RepeatPage, RepeatPeriodPage, RepeatEditorPage and StopRepeatPage;
// spec/shift-patterns.md, Repeating orders): the periods of orders, each set again, moved or taken
// out, and new ones, or ones without repeating, put in from a day.

/** 設定's 繰り返し row: how often today's period comes round, or なし. */
@Composable
fun RepeatRow(open: (RootPage) -> Unit) {
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  val current = calendar.orders.current()
  ListItem(
    headlineContent = { Text(stringResource(R.string.repeat)) },
    supportingContent = { Text(current?.let { stringResource(R.string.repeat_every, it.sequence.size) } ?: stringResource(R.string.none)) },
    modifier = Modifier.clickable { open(RootPage.Repeat) },
  )
}

/**
 * 繰り返し: the periods, which never overlap, as cards newest first under the rows that add one: those
 * to come, the one in use today and those over. Each opens to be set again, moved or taken out.
 */
@Composable
fun RepeatPage(navigation: PageNavigation) {
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  val orders = calendar.orders
  val byId = calendar.patterns.associateBy { it.id }
  val today = LocalDate.now()
  val inUse = orders.indexOfLast { it.start <= today }
  val newestFirst = orders.indices.reversed()
  val colors = LocalThemeColors.current
  SettingsPage(stringResource(R.string.repeat), onBack = navigation::back) { padding ->
    LazyColumn(contentPadding = padding) {
      if (orders.isEmpty()) {
        item {
          ListItem(
            headlineContent = { Text(stringResource(R.string.repeat_set)) },
            trailingContent = { Text(stringResource(R.string.none)) },
            modifier = Modifier.clickable { navigation.open(RootPage.RepeatEditor(RepeatMode.First)) },
          )
        }
        item { Footnote(stringResource(R.string.repeat_set_note)) }
        return@LazyColumn
      }
      item {
        ListItem(
          headlineContent = { Text(stringResource(R.string.repeat_add), color = colors.accentDefault) },
          leadingContent = { Icon(painterResource(R.drawable.ic_add), null, tint = colors.accentDefault) },
          modifier = Modifier.clickable { navigation.open(RootPage.RepeatEditor(RepeatMode.Switch)) },
        )
      }
      item {
        ListItem(
          headlineContent = { Text(stringResource(R.string.repeat_stop)) },
          leadingContent = { Icon(painterResource(R.drawable.ic_close), null, tint = colors.textSecondary) },
          modifier = Modifier.clickable { navigation.open(RootPage.StopRepeat) },
        )
      }
      item { Footnote(stringResource(R.string.repeat_rows_note)) }
      val groups =
        listOf(
          R.string.repeat_coming to newestFirst.filter { it > inUse },
          R.string.repeat_current to listOfNotNull(inUse.takeIf { it >= 0 }),
          R.string.repeat_past to newestFirst.filter { it < inUse },
        )
      for ((title, indices) in groups) {
        if (indices.isEmpty()) continue
        item { SectionHeader(stringResource(title)) }
        for (index in indices) {
          item(key = orders[index].start.toString()) {
            OrderCard(orders[index], periodText(orders, index), byId) {
              navigation.open(RootPage.RepeatPeriod(orders[index].start.toString()))
            }
          }
        }
      }
    }
  }
}

/** One period on 繰り返し: when it runs, its days and how often they come round, on a card that opens it. */
@Composable
private fun OrderCard(order: RepeatOrder, period: String, patterns: Map<String, Pattern>, onOpen: () -> Unit) {
  val colors = LocalThemeColors.current
  val repeats = order.sequence.isNotEmpty()
  val label = stringResource(R.string.repeat_period_card, period)
  Surface(
    onClick = onOpen,
    shape = RoundedCornerShape(Radius.xxl),
    color = colors.fillQuaternary,
    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).semantics { contentDescription = label },
  ) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text(period, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
        Text(
          if (repeats) stringResource(R.string.repeat_every, order.sequence.size) else stringResource(R.string.repeat_none),
          style = MaterialTheme.typography.bodySmall,
          color = colors.textTertiary,
        )
      }
      if (repeats) {
        SequenceTiles(order.sequence, patterns)
        if (order.holidaysOff) {
          val name = order.holidayShift?.let { patterns[it]?.name } ?: stringResource(R.string.repeat_holidays_off)
          Text(stringResource(R.string.repeat_holidays, name), style = MaterialTheme.typography.bodySmall, color = colors.textTertiary)
        }
      } else {
        Text(stringResource(R.string.repeat_by_hand), style = MaterialTheme.typography.bodySmall, color = colors.textTertiary)
      }
    }
  }
}

/**
 * A period opened from 繰り返し: its order to type again on the calendar, the day it starts, 祝日は休み
 * にする, and taking it out. It starts after the period before starts and before the next one does, so
 * moving it never runs over either.
 */
@Composable
fun RepeatPeriodPage(startKey: String, navigation: PageNavigation) {
  val days = LocalOwnDays.current
  val calendar by days.calendar.collectAsStateWithLifecycle()
  val orders = calendar.orders
  var start by rememberSaveable { mutableStateOf(startKey) }
  // While a move is written, the period shows under the start it had until the calendar shows the new one.
  var moving by rememberSaveable { mutableStateOf<String?>(null) }
  val index = orders.indexOfFirst { it.start.toString() == start }.takeIf { it >= 0 } ?: orders.indexOfFirst { it.start.toString() == moving }
  val scope = rememberCoroutineScope()
  var picking by rememberSaveable { mutableStateOf(false) }
  var removing by rememberSaveable { mutableStateOf(false) }
  var overlaps by rememberSaveable { mutableStateOf(false) }
  if (index < 0) {
    SettingsPage("", onBack = navigation::back) {}
    return
  }
  val order = orders[index]
  val repeats = order.sequence.isNotEmpty()
  val byId = calendar.patterns.associateBy { it.id }
  val inUse = calendar.patterns.filterNot { it.archived }
  SettingsPage(periodText(orders, index), onBack = navigation::back) { padding ->
    LazyColumn(contentPadding = padding) {
      if (repeats) {
        item {
          Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row {
              Text(stringResource(R.string.repeat_sequence), style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
              Text(stringResource(R.string.repeat_every, order.sequence.size), style = MaterialTheme.typography.bodySmall)
            }
            SequenceTiles(order.sequence, byId)
          }
        }
        item {
          ListItem(
            headlineContent = { Text(stringResource(R.string.repeat_fix_on_calendar)) },
            modifier = Modifier.clickable { navigation.open(RootPage.RepeatEditor(RepeatMode.Fix(start))) },
          )
        }
      }
      item {
        ListItem(
          headlineContent = { Text(stringResource(R.string.repeat_start)) },
          trailingContent = { Text(order.start.slashText) },
          modifier = Modifier.clickable { picking = true },
        )
      }
      item { Footnote(stringResource(if (repeats) R.string.repeat_start_note else R.string.repeat_start_note_by_hand)) }
      if (repeats) {
        item {
          HolidayChoice(
            inUse,
            on = order.holidaysOff,
            setting = holidaySetting(inUse.filter { it.countsAsOff }.map { it.id }, order.holidaysOff, order.holidayShift),
            onChange = { on -> scope.launch { days.setHolidaysOff(on, null, order.start) } },
            onPick = { picked -> scope.launch { days.setHolidaysOff(true, picked, order.start) } },
          )
        }
      }
      item {
        TextButton(
          onClick = { removing = true },
          modifier = Modifier.fillMaxWidth().padding(16.dp),
          colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) {
          Text(stringResource(R.string.repeat_remove))
        }
      }
    }
  }
  if (picking) {
    DayPickerDialog(order.start, onPick = { day ->
      // A new start between the periods around it; its first shift stays on the day it fell on.
      if (day != order.start) {
        val from = order.start
        moving = from.toString()
        start = day.toString()
        scope.launch {
          if (!days.moveOrder(from, day)) {
            start = from.toString()
            overlaps = true
          }
          moving = null
        }
      }
    }, onDismiss = { picking = false })
  }
  if (overlaps) {
    AlertDialog(
      onDismissRequest = { overlaps = false },
      text = { Text(stringResource(R.string.repeat_overlaps)) },
      confirmButton = { TextButton(onClick = { overlaps = false }) { Text(stringResource(R.string.ok)) } },
    )
  }
  if (removing) {
    AlertDialog(
      onDismissRequest = { removing = false },
      title = { Text(stringResource(R.string.repeat_remove_title)) },
      text = { Text(stringResource(if (index > 0) R.string.repeat_remove_body_after else R.string.repeat_remove_body_first)) },
      confirmButton = {
        TextButton(
          onClick = {
            removing = false
            scope.launch {
              days.removeOrder(order.start)
              navigation.back()
            }
          },
          colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) {
          Text(stringResource(R.string.delete))
        }
      },
      dismissButton = { TextButton(onClick = { removing = false }) { Text(stringResource(R.string.cancel)) } },
    )
  }
}

/**
 * An order typed on the calendar from the day pressed, with 祝日は休みにする; saved as a new period
 * among the others, or as the period being set again, which keeps its start and moves only the day its
 * first shift falls on. The days the person entered stay. 完了 asks first, in a sheet, as the days from
 * its start change.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RepeatEditor(mode: RepeatMode, navigation: PageNavigation) {
  val days = LocalOwnDays.current
  val calendar by days.calendar.collectAsStateWithLifecycle()
  val orders = calendar.orders
  val fixing = (mode as? RepeatMode.Fix)?.let { fix -> orders.find { it.start.toString() == fix.start } }
  val inUse = calendar.patterns.filterNot { it.archived }
  val byId = calendar.patterns.associateBy { it.id }
  var typing by rememberSaveable(stateSaver = OrderTyping.saver) {
    mutableStateOf(
      OrderTyping(
        // The period's own when set again, else the newest that repeated.
        fixing?.sequence ?: orders.lastOrNull { it.sequence.isNotEmpty() }?.sequence.orEmpty(),
        fixing?.let { it.anchor ?: it.start } ?: nextMonthStart(),
      )
    )
  }
  // Set by hand in 完了's sheet; until then it follows holidaysOffByDefault, or the period's own.
  var holidaysOff by rememberSaveable { mutableStateOf<Boolean?>(null) }
  var holidayPick by rememberSaveable { mutableStateOf<String?>(null) }
  var confirming by rememberSaveable { mutableStateOf(false) }
  val start = fixing?.start ?: typing.anchor
  // The period's own holiday pattern stays until changed, even one that no longer counts as off.
  val daysOff = inUse.filter { it.countsAsOff }.map { it.id }
  // Until set by hand in 完了's sheet, the period's own, else on when the order reads as office hours.
  val turnedOn =
    holidaysOff ?: fixing?.holidaysOff ?: (daysOff.isNotEmpty() && holidaysOffByDefault(typing.sequence, typing.anchor) { byId[it]?.countsAsOff == true })
  // As the period has it, as on its page, whatever the sheet's switch says now.
  val setting = holidaySetting(daysOff, fixing?.holidaysOff == true, fixing?.holidayShift, holidayPick)
  val holidays = turnedOn && setting.shift != null
  val offShift = setting.shift
  // The order runs until the next period starts.
  val until = orders.firstOrNull { it.start > start }?.start
  val country = remember { fixing?.holidayCountry ?: holidayCountry() }
  val scope = rememberCoroutineScope()
  val title =
    stringResource(
      when (mode) {
        RepeatMode.First -> R.string.repeat_title_first
        RepeatMode.Switch -> R.string.repeat_title_switch
        is RepeatMode.Fix -> R.string.repeat_title_fix
      }
    )
  val subtitle =
    if (typing.sequence.isEmpty()) stringResource(R.string.repeat_typed_from, typing.anchor.monthDayText)
    else stringResource(R.string.repeat_typed_every, typing.anchor.monthDayText, typing.sequence.size)
  SettingsPage(
    title,
    onBack = navigation::back,
    subtitle = subtitle,
    actions = {
      TextButton(onClick = { confirming = true }, enabled = typing.sequence.isNotEmpty()) { Text(stringResource(R.string.entering_done)) }
    },
  ) { padding ->
    RepeatCalendar(
      typing,
      { typing = it },
      cover = if (fixing == null) OrderCover.Anchor else OrderCover.From(start),
      patterns = inUse,
      modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
      before = calendar,
      until = until,
      holidayShift = offShift.takeIf { holidays },
      holidayCountry = country,
    )
  }
  if (confirming) {
    // A new period on a day another starts takes its place.
    val replaces = fixing == null && orders.any { it.start == start }
    ModalBottomSheet(onDismissRequest = { confirming = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
      Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
        Text(
          stringResource(
            when (mode) {
              RepeatMode.First -> R.string.repeat_question_first
              RepeatMode.Switch -> R.string.repeat_question_switch
              is RepeatMode.Fix -> R.string.repeat_question_fix
            },
            start.slashText,
          ),
          style = MaterialTheme.typography.titleLarge,
          modifier = Modifier.padding(horizontal = 24.dp),
        )
        Text(
          stringResource(
            when {
              replaces -> R.string.repeat_message_replaces
              mode == RepeatMode.First -> R.string.repeat_message_first
              mode == RepeatMode.Switch -> R.string.repeat_message_switch
              else -> R.string.repeat_message_fix
            }
          ),
          style = MaterialTheme.typography.bodyMedium,
          color = LocalThemeColors.current.textSecondary,
          modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp),
        )
        HolidayChoice(inUse, on = holidays, setting = setting, onChange = { holidaysOff = it }, onPick = { holidayPick = it })
        Button(
          onClick = {
            confirming = false
            // Off, it keeps the pattern holidays took, as turning it off on the period's page does.
            val order = RepeatOrder(typing.sequence, start, typing.anchor, holidays, offShift, country)
            scope.launch {
              days.putOrder(order)
              navigation.back()
            }
          },
          modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(top = 16.dp).heightIn(min = Metrics.control),
        ) {
          Text(
            stringResource(
              when (mode) {
                RepeatMode.First -> R.string.repeat_action_first
                RepeatMode.Switch -> R.string.repeat_action_switch
                is RepeatMode.Fix -> R.string.repeat_action_fix
              }
            )
          )
        }
      }
    }
  }
}

/** 繰り返しをやめる: a period without repeating from a day, days entered by hand until the next period. */
@Composable
fun StopRepeatPage(navigation: PageNavigation) {
  val days = LocalOwnDays.current
  val calendar by days.calendar.collectAsStateWithLifecycle()
  var day by rememberSaveable { mutableStateOf(nextMonthStart().toString()) }
  val stop = LocalDate.parse(day)
  var picking by rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  SettingsPage(stringResource(R.string.repeat_stop), onBack = navigation::back) { padding ->
    Column(Modifier.padding(padding)) {
      ListItem(
        headlineContent = { Text(stringResource(R.string.repeat_stop_day)) },
        trailingContent = { Text(stop.slashText) },
        modifier = Modifier.clickable { picking = true },
      )
      // A period starting that day gives way to this one.
      val replaces = calendar.orders.any { it.start == stop }
      Footnote((if (replaces) stringResource(R.string.repeat_stop_replaces) else "") + stringResource(R.string.repeat_stop_note))
      Spacer(Modifier.padding(8.dp))
      Button(
        onClick = {
          scope.launch {
            days.putOrder(RepeatOrder(emptyList(), stop, holidayCountry = holidayCountry()))
            navigation.back()
          }
        },
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).heightIn(min = Metrics.control),
      ) {
        Text(stringResource(R.string.repeat_stop_button, stop.slashText))
      }
    }
  }
  if (picking) DayPickerDialog(stop, onPick = { day = it.toString() }, onDismiss = { picking = false })
}
