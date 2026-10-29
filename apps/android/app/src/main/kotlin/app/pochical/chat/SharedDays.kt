package app.pochical.chat

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.ListSheet
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.calendar.WeekdayRow
import app.pochical.calendar.fullText
import app.pochical.calendar.holidayCountry
import app.pochical.calendar.holidayName
import app.pochical.calendar.monthWeeks
import app.pochical.calendar.monthWithYear
import app.pochical.calendar.shortMonth
import app.pochical.calendar.slashText
import app.pochical.calendar.weekday
import app.pochical.calendar.weekdayColor
import app.pochical.calendar.weekdayName
import app.pochical.design.Chat
import app.pochical.design.POLL_MIN_DAYS
import app.pochical.design.Radius
import app.pochical.design.SHARED_DAYS_MAX
import app.pochical.groups.MemberAvatar
import app.pochical.groups.MemberMark
import app.pochical.groups.MemberShift
import app.pochical.groups.groupDays
import app.pochical.groups.rememberGroupDays
import app.pochical.groups.rememberGroupMembers
import app.pochical.kit.GroupMember
import app.pochical.kit.PhotoShelf
import app.pochical.calendar.rememberToday
import java.time.LocalDate
import java.time.YearMonth

// Days shared in a chat with everyone's shifts (spec/chat.md, Long messages and shared days; Polls;
// /design's DayCard and DaySheet), as iOS's SharedDays.swift: the card a line of them is drawn as,
// and the sheet they are picked in to share or to put to the vote.

/**
 * A line's shared days: シフト表で見る, which the link under the card offers too, opening the group's
 * shifts at the first of them. Its days are gone through one by one in the card after its line.
 */
data class DaysPart(val first: LocalDate) : LinePart {
  @Composable
  override fun actions(line: PartLine): List<CustomAccessibilityAction> {
    val label = stringResource(R.string.chat_see_shifts)
    return listOf(CustomAccessibilityAction(label) { line.handlers.openShifts(first); true })
  }
}

/**
 * Shared days with each person's shift (/design's DayCard). One day spreads out, wrapping when the
 * people are many; several become a small table, a row a day, or a row a person when the people do
 * not fit across. Either keeps to `chatRules.dayCardRows` days (or `dayCardColumns` across), so a
 * month shared does not fill the chat; ほか{n}日 says the rest, which シフト表で見る under it shows.
 */
@Composable
fun DayCard(days: List<LocalDate>, members: List<GroupMember>, groupId: String, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  // Its small type and table grow with the reader's text size as far as chatRules.cardsMostScale,
  // so its columns still fit a line on the narrowest phone.
  val k = minOf(LocalDensity.current.fontScale, Chat.cardsMostScale)
  val shown = if (days.size > 1 && members.size > Chat.dayCardColumns) days.take(Chat.dayCardColumns) else days.take(Chat.dayCardRows)
  val group = rememberGroupDays(members, shown.first(), shown.last())
  val shape = RoundedCornerShape(Radius.lg)
  val card = CardDays(members, group, PhotoShelf.Group(groupId), k)
  Column(modifier.background(MaterialTheme.colorScheme.surfaceContainerLow, shape).border(1.dp, colors.borderDefault, shape)) {
    when {
      days.size == 1 -> card.OneDay(days.single())
      members.size > Chat.dayCardColumns -> card.ByPerson(shown)
      else -> card.ByDay(shown)
    }
    if (days.size > shown.size) {
      Text(
        stringResource(R.string.chat_days_rest, days.size - shown.size),
        Modifier.align(Alignment.End).padding(start = 12.dp, end = 12.dp, bottom = 8.dp),
        style = MaterialTheme.typography.labelSmall,
        color = colors.textTertiary,
      )
    }
  }
}

/** What a card of days draws its parts with: each person's shift on the days shown. */
private class CardDays(val members: List<GroupMember>, val days: app.pochical.groups.GroupDays, val shelf: PhotoShelf, val k: Float) {
  fun shift(index: Int, day: LocalDate): MemberShift? = days.shifts.getOrNull(index)?.get(day)

  fun together(day: LocalDate): Boolean = day in days.together.days

  @Composable
  fun OneDay(day: LocalDate) {
    val colors = LocalThemeColors.current
    val unentered = stringResource(R.string.day_unentered)
    Column(Modifier.widthIn(min = (ONE_DAY_INSIDE + 24f).dp * k).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(day.fullText, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = colors.textPrimary)
        if (together(day)) TogetherTag()
      }
      // The people in even columns across the card, many wrapping onto more lines in the same columns.
      val columns = members.size.coerceIn(1, Chat.dayCardColumns)
      val column = maxOf(LEAST_COLUMN * k, ONE_DAY_INSIDE * k / columns).dp
      members.indices.chunked(columns).forEach { row ->
        Row {
          for (index in row) {
            val member = members[index]
            val shift = shift(index, day)
            val name = shift?.pattern?.name ?: unentered
            val said = stringResource(R.string.chat_day_shift, member.name, name)
            Column(
              Modifier.width(column).clearAndSetSemantics { contentDescription = said },
              horizontalAlignment = Alignment.CenterHorizontally,
              verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
              MemberAvatar(member.name, member.photoId, shelf, (24 * k).dp)
              Mark(member, shift, (16 * k).dp)
              Text(name, fontSize = (9 * k).sp, color = colors.textTertiary, maxLines = 1)
            }
          }
        }
      }
    }
  }

  /** A row a day, a column a person. */
  @Composable
  fun ByDay(shown: List<LocalDate>) {
    val unentered = stringResource(R.string.day_unentered)
    Column(Modifier.padding(8.dp), horizontalAlignment = Alignment.End) {
      Row(Modifier.heightIn(min = (30 * k).dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Spacer(Modifier.width((DATE_WIDTH * k).dp))
        for (member in members) {
          Box(Modifier.width((26 * k).dp), contentAlignment = Alignment.Center) { MemberAvatar(member.name, member.photoId, shelf, (22 * k).dp, Modifier.semantics { contentDescription = member.name }) }
        }
      }
      for (day in shown) {
        Row(
          Modifier.heightIn(min = (28 * k).dp)
            .background(if (together(day)) LocalThemeColors.current.accentContainer else Color.Transparent, RoundedCornerShape(Radius.sm))
            .semantics(mergeDescendants = true) {},
          horizontalArrangement = Arrangement.spacedBy(4.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          DateText(day, Modifier.width((DATE_WIDTH * k).dp).padding(start = 4.dp))
          members.forEachIndexed { index, member ->
            val shift = shift(index, day)
            val said = stringResource(R.string.chat_day_shift, member.name, shift?.pattern?.name ?: unentered)
            Cell(member, shift, Modifier.width((26 * k).dp).clearAndSetSemantics { contentDescription = said })
          }
        }
      }
    }
  }

  /** A row a person, a column a day: the people cannot be fewer, but the days can. */
  @Composable
  fun ByPerson(shown: List<LocalDate>) {
    val colors = LocalThemeColors.current
    val english = LocalDeviceSettings.current.device.heading.english
    val unentered = stringResource(R.string.day_unentered)
    Column(Modifier.padding(8.dp), horizontalAlignment = Alignment.End) {
      Row(Modifier.heightIn(min = (30 * k).dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        // As in the shift table, the month once in the corner and the days by number, a new month's where it turns.
        Text(
          YearMonth.from(shown.first()).shortMonth(english),
          Modifier.width((26 * k).dp),
          fontSize = (9 * k).sp,
          color = colors.textTertiary,
          textAlign = TextAlign.Center,
        )
        shown.forEachIndexed { index, day ->
          val turns = index > 0 && day.month != shown[index - 1].month
          val tone = dayTone(day)
          Column(
            Modifier.width((28 * k).dp)
              .background(if (together(day)) colors.accentContainer else Color.Transparent, RoundedCornerShape(Radius.sm))
              .padding(vertical = 2.dp)
              .clearAndSetSemantics { contentDescription = day.fullText },
            horizontalAlignment = Alignment.CenterHorizontally,
          ) {
            Text(if (turns) day.slashText else "${day.dayOfMonth}", fontSize = (11 * k).sp, fontWeight = FontWeight.SemiBold, color = tone)
            Text(weekdayName(day.weekday, english), fontSize = (9 * k).sp, color = tone)
          }
        }
      }
      members.forEachIndexed { index, member ->
        Row(
          Modifier.heightIn(min = (28 * k).dp).semantics(mergeDescendants = true) {},
          horizontalArrangement = Arrangement.spacedBy(4.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Box(Modifier.width((26 * k).dp), contentAlignment = Alignment.Center) { MemberAvatar(member.name, member.photoId, shelf, (22 * k).dp, Modifier.semantics { contentDescription = member.name }) }
          for (day in shown) {
            val shift = shift(index, day)
            val said = stringResource(R.string.chat_day_shift, day.fullText, shift?.pattern?.name ?: unentered)
            Cell(member, shift, Modifier.width((28 * k).dp).clearAndSetSemantics { contentDescription = said })
          }
        }
      }
    }
  }

  /** A person's shift on a day in a table, on the tile's color when off. */
  @Composable
  fun Cell(member: GroupMember, shift: MemberShift?, modifier: Modifier) {
    Box(
      modifier.heightIn(min = (24 * k).dp).background(if (shift?.pattern?.countsAsOff == true) LocalThemeColors.current.accentContainer else Color.Transparent, RoundedCornerShape(Radius.sm)),
      contentAlignment = Alignment.Center,
    ) {
      Mark(member, shift, (15 * k).dp)
    }
  }

  @Composable
  fun Mark(member: GroupMember, shift: MemberShift?, size: Dp) {
    if (shift != null) MemberMark(member, shift, size) else Spacer(Modifier.size(size))
  }

  @Composable
  fun DateText(day: LocalDate, modifier: Modifier) {
    val english = LocalDeviceSettings.current.device.heading.english
    val tone = dayTone(day)
    Row(modifier.clearAndSetSemantics { contentDescription = day.fullText }, verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
      Text(day.slashText, fontSize = (11 * k).sp, fontWeight = FontWeight.SemiBold, color = tone, maxLines = 1, softWrap = false)
      Text(weekdayName(day.weekday, english), fontSize = (9 * k).sp, color = tone, maxLines = 1, softWrap = false)
    }
  }
}

/** みんな休み, as a tag beside a day's date. */
@Composable
private fun TogetherTag() {
  val colors = LocalThemeColors.current
  Text(
    stringResource(R.string.together_day),
    Modifier.background(colors.accentContainer, CircleShape).padding(horizontal = 6.dp, vertical = 2.dp),
    style = MaterialTheme.typography.labelSmall,
    fontWeight = FontWeight.SemiBold,
    color = colors.accentDefault,
  )
}

/** The date's color by the week's: Sundays and holidays in red, Saturdays in blue, as the person has them. */
@Composable
private fun dayTone(day: LocalDate): Color {
  val country = remember { holidayCountry() }
  return weekdayColor(day.weekday, holiday = day.holidayName(country) != null, LocalDeviceSettings.current.device.week, plain = LocalThemeColors.current.textPrimary)
}

/** How the days sheet was opened: to share days, or to put them to the vote. */
enum class DaysPick {
  Share,
  Poll,
}

/**
 * The days to share or to put to the vote, picked (/design's DaySheet): the days everyone is off in
 * the next weeks offered first, then a month to pick any from. 送る sends them as a line of their
 * own with everyone's shifts, or as a poll, which waits for `POLL_MIN_DAYS` days. Which it is is how
 * it was opened, never changed in it. A day past `SHARED_DAYS_MAX` stays unpicked, and says so.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareDaysSheet(groupId: String, people: Set<String>?, pick: DaysPick, onDismiss: () -> Unit, onSend: (List<LocalDate>) -> Unit) {
  val colors = LocalThemeColors.current
  val context = LocalContext.current
  val today = rememberToday()
  var month by rememberSaveable { mutableStateOf(YearMonth.from(today).toString()) }
  var picked by rememberSaveable { mutableStateOf(emptyList<String>()) }
  val shownMonth = YearMonth.parse(month)
  val from = minOf(shownMonth.atDay(1), today)
  val through = maxOf(today.plusDays(SUGGESTION_DAYS - 1), shownMonth.atEndOfMonth())
  // Those last read stay while a month turned to is read, so the tints do not flash away.
  var read by remember { mutableStateOf(emptyList<GroupMember>()) }
  rememberGroupMembers(groupId, from, through)?.let { read = it }
  val members = remember(read, people) { read.filter { people == null || it.userId in people } }
  val together = remember(members, from, through) { groupDays(members, from, through).together.days.toSet() }
  val tooMany = stringResource(R.string.days_too_many, SHARED_DAYS_MAX)
  val toggle = { day: LocalDate ->
    val key = day.toString()
    picked =
      when {
        key in picked -> picked - key
        picked.size >= SHARED_DAYS_MAX -> {
          // Over the sheet, where the chat's own messages would be hidden under it.
          Toast.makeText(context, tooMany, Toast.LENGTH_SHORT).show()
          picked
        }
        else -> (picked + key).sorted()
      }
  }
  val least = if (pick == DaysPick.Poll) POLL_MIN_DAYS else 1
  // Through the sheets' one piece, so the month and the note stay in reach at any text size.
  // Up whole at once, so the month and the note under it are in sight.
  ListSheet(onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    item {
      Row(Modifier.fillMaxWidth().padding(start = 24.dp, end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
          stringResource(if (pick == DaysPick.Poll) R.string.chat_poll_days else R.string.chat_share_days),
          Modifier.weight(1f).semantics { heading() },
          style = MaterialTheme.typography.titleLarge,
        )
        TextButton(onClick = { onSend(picked.map(LocalDate::parse)) }, enabled = picked.size >= least) { Text(stringResource(R.string.days_send)) }
      }
    }
    val suggestions = together.filter { it >= today && it < today.plusDays(SUGGESTION_DAYS) }.sorted()
    if (suggestions.isNotEmpty()) {
      item {
        Text(
          stringResource(R.string.together_day),
          Modifier.padding(start = 24.dp, end = 24.dp, top = 8.dp, bottom = 4.dp),
          style = MaterialTheme.typography.labelMedium,
          color = colors.textSecondary,
        )
        LazyRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          items(suggestions, key = { it.toString() }) { day ->
            val on = day.toString() in picked
            FilterChip(
              selected = on,
              onClick = { toggle(day) },
              label = { Text(day.fullText) },
              leadingIcon = if (on) ({ Icon(painterResource(R.drawable.ic_check), contentDescription = null, Modifier.size(FilterChipDefaults.IconSize)) }) else null,
            )
          }
        }
      }
    }
    item {
      MonthGrid(shownMonth, today, together, picked.toSet(), onMonth = { month = it.toString() }, onToggle = toggle)
    }
    item {
      val note =
        when {
          pick == DaysPick.Poll && picked.size < POLL_MIN_DAYS -> stringResource(R.string.days_poll_few, POLL_MIN_DAYS)
          pick == DaysPick.Poll -> stringResource(R.string.days_poll_count, picked.size)
          picked.isEmpty() -> stringResource(R.string.days_tinted)
          else -> stringResource(R.string.days_share_count, picked.size)
        }
      Text(note, Modifier.padding(horizontal = 24.dp, vertical = 8.dp).heightIn(min = 40.dp), style = MaterialTheme.typography.bodySmall, color = colors.textSecondary)
    }
  }
}

/** A month to pick any day from, ‹ › turning it; room kept for six weeks, so what is under it stays put as the months turn. */
@Composable
private fun MonthGrid(month: YearMonth, today: LocalDate, together: Set<LocalDate>, picked: Set<String>, onMonth: (YearMonth) -> Unit, onToggle: (LocalDate) -> Unit) {
  val colors = LocalThemeColors.current
  val week = LocalDeviceSettings.current.device.week
  val english = LocalDeviceSettings.current.device.heading.english
  val weeks = remember(month, week.start) { monthWeeks(month, week.start) }
  Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      IconButton(onClick = { onMonth(month.minusMonths(1)) }) { Icon(painterResource(R.drawable.ic_chevron_left), stringResource(R.string.days_previous_month)) }
      Text(month.monthWithYear(english), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
      IconButton(onClick = { onMonth(month.plusMonths(1)) }) { Icon(painterResource(R.drawable.ic_chevron_right), stringResource(R.string.days_next_month)) }
    }
    WeekdayRow(week)
    for (row in 0 until MOST_WEEKS) {
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        for (column in 0 until 7) {
          val day = weeks.getOrNull(row)?.get(column)
          if (day != null && YearMonth.from(day) == month) {
            DayButton(day, day.toString() in picked, day in together, day == today, Modifier.weight(1f)) { onToggle(day) }
          } else {
            Spacer(Modifier.weight(1f).heightIn(min = DAY_HEIGHT))
          }
        }
      }
    }
  }
}

@Composable
private fun DayButton(day: LocalDate, on: Boolean, together: Boolean, today: Boolean, modifier: Modifier, onToggle: () -> Unit) {
  val colors = LocalThemeColors.current
  val shape = RoundedCornerShape(Radius.md)
  val label = if (together) stringResource(R.string.days_together_marked, day.fullText) else day.fullText
  Box(
    modifier
      .heightIn(min = DAY_HEIGHT)
      .background(
        when {
          on -> colors.accentFill
          together -> colors.accentContainer
          else -> Color.Transparent
        },
        shape,
      )
      .then(if (today && !on) Modifier.border(1.dp, colors.accentBorder, shape) else Modifier)
      .toggleable(value = on, role = Role.Checkbox, onValueChange = { onToggle() })
      .semantics { contentDescription = label },
    contentAlignment = Alignment.Center,
  ) {
    Text(
      "${day.dayOfMonth}",
      Modifier.clearAndSetSemantics {},
      style = MaterialTheme.typography.bodyMedium,
      fontWeight = if (today) FontWeight.Bold else FontWeight.Normal,
      color =
        when {
          on -> colors.accentOnFill
          today -> colors.accentDefault
          else -> dayTone(day)
        },
    )
  }
}

/** How far ahead the days everyone is off are offered. */
private const val SUGGESTION_DAYS = 45L

/** The dates' column, room for 12/28 and its weekday. */
private const val DATE_WIDTH = 52f

/** Inside one day's card at its narrowest, room for 12月27日(日) and the tag. */
private const val ONE_DAY_INSIDE = 160f

/** A person's column at its narrowest. */
private const val LEAST_COLUMN = 36f

private val DAY_HEIGHT = 40.dp

/** The most weeks a month spans, the room the grid keeps. */
private const val MOST_WEEKS = 6
