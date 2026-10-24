package app.pochical.groups

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.calendar.holidayName
import app.pochical.calendar.monthDayText
import app.pochical.calendar.weekday
import app.pochical.calendar.weekdayColor
import app.pochical.calendar.weekdayLetter
import app.pochical.design.PochicalTextStyles
import app.pochical.kit.GroupMember
import app.pochical.kit.PhotoShelf
import java.time.LocalDate

/** How much of a member fits across 一覧 (/design's densityOf): names up to four people, marks alone up to seven; more scroll sideways. */
enum class DayRowsDensity {
  Names,
  Marks,
  Scroll;

  /** A member's column: shared out across the screen, or as wide as a mark when they scroll. */
  val columnWidth: Dp?
    get() = if (this == Scroll) 40.dp else null

  companion object {
    fun of(members: Int) =
      when {
        members <= 4 -> Names
        members <= 7 -> Marks
        else -> Scroll
      }
  }
}

/** The width of a day's date at the start of its row. */
private val DATE_WIDTH = 46.dp

/** Today's bar at a row's start, where every row keeps the room for it. */
private val TODAY_BAR = 3.dp

/** A member's column, shared out across the row or as wide as [DayRowsDensity.columnWidth]. */
private fun Modifier.column(row: RowScope, density: DayRowsDensity): Modifier =
  density.columnWidth?.let { width(it) } ?: with(row) { weight(1f) }

/**
 * 一覧's heading (/design's DayRowsTable): a column a member, their face, which shows what their marks
 * mean ([onFace]), and their name while few. A big group's follows the rows sideways ([sideways]),
 * the first, the viewer's own, kept over its pinned column.
 */
@Composable
fun GroupDayHeader(members: List<GroupMember>, groupId: String, meId: String?, sideways: ScrollState?, onFace: ((GroupMember) -> Unit)?, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val density = DayRowsDensity.of(members.size)
  Column(modifier) {
    Row(Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
      Box(Modifier.width(DATE_WIDTH))
      if (sideways != null) {
        members.firstOrNull()?.let { Face(it, groupId, meId, density, onFace, Modifier.width(density.columnWidth!!)) }
        Row(Modifier.weight(1f).sideways(sideways, LocalThemeColors.current.separator)) {
          for (member in members.drop(1)) Face(member, groupId, meId, density, onFace, Modifier.width(density.columnWidth!!))
        }
      } else {
        for (member in members) Face(member, groupId, meId, density, onFace, Modifier.column(this, density))
      }
    }
    HorizontalDivider(color = colors.separator)
  }
}

@Composable
private fun Face(member: GroupMember, groupId: String, meId: String?, density: DayRowsDensity, onFace: ((GroupMember) -> Unit)?, modifier: Modifier) {
  Row(
    modifier
      .then(if (onFace != null) Modifier.clickable(role = Role.Button, onClickLabel = stringResource(R.string.legend_open)) { onFace(member) } else Modifier)
      .padding(horizontal = 4.dp)
      .clearAndSetSemantics { contentDescription = member.name },
    horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    MemberAvatar(member.name, member.photoId, PhotoShelf.Group(groupId), 24.dp, me = member.userId == meId)
    if (density == DayRowsDensity.Names) {
      Text(
        member.name,
        style = PochicalTextStyles.footnote,
        fontWeight = FontWeight.SemiBold,
        color = LocalThemeColors.current.textPrimary,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    }
  }
}

/**
 * A day of 一覧, a row across everyone (/design's DayRow): its date and weekday, today barred in the
 * accent, then each member's mark, named while few. A day off is on its tile; a day everyone is off
 * one band along the row, and the picked day framed the same way. The whole row picks the day.
 * Scrolling [sideways], the date and the first member's column (the viewer's own) stay at the start.
 */
@Composable
fun GroupDayRow(
  day: LocalDate,
  members: List<GroupMember>,
  shifts: List<MemberShift?>,
  together: Boolean,
  picked: Boolean,
  today: LocalDate,
  country: String,
  sideways: ScrollState?,
  onPick: (LocalDate) -> Unit,
  modifier: Modifier = Modifier,
) {
  val colors = LocalThemeColors.current
  val density = DayRowsDensity.of(members.size)
  val unentered = stringResource(R.string.day_unentered)
  val togetherWord = stringResource(R.string.together_day)
  val isToday = day == today
  Column(modifier) {
  Row(
    Modifier.fillMaxWidth()
      .height(IntrinsicSize.Min)
      .heightIn(min = 36.dp)
      .dayMarks(band = colors.accentContainer.takeIf { together }, frame = colors.accentDefault.takeIf { picked }, inset = TODAY_BAR + 3.dp, vertical = 3.dp)
      .clickable(role = Role.Button) { onPick(day) }
      .clearAndSetSemantics {
        contentDescription =
          buildList {
              add(day.monthDayText + if (together) "、$togetherWord" else "")
              members.forEachIndexed { index, member -> add("${member.name}：${shifts[index]?.pattern?.name ?: unentered}") }
            }
            .joinToString("、")
        selected = picked
      },
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(Modifier.width(TODAY_BAR).fillMaxHeight().then(if (isToday) Modifier.background(colors.accentDefault) else Modifier))
    DateLabel(day, isToday, country)
    if (sideways != null) {
      if (members.isNotEmpty()) Cell(members[0], shifts[0], density, together, Modifier.width(density.columnWidth!!))
      Row(Modifier.weight(1f).sideways(sideways, LocalThemeColors.current.separator)) {
        members.drop(1).forEachIndexed { index, member -> Cell(member, shifts[index + 1], density, together, Modifier.width(density.columnWidth!!)) }
      }
    } else {
      members.forEachIndexed { index, member -> Cell(member, shifts[index], density, together, Modifier.column(this, density)) }
    }
  }
  HorizontalDivider(color = colors.separator)
  }
}

@Composable
private fun DateLabel(day: LocalDate, isToday: Boolean, country: String) {
  val colors = LocalThemeColors.current
  val week = LocalDeviceSettings.current.device.week
  val tone = if (isToday) colors.accentDefault else weekdayColor(day.weekday, day.holidayName(country) != null, week, colors.textPrimary)
  Row(Modifier.width(DATE_WIDTH - TODAY_BAR).padding(start = 9.dp), verticalAlignment = Alignment.Bottom) {
    Text(day.dayOfMonth.toString(), style = PochicalTextStyles.caption, fontWeight = if (isToday) FontWeight.ExtraBold else FontWeight.SemiBold, color = tone)
    Text(weekdayLetter(day.weekday), Modifier.padding(start = 3.dp, bottom = 1.dp), fontSize = 9.sp, color = tone)
  }
}

@Composable
private fun Cell(member: GroupMember, shift: MemberShift?, density: DayRowsDensity, together: Boolean, modifier: Modifier) {
  val colors = LocalThemeColors.current
  val tiled = shift?.pattern?.countsAsOff == true && !together
  Row(
    modifier.heightIn(min = 36.dp).dayMarks(band = colors.accentContainer.takeIf { tiled }, frame = null, inset = 3.dp, vertical = 3.dp).padding(horizontal = 4.dp),
    horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (shift != null) {
      MemberMark(member, shift, 16.dp)
      if (density == DayRowsDensity.Names) {
        Text(shift.pattern.name, fontSize = 11.sp, color = colors.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    } else {
      Text(if (density == DayRowsDensity.Names) stringResource(R.string.day_unentered) else "・", fontSize = 10.sp, color = colors.textDisabled)
    }
  }
}

/**
 * The part of a big group's 一覧 that scrolls sideways, every row and the heading on one [state], so
 * they move together; with no overscroll of its own, which would move the row under the finger
 * apart from the rest, and an edge at its start while others pass under the pinned columns.
 */
private fun Modifier.sideways(state: ScrollState, edge: Color): Modifier =
  drawWithContent {
      drawContent()
      if (state.value > 0) drawLine(edge, Offset.Zero, Offset(0f, size.height), strokeWidth = 1.dp.toPx())
    }
    .horizontalScroll(state, overscrollEffect = null)
