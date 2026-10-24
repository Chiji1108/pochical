package app.pochical.groups

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.calendar.DAY_FULL_HEIGHT
import app.pochical.calendar.DayCell
import app.pochical.calendar.DayEntry
import app.pochical.calendar.DayLook
import app.pochical.calendar.MonthPicker
import app.pochical.calendar.WeekdayRow
import app.pochical.calendar.holidayName
import app.pochical.calendar.monthWeeks
import app.pochical.calendar.yearMonthText
import app.pochical.design.Metrics
import app.pochical.design.PochicalTextStyles
import app.pochical.design.Radius
import app.pochical.kit.GroupMember
import app.pochical.kit.PhotoShelf
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.launch

/** How many months either side of this one 1人ずつ's pages hold. */
private const val PERSON_SPAN = 24

/** The gap between a page's days, as the calendar's. */
private val DAY_GAP = Metrics.spacingStep

/**
 * 1人ずつ (/design's PeoplePicker and PersonPager): one member at a time, picked from a row of people,
 * their month in the same kind of calendar as the viewer's own, swiped a month at a time under the
 * weekdays, in their own shape. A day the viewer is off too is framed; the month's みんな休み is under it.
 */
@Composable
fun GroupPersonView(
  members: List<GroupMember>,
  groupId: String,
  meId: String?,
  today: LocalDate,
  country: String,
  picked: LocalDate?,
  onPick: (LocalDate) -> Unit,
  onTogether: (YearMonth) -> Unit,
  daysOf: (YearMonth) -> GroupDays,
  modifier: Modifier = Modifier,
) {
  val colors = LocalThemeColors.current
  val settings = LocalDeviceSettings.current
  val bothOffWord = stringResource(R.string.person_both_off_short)
  val thisMonth = YearMonth.from(today)
  // Whom it shows, until picked the first who is not the viewer; kept as the activity is made anew.
  var personId by rememberSaveable { mutableStateOf<String?>(null) }
  val person = members.firstOrNull { it.userId == personId } ?: members.firstOrNull { it.userId != meId } ?: members.firstOrNull() ?: return
  val personIndex = members.indexOf(person)
  val meIndex = members.indexOfFirst { it.userId == meId }
  fun pageOf(target: YearMonth) = (PERSON_SPAN + ChronoUnit.MONTHS.between(thisMonth, target).toInt()).coerceIn(0, PERSON_SPAN * 2)
  // On the picked day's month, as the list goes to the picked day.
  val pages = rememberPagerState(initialPage = pageOf(picked?.let(YearMonth::from) ?: thisMonth)) { PERSON_SPAN * 2 + 1 }
  val scope = rememberCoroutineScope()
  var choosingMonth by rememberSaveable { mutableStateOf(false) }
  val month = thisMonth.plusMonths((pages.currentPage - PERSON_SPAN).toLong())
  fun turnTo(target: YearMonth) = scope.launch { pages.animateScrollToPage(pageOf(target)) }

  Column(modifier.verticalScroll(rememberScrollState()).padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    LazyRow(
      contentPadding = PaddingValues(horizontal = 16.dp),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      items(members, key = { it.userId }) { member ->
        FilterChip(
          selected = member.userId == person.userId,
          onClick = { personId = member.userId },
          label = { Text(member.name, maxLines = 1) },
          leadingIcon = { MemberAvatar(member.name, member.photoId, PhotoShelf.Group(groupId), 24.dp, me = member.userId == meId) },
        )
      }
    }
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(start = 8.dp, end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
      TextButton(onClick = { choosingMonth = true }) { Text(month.yearMonthText, style = PochicalTextStyles.headline, color = colors.textPrimary) }
      Box(Modifier.weight(1f))
      if (month != thisMonth) OutlinedButton(onClick = { turnTo(thisMonth) }) { Text(stringResource(R.string.calendar_this_month)) }
    }
    WeekdayRow(settings.device.week, Modifier.padding(horizontal = 16.dp))
    // Their marks in their own shape, the rest of the look the viewer's.
    val theirs = remember(settings, person) { DeviceSettingsState(settings.device.copy(look = settings.device.look.drawing(person)), settings.change) }
    HorizontalPager(pages, Modifier.fillMaxWidth().height(DAY_FULL_HEIGHT * 6 + DAY_GAP * 5), verticalAlignment = Alignment.Top) { page ->
      val shown = thisMonth.plusMonths((page - PERSON_SPAN).toLong())
      val weeks = remember(shown, settings.device.week.start) { monthWeeks(shown, settings.device.week.start) }
      val pageDays = daysOf(shown)
      fun shiftOf(index: Int, day: LocalDate) = pageDays.shifts.getOrNull(index)?.get(day)
      CompositionLocalProvider(LocalDeviceSettings provides theirs) {
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(DAY_GAP)) {
          for (week in weeks) {
            Row(horizontalArrangement = Arrangement.spacedBy(DAY_GAP)) {
              for (day in week) {
                val outside = YearMonth.from(day) != shown
                val shift = if (outside) null else shiftOf(personIndex, day)
                val bothOff =
                  !outside && person.userId != meId && meIndex >= 0 && shift?.pattern?.countsAsOff == true && shiftOf(meIndex, day)?.pattern?.countsAsOff == true
                Box(
                  Modifier.weight(1f).semantics(mergeDescendants = true) { if (bothOff) stateDescription = bothOffWord },
                ) {
                DayCell(
                  DayLook(
                    day = day,
                    entry = shift?.let { DayEntry(it.pattern.id, it.start, it.end, emptyList()) },
                    pattern = shift?.pattern,
                    note = null,
                    holiday = day.holidayName(country),
                    outside = outside,
                    isToday = day == today,
                    isSelected = day == picked,
                  ),
                  height = DAY_FULL_HEIGHT,
                  colorsHoliday = settings.device.week.holiday,
                  onClick = { onPick(day) },
                  modifier =
                    Modifier.fillMaxWidth().then(
                      if (bothOff && day != picked) Modifier.border(1.5.dp, colors.accentBorder, RoundedCornerShape(Radius.md)) else Modifier
                    ),
                  enabled = !outside,
                )
                }
              }
            }
          }
        }
      }
    }
    if (person.userId != meId && meIndex >= 0) {
      Text(stringResource(R.string.person_both_off), Modifier.padding(horizontal = 20.dp), style = PochicalTextStyles.footnote, color = colors.textTertiary)
    }
    val together = daysOf(month).together
    TogetherSummary(
      togetherTitle(month, thisMonth),
      together,
      onOpen = { onTogether(month) },
      modifier = Modifier.padding(horizontal = 16.dp),
    )
  }
  if (choosingMonth) {
    MonthPicker(month, thisMonth.minusMonths(PERSON_SPAN.toLong())..thisMonth.plusMonths(PERSON_SPAN.toLong()), onPick = { turnTo(it) }, onDismiss = { choosingMonth = false })
  }
}
