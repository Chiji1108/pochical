package app.pochical.groups

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.calendar.MonthPicker
import app.pochical.calendar.holidayCountry
import app.pochical.calendar.rememberToday
import app.pochical.calendar.shortText
import app.pochical.calendar.weekStartingOn
import app.pochical.calendar.yearMonthText
import app.pochical.design.PochicalTextStyles
import app.pochical.design.Radius
import app.pochical.kit.GroupRow
import java.time.LocalDate
import java.time.YearMonth
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch

/** How many months either side of this one the list holds, as /design's (monthSpan). */
private const val MONTH_SPAN = 24L

/**
 * How everyone's shifts are laid out (/design's Layout): a row a day (一覧), a block a week (週ごと), or
 * one member's month at a time (1人ずつ).
 */
enum class ShiftsLayout(@param:StringRes val title: Int) {
  Days(R.string.layout_days),
  Weeks(R.string.layout_weeks),
  Person(R.string.layout_person),
}

/** A place in the list of months, which the list goes to and names its month by. */
private sealed interface Place {
  /** The month whose name the row pinned over the list shows while this is at the top. */
  val month: YearMonth
  val key: String

  /** A month's heading. */
  data class Heading(override val month: YearMonth) : Place {
    override val key = "m$month"
  }

  /** A day's row of 一覧. */
  data class Day(val day: LocalDate) : Place {
    override val month: YearMonth = YearMonth.from(day)
    override val key = "d$day"
  }

  /** A week's block of 週ごと, which belongs to the month it ends in. */
  data class Week(val days: List<LocalDate>) : Place {
    override val month: YearMonth = YearMonth.from(days.last())
    override val key = "w${days.first()}"
  }

  fun holds(day: LocalDate) =
    when (this) {
      is Heading -> false
      is Day -> this.day == day
      is Week -> day in days
    }
}

/** The list's places for [layout]: each month's heading, then its days or the weeks that end in it. */
private fun places(layout: ShiftsLayout, thisMonth: YearMonth, weekStart: Int): List<Place> =
  (-MONTH_SPAN..MONTH_SPAN).flatMap { offset ->
    val month = thisMonth.plusMonths(offset)
    listOf(Place.Heading(month)) +
      when (layout) {
        ShiftsLayout.Days -> (1..month.lengthOfMonth()).map { Place.Day(month.atDay(it)) }
        ShiftsLayout.Weeks ->
          generateSequence(month.atDay(1).weekStartingOn(weekStart)) { it.plusDays(7) }
            .takeWhile { it <= month.atEndOfMonth() }
            // A week belongs to the month it ends in; the list's last month keeps the one its last days are in.
            .filter { YearMonth.from(it.plusDays(6)) == month || (offset == MONTH_SPAN && it <= month.atEndOfMonth()) }
            .map { start -> Place.Week((0L until 7L).map(start::plusDays)) }
            .toList()
        // 1人ずつ pages through months rather than listing them.
        ShiftsLayout.Person -> emptyList()
      }
  }

/**
 * みんなのシフト (/design's ShiftsPage with its list of months): each month under its heading with its
 * みんな休み, then its days a row each (一覧) or its weeks a block each (週ごと), two years either side
 * of today. A group of up to seven opens on 一覧, which shows everyone across; a bigger one on 週ごと,
 * its 一覧 scrolling sideways. It opens on [opening], else today. A day pressed shows everyone's that
 * day in a sheet along the bottom, the table left live above it.
 */
@Composable
fun GroupShiftsPage(groupId: String, opening: LocalDate?, onBack: () -> Unit, onShare: (LocalDate) -> Unit) {
  GroupPage(groupId, stringResource(R.string.group_shifts), onBack) { group -> ShiftsPage(group, opening, onBack, onShare) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShiftsPage(group: GroupRow, opening: LocalDate?, onBack: () -> Unit, onShare: (LocalDate) -> Unit) {
  val colors = LocalThemeColors.current
  val today = rememberToday()
  val thisMonth = YearMonth.from(today)
  val weekStart = LocalDeviceSettings.current.device.week.start
  val country = holidayCountry()
  val meId = rememberMeId()
  val members =
    rememberGroupMembers(group.id, thisMonth.minusMonths(MONTH_SPAN).atDay(1).minusDays(6), thisMonth.plusMonths(MONTH_SPAN).atEndOfMonth().plusDays(6))
  // What the person picked, kept as the activity is made anew.
  var pickedLayout by rememberSaveable { mutableStateOf<ShiftsLayout?>(null) }
  var pickedDay by rememberSaveable { mutableStateOf<String?>(null) }
  var legendOf by rememberSaveable { mutableStateOf<String?>(null) }
  var togetherOf by rememberSaveable { mutableStateOf<String?>(null) }
  var choosingMonth by rememberSaveable { mutableStateOf(false) }
  /** The layout the list was last put in place for. */
  var placed by rememberSaveable { mutableStateOf<ShiftsLayout?>(null) }
  val picked = pickedDay?.let(LocalDate::parse)
  val shown = members ?: emptyList()
  val wide = DayRowsDensity.of(shown.size) == DayRowsDensity.Scroll
  val layout = pickedLayout ?: if (wide) ShiftsLayout.Weeks else ShiftsLayout.Days
  // 一覧's columns: the viewer's own first in a big group, pinned beside the dates, as /design's.
  val tableMembers = remember(shown, meId, wide) { if (wide) shown.sortedByDescending { it.userId == meId } else shown }
  // Where each of 一覧's columns is among the members.
  val tableColumns = remember(tableMembers, shown) { tableMembers.map(shown::indexOf) }
  val places = remember(layout, thisMonth, weekStart) { places(layout, thisMonth, weekStart) }
  val list = rememberLazyListState()
  val scope = rememberCoroutineScope()
  fun indexOf(day: LocalDate) = places.indexOfFirst { it.holds(day) }.coerceAtLeast(0)
  fun go(day: LocalDate) = scope.launch { list.scrollToItem(indexOf(day)) }
  fun goMonth(month: YearMonth) = scope.launch { list.scrollToItem(places.indexOfFirst { it is Place.Heading && it.month == month }.coerceAtLeast(0)) }

  // Once the members are read, as they decide the layout, to the day it opens on with its sheet up;
  // in a new layout, to the picked day or today. Here, once the new layout's list is laid out, as
  // the list keeps the item it had at its top by key across the change.
  LaunchedEffect(layout, members != null) {
    if (members == null || placed == layout) return@LaunchedEffect
    val first = placed == null
    placed = layout
    list.scrollToItem(indexOf(if (first) opening ?: today else picked ?: today))
    if (first && opening != null) pickedDay = opening.toString()
  }

  val sheet = rememberBottomSheetScaffoldState(rememberStandardBottomSheetState(initialValue = SheetValue.Hidden, skipHiddenState = false))
  LaunchedEffect(picked) { if (picked != null) sheet.bottomSheetState.expand() else sheet.bottomSheetState.hide() }
  // Swiped down, the day is no longer picked: the sheet settles hidden or, with no peek, part way
  // up, which looks the same. Only a sheet that came down counts: before a picked day's sheet
  // starts up, it is still settled hidden.
  LaunchedEffect(sheet) {
    var up = false
    snapshotFlow { sheet.bottomSheetState.run { currentValue.takeIf { it == targetValue } } }
      .filterNotNull()
      .collect { settled ->
        if (settled == SheetValue.Expanded) {
          up = true
        } else if (up) {
          up = false
          pickedDay = null
        }
      }
  }
  BackHandler(enabled = picked != null) { pickedDay = null }
  var sheetHeight by remember { mutableIntStateOf(0) }
  // The day the sheet shows, kept while it goes down once no day is picked.
  var sheetDay by remember { mutableStateOf(picked) }
  if (picked != null) sheetDay = picked
  val monthDays = remember(members) { HashMap<YearMonth, GroupDays>() }
  fun daysOf(month: YearMonth) = monthDays.getOrPut(month) { groupDays(shown, month.atDay(1), month.atEndOfMonth()) }
  val monthInSight by remember(places) { derivedStateOf { places.getOrNull(list.firstVisibleItemIndex)?.month ?: thisMonth } }

  BottomSheetScaffold(
    scaffoldState = sheet,
    sheetPeekHeight = 0.dp,
    sheetContent = {
      Box(Modifier.onSizeChanged { sheetHeight = it.height }) {
        sheetDay?.let { day -> DaySheetContent(day, shown, daysOf(YearMonth.from(day)), group.id, meId, onShare) }
      }
    },
    topBar = {
      PageBar(group.name, onBack) {
        if (members != null) {
          LayoutMenu(layout, onLayout = { pickedLayout = it }, onLegend = { legendOf = (shown.firstOrNull { it.userId != meId } ?: shown.firstOrNull())?.userId })
        }
      }
    },
  ) { padding ->
    if (members == null) return@BottomSheetScaffold
    val sideways = if (wide && layout == ShiftsLayout.Days) rememberScrollState() else null
    val todayIndex = places.indexOfFirst { it.holds(today) }
    val todayInSight by remember(places, todayIndex) { derivedStateOf { list.layoutInfo.visibleItemsInfo.any { it.index == todayIndex } } }
    val bottom = with(LocalDensity.current) { if (picked != null) sheetHeight.toDp() else 0.dp }
    if (layout == ShiftsLayout.Person) {
      GroupPersonView(
        members,
        group.id,
        meId,
        today,
        country,
        picked,
        onPick = { pickedDay = if (it == picked) null else it.toString() },
        onTogether = { togetherOf = it.toString() },
        daysOf = ::daysOf,
        modifier = Modifier.padding(padding).padding(bottom = bottom),
      )
      return@BottomSheetScaffold
    }
    Column(Modifier.padding(padding).fillMaxSize()) {
      MonthRow(monthInSight, back = if (todayInSight) null else stringResource(R.string.today), onChoose = { choosingMonth = true }, onBack = { go(today) })
      when (layout) {
        ShiftsLayout.Days ->
          GroupDayHeader(tableMembers, group.id, meId, sideways, onFace = { legendOf = it.userId }, Modifier.padding(horizontal = 16.dp))
        ShiftsLayout.Weeks -> GroupWeekdays(Modifier.padding(horizontal = 20.dp).padding(bottom = 6.dp))
        ShiftsLayout.Person -> Unit
      }
      LazyColumn(Modifier.weight(1f), state = list, contentPadding = PaddingValues(bottom = 24.dp + bottom)) {
        items(places, key = { it.key }, contentType = { it::class }) { place ->
          when (place) {
            is Place.Heading ->
              MonthHeading(place.month, thisMonth, layout, daysOf(place.month).together.takeIf { members.size > 1 }) { togetherOf = place.month.toString() }
            is Place.Day -> {
              val days = daysOf(place.month)
              GroupDayRow(
                place.day,
                tableMembers,
                tableColumns.map { column -> days.shifts[column][place.day] },
                together = place.day in days.together.days,
                picked = place.day == picked,
                today = today,
                country = country,
                sideways = sideways,
                onPick = { pickedDay = if (it == picked) null else it.toString() },
                modifier = Modifier.padding(horizontal = 16.dp),
              )
            }
            is Place.Week ->
              GroupWeek(
                place.days,
                members,
                group.id,
                today,
                Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                  .border(1.dp, colors.separator, RoundedCornerShape(Radius.xxl))
                  .padding(4.dp),
                month = place.month.monthValue,
                picked = picked?.takeIf { it in place.days },
                onPick = { pickedDay = if (it == picked) null else it.toString() },
                onFace = { legendOf = it.userId },
              )
          }
        }
      }
    }
  }

  legendOf?.let { first -> LegendSheet(shown, group.id, first) { legendOf = null } }
  togetherOf?.let { key ->
    val month = YearMonth.parse(key)
    val days = daysOf(month).together.days
    TogetherSheet(togetherTitle(month, thisMonth), days, country, onPick = { day ->
      togetherOf = null
      pickedDay = day.toString()
      // 1人ずつ shows the month already; the list goes to the day.
      if (layout != ShiftsLayout.Person) go(day)
    }) { togetherOf = null }
  }
  if (choosingMonth) {
    MonthPicker(
      monthInSight,
      thisMonth.minusMonths(MONTH_SPAN)..thisMonth.plusMonths(MONTH_SPAN),
      onPick = { goMonth(it) },
      onDismiss = { choosingMonth = false },
    )
  }
}

/** What a month's みんな休み is called: this month's as 今月, another by its name. */
@Composable
fun togetherTitle(month: YearMonth, thisMonth: YearMonth): String =
  stringResource(R.string.together_of, if (month == thisMonth) stringResource(R.string.calendar_this_month) else month.shortText(thisMonth))

/**
 * The month in sight, which opens 月を選ぶ, its chevron saying so, and the way back ([back], 今日 or
 * 今月) while what it goes back to is out of sight (/design's MonthRow): over みんなのシフト's list and
 * over one person's month.
 */
@Composable
fun MonthRow(month: YearMonth, back: String?, onChoose: () -> Unit, onBack: () -> Unit) {
  val colors = LocalThemeColors.current
  Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(start = 8.dp, end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
    TextButton(onClick = onChoose) {
      Text(month.yearMonthText, style = PochicalTextStyles.headline, color = colors.textPrimary)
      Icon(painterResource(R.drawable.ic_expand_more), contentDescription = null, Modifier.padding(start = 4.dp).size(18.dp), tint = colors.textTertiary)
    }
    Box(Modifier.weight(1f))
    if (back != null) {
      OutlinedButton(onClick = onBack) { Text(back) }
    }
  }
}

/**
 * A month's heading, over the row of its みんな休み when it has any, else a note beside its name: none,
 * or that days not entered yet leave it open (/design's MonthDivider); nothing of it for one person.
 */
@Composable
private fun MonthHeading(month: YearMonth, thisMonth: YearMonth, layout: ShiftsLayout, together: app.pochical.kit.Together?, onOpen: () -> Unit) {
  val colors = LocalThemeColors.current
  val name = month.shortText(thisMonth)
  Column(
    Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = if (layout == ShiftsLayout.Weeks) 12.dp else 36.dp, bottom = if (layout == ShiftsLayout.Weeks) 6.dp else 12.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      Text(name, Modifier.semantics { heading() }, style = PochicalTextStyles.headline.copy(fontSize = PochicalTextStyles.headline.fontSize * 1.18f), fontWeight = FontWeight.Bold)
      if (together != null && together.days.isEmpty()) {
        Text(
          stringResource(if (together.unsure) R.string.together_unsure else R.string.together_none),
          style = PochicalTextStyles.subheadline,
          color = colors.textTertiary,
        )
      }
    }
    if (together != null && together.days.isNotEmpty()) {
      TogetherSummary(stringResource(R.string.together_day), together, onOpen)
    }
  }
}

/** The page's menu: how the table is laid out, and what the marks mean. */
@Composable
private fun LayoutMenu(layout: ShiftsLayout, onLayout: (ShiftsLayout) -> Unit, onLegend: () -> Unit) {
  var open by remember { mutableStateOf(false) }
  Box {
    TextButton(onClick = { open = true }) {
      Text(stringResource(layout.title))
      Icon(painterResource(R.drawable.ic_expand_more), contentDescription = null)
    }
    DropdownMenu(open, onDismissRequest = { open = false }) {
      for (option in ShiftsLayout.entries) {
        DropdownMenuItem(
          text = { Text(stringResource(option.title)) },
          onClick = {
            open = false
            onLayout(option)
          },
          trailingIcon = if (option == layout) ({ Icon(painterResource(R.drawable.ic_check), contentDescription = null) }) else null,
        )
      }
      HorizontalDivider()
      DropdownMenuItem(
        text = { Text(stringResource(R.string.patterns)) },
        onClick = {
          open = false
          onLegend()
        },
        leadingIcon = { Icon(painterResource(R.drawable.ic_info), contentDescription = null) },
      )
    }
  }
}
