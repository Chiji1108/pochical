package app.pochical.groups

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pochical.ListSheet
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.calendar.Pattern
import app.pochical.calendar.fullText
import app.pochical.calendar.holidayName
import app.pochical.calendar.hoursText
import app.pochical.calendar.pattern
import app.pochical.design.PochicalTextStyles
import app.pochical.design.Radius
import app.pochical.kit.GroupMember
import app.pochical.kit.PhotoShelf
import app.pochical.kit.Together
import java.time.LocalDate

/**
 * Everyone's shifts on a day (/design's PickedDaySheet): a row a member, their face and name, their
 * mark, the pattern's name and hours, 早出 and 残業 said in words with the day's own hours; みんな休み
 * under the date when it is one.
 */
@Composable
fun DaySheetContent(day: LocalDate, members: List<GroupMember>, days: GroupDays, groupId: String, meId: String?) {
  val colors = LocalThemeColors.current
  Column(Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      Text(day.fullText, Modifier.semantics { heading() }, style = PochicalTextStyles.headline, color = colors.textPrimary)
      if (day in days.together.days) {
        Text(stringResource(R.string.together_day), style = PochicalTextStyles.caption2, fontWeight = FontWeight.SemiBold, color = colors.accentDefault)
      }
    }
    members.forEachIndexed { index, member ->
      val shift = days.shifts[index][day]
      ListItem(
        headlineContent = { Text(member.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingContent = { MemberAvatar(member.name, member.photoId, PhotoShelf.Group(groupId), 28.dp, me = member.userId == meId) },
        trailingContent = {
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (shift != null) MemberMark(member, shift, 18.dp)
            Text(shift?.pattern?.name ?: stringResource(R.string.day_unentered), color = if (shift == null) colors.textTertiary else colors.textSecondary)
            shift?.let { hours(it) }?.let { Text(it, style = PochicalTextStyles.caption, color = colors.textTertiary) }
          }
        },
        colors = ListItemDefaults.colors(containerColor = androidx.compose.ui.graphics.Color.Transparent),
        modifier = Modifier.heightIn(min = 48.dp),
      )
    }
  }
}

/** The pattern's hours, or the day's own with 早出 and 残業 in words. */
@Composable
private fun hours(shift: MemberShift): String? {
  val time = shift.pattern.time ?: return null
  val hours = hoursText(shift.start ?: time.start, shift.end ?: time.end)
  val change = shift.change ?: return hours
  val moves = listOfNotNull(stringResource(R.string.day_early).takeIf { change.early }, stringResource(R.string.day_late).takeIf { change.late })
  return listOf(moves.joinToString("・"), hours).filter { it.isNotEmpty() }.joinToString(" ")
}

/**
 * A month's days everyone is off (/design's TogetherSummary): how many, opening the dates; none, it
 * says so, or that days not entered yet leave it open, in a row that cannot be pressed.
 */
@Composable
fun TogetherSummary(label: String, together: Together, onOpen: () -> Unit, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val open = together.days.isNotEmpty()
  Surface(
    modifier.fillMaxWidth().then(if (open) Modifier.clickable(onClick = onOpen) else Modifier),
    shape = RoundedCornerShape(Radius.xxl),
    color = colors.fillQuaternary,
  ) {
    Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp).heightIn(min = 30.dp), verticalAlignment = Alignment.CenterVertically) {
      Text(label, Modifier.weight(1f), style = PochicalTextStyles.footnote, color = colors.textSecondary)
      Text(
        when {
          open -> stringResource(R.string.days_count, together.days.size)
          together.unsure -> stringResource(R.string.together_unsure_short)
          else -> stringResource(R.string.none)
        },
        style = PochicalTextStyles.headline,
        color = if (open) colors.textPrimary else colors.textTertiary,
      )
    }
  }
}

/** The days everyone is off in a month, a date to a row; picking one shows everyone that day. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TogetherSheet(title: String, days: List<LocalDate>, country: String, onPick: (LocalDate) -> Unit, onDismiss: () -> Unit) {
  ListSheet(onDismiss, title, titleStyle = PochicalTextStyles.headline, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    items(days, key = { it.toString() }) { day ->
      ListItem(
        headlineContent = { Text(day.fullText) },
        trailingContent = day.holidayName(country)?.let { { Text(it) } },
        colors = ListItemDefaults.colors(containerColor = androidx.compose.ui.graphics.Color.Transparent),
        modifier = Modifier.clickable { onPick(day) },
      )
    }
  }
}

/**
 * What each mark means, one person at a time in their own shape, picked by the chips over the list as
 * 1人ずつ picks whom to show (/design's LegendSheet). It opens on [first]: the face pressed, or from
 * the menu the first of the others.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LegendSheet(members: List<GroupMember>, groupId: String, first: String, onDismiss: () -> Unit) {
  var picked by rememberSaveable { mutableStateOf(first) }
  val member = members.firstOrNull { it.userId == picked } ?: members.firstOrNull() ?: return
  val chips = rememberLazyListState()
  LaunchedEffect(Unit) { chips.scrollToItem(members.indexOf(member).coerceAtLeast(0)) }
  ModalBottomSheet(onDismissRequest = onDismiss) {
    Text(stringResource(R.string.patterns), Modifier.padding(horizontal = 24.dp, vertical = 8.dp).semantics { heading() }, style = PochicalTextStyles.headline)
    LazyRow(state = chips, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      items(members, key = { it.userId }) { candidate ->
        FilterChip(
          selected = candidate.userId == member.userId,
          onClick = { picked = candidate.userId },
          label = { Text(candidate.name, maxLines = 1) },
          leadingIcon = { MemberAvatar(candidate.name, candidate.photoId, PhotoShelf.Group(groupId), 24.dp) },
        )
      }
    }
    val patterns = legendPatterns(member)
    if (patterns.isEmpty()) {
      Text(
        stringResource(R.string.legend_none),
        Modifier.fillMaxWidth().padding(24.dp),
        style = PochicalTextStyles.subheadline,
        color = LocalThemeColors.current.textTertiary,
      )
    }
    LazyColumn(Modifier.padding(bottom = 16.dp)) {
      items(patterns, key = { it.id }) { pattern ->
        ListItem(
          headlineContent = { Text(pattern.name) },
          leadingContent = { MemberMark(member, MemberShift(pattern, change = null), 20.dp) },
          trailingContent = pattern.time?.let { time -> { Text(hoursText(time.start, time.end)) } },
          colors = ListItemDefaults.colors(containerColor = androidx.compose.ui.graphics.Color.Transparent),
        )
      }
    }
  }
}

/** A member's patterns in a steady order: shifts by when they start, then those without hours, then days off, each by name. */
fun legendPatterns(member: GroupMember): List<Pattern> =
  member.calendar.patterns
    .map { it.pattern }
    .sortedWith(
      compareBy<Pattern>({ if (it.countsAsOff) 2 else if (it.time == null) 1 else 0 }, { it.time?.start.orEmpty() }, { it.name })
    )
