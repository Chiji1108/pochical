package app.pochical.groups

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.Week
import app.pochical.calendar.fullText
import app.pochical.calendar.holidayName
import app.pochical.calendar.holidayCountry
import app.pochical.calendar.monthDayText
import app.pochical.calendar.slashText
import app.pochical.calendar.weekday
import app.pochical.calendar.weekdayColor
import app.pochical.calendar.weekdayLetter
import app.pochical.design.PochicalTextStyles
import app.pochical.design.Radius
import app.pochical.kit.GroupMember
import app.pochical.kit.PhotoShelf
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** How far ahead the hub looks for the next day everyone is off. */
const val NEXT_TOGETHER_DAYS = 60L

/** Today and the six days after it, as the hub shows everyone's shifts, so a weekend is always in sight. */
fun upcomingWeek(today: LocalDate): List<LocalDate> = (0L until 7L).map(today::plusDays)

/** The width of the faces beside a week: room around a face on the hub's card, more on the month's blocks. */
private fun facesWidth(compact: Boolean) = if (compact) 28.dp else 34.dp

/**
 * The weekdays over a group's weeks, from the day the week starts on, or over [days] each its own,
 * as the hub's run from today.
 */
@Composable
fun GroupWeekdays(modifier: Modifier = Modifier, compact: Boolean = false, days: List<LocalDate>? = null) {
  val colors = LocalThemeColors.current
  val week = LocalDeviceSettings.current.device.week
  Row(modifier.clearAndSetSemantics {}) {
    Spacer(Modifier.width(facesWidth(compact)))
    repeat(7) { index ->
      val weekday = days?.get(index)?.weekday ?: ((week.start + index) % 7)
      Text(
        weekdayLetter(weekday),
        Modifier.weight(1f),
        style = PochicalTextStyles.caption2.copy(fontSize = 10.sp),
        color = weekdayColor(weekday, holiday = false, week, plain = colors.textQuaternary),
        textAlign = TextAlign.Center,
      )
    }
  }
}

/**
 * A week of a group's shifts (/design's WeekBlock): its dates across, then a row a member, their face
 * and each day's mark in their own shape. A day off is on its tile, a day everyone is off (みんな休み)
 * one band down its column, date and all, and the picked day framed the same way.
 */
@Composable
fun GroupWeek(
  days: List<LocalDate>,
  members: List<GroupMember>,
  groupId: String,
  today: LocalDate,
  modifier: Modifier = Modifier,
  /** The month the week is shown under; its other days are faded. */
  month: Int? = null,
  picked: LocalDate? = null,
  /** Picks a day, to show everyone's that day; none leaves days alone. */
  onPick: ((LocalDate) -> Unit)? = null,
  /** A face pressed, to show what that member's marks mean; none leaves faces alone. */
  onFace: ((GroupMember) -> Unit)? = null,
  /** The hub's card draws its rows tighter. */
  compact: Boolean = false,
  /** Today in the accent; not where it is always the first column. */
  marksToday: Boolean = true,
) {
  val colors = LocalThemeColors.current
  val week = LocalDeviceSettings.current.device.week
  val country = holidayCountry()
  val groupDays = rememberGroupDays(members, days.first(), days.last())
  val shifts = groupDays.shifts
  val together = groupDays.together.days.toSet()
  val dateHeight = if (compact) 24.dp else 26.dp
  val rowHeight = if (compact) 26.dp else 30.dp
  val meId = rememberMeId()
  val unentered = stringResource(R.string.day_unentered)
  val togetherWord = stringResource(R.string.together_day)
  Row(modifier) {
    Column(Modifier.width(facesWidth(compact)), horizontalAlignment = Alignment.CenterHorizontally) {
      Spacer(Modifier.height(dateHeight))
      for (member in members) {
        Box(
          Modifier.height(rowHeight)
            .then(if (onFace != null) Modifier.clickable(role = Role.Button) { onFace(member) } else Modifier)
            .clearAndSetSemantics { contentDescription = member.name },
          contentAlignment = Alignment.Center,
        ) {
          MemberAvatar(member.name, member.photoId, PhotoShelf.Group(groupId), if (compact) 20.dp else 24.dp, me = member.userId == meId)
        }
      }
    }
    for (day in days) {
      val isTogether = day in together
      Column(
        Modifier.weight(1f)
          .alpha(if (month == null || day.monthValue == month) 1f else 0.35f)
          .dayMarks(band = colors.accentContainer.takeIf { isTogether }, frame = colors.accentDefault.takeIf { day == picked }, inset = 3.dp)
          .then(if (onPick != null) Modifier.clickable(role = Role.Button) { onPick(day) } else Modifier)
          .clearAndSetSemantics {
            contentDescription =
              buildList {
                  add(day.monthDayText + if (isTogether) "、$togetherWord" else "")
                  members.forEachIndexed { index, member -> add("${member.name}：${shifts[index][day]?.pattern?.name ?: unentered}") }
                }
                .joinToString("、")
            if (onPick != null) selected = day == picked
          },
        horizontalAlignment = Alignment.CenterHorizontally,
      ) {
        val isToday = marksToday && day == today
        Box(Modifier.height(dateHeight), contentAlignment = Alignment.Center) {
          Text(
            // A month's 1st says its month, where the week runs into it.
            if (day.dayOfMonth == 1 && day != days.first()) day.slashText else day.dayOfMonth.toString(),
            style = PochicalTextStyles.caption2,
            fontWeight = if (isToday) FontWeight.ExtraBold else FontWeight.SemiBold,
            color = if (isToday) colors.accentDefault else dateColor(day, week, country),
          )
        }
        members.forEachIndexed { index, member ->
          val shift = shifts[index][day]
          val tiled = shift?.pattern?.countsAsOff == true && !isTogether
          Box(
            Modifier.fillMaxWidth().height(rowHeight).dayMarks(band = colors.accentContainer.takeIf { tiled }, frame = null, inset = 3.dp, vertical = 2.dp),
            contentAlignment = Alignment.Center,
          ) {
            if (shift != null) {
              MemberMark(member, shift, 18.dp)
            } else {
              Box(Modifier.size(6.dp).background(colors.fillSecondary, CircleShape))
            }
          }
        }
      }
    }
  }
}

/**
 * A day's band (みんな休み) behind it and its frame (picked) over it, each set in [inset] from its
 * sides and rounded, so neither moves what it holds.
 */
fun Modifier.dayMarks(band: Color?, frame: Color?, inset: Dp, vertical: Dp = 0.dp): Modifier =
  if (band == null && frame == null) this
  else
    drawWithContent {
      val corner = CornerRadius(Radius.sm.toPx())
      val topLeft = Offset(inset.toPx(), vertical.toPx())
      val area = Size(size.width - inset.toPx() * 2, size.height - vertical.toPx() * 2)
      if (band != null) drawRoundRect(band, topLeft, area, corner)
      drawContent()
      if (frame != null) {
        val stroke = 1.5.dp.toPx()
        drawRoundRect(
          frame,
          topLeft + Offset(stroke / 2, stroke / 2),
          Size(area.width - stroke, area.height - stroke),
          corner,
          style = Stroke(stroke),
        )
      }
    }

/** Sundays, Saturdays and holidays in their colors as the calendar has them. */
@Composable
private fun dateColor(day: LocalDate, week: Week, country: String): Color =
  weekdayColor(day.weekday, holiday = day.holidayName(country) != null, week, plain = LocalThemeColors.current.textPrimary)

/**
 * The next seven days for everyone in the group on the hub's card (/design's MemberTable, compact),
 * then the next day everyone is off; pressed, the group's month ([onOpen]), on that day for the
 * latter.
 */
@Composable
fun MemberWeek(members: List<GroupMember>, groupId: String, today: LocalDate, onOpen: ((LocalDate?) -> Unit)?, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val days = upcomingWeek(today)
  val shape = RoundedCornerShape(Radius.xxl)
  Column(
    modifier.border(1.dp, colors.separator, shape).padding(start = 4.dp, top = 8.dp, end = 8.dp, bottom = 12.dp),
    verticalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    Column(
      if (onOpen != null) Modifier.clickable(onClickLabel = stringResource(R.string.group_shifts_month)) { onOpen(null) } else Modifier,
      verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      GroupWeekdays(compact = true, days = days)
      GroupWeek(days, members, groupId, today, compact = true, marksToday = false)
    }
    HorizontalDivider(color = colors.separator)
    val ahead = rememberGroupDays(members, today, today.plusDays(NEXT_TOGETHER_DAYS - 1)).together
    val next = ahead.days.firstOrNull()
    Row(
      Modifier.fillMaxWidth()
        .then(if (next != null && onOpen != null) Modifier.clickable { onOpen(next) } else Modifier)
        .padding(start = 12.dp, top = 10.dp, end = 4.dp, bottom = 2.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(stringResource(R.string.next_together), Modifier.weight(1f), style = PochicalTextStyles.footnote, color = colors.textSecondary)
      Text(
        // Days someone has not entered may yet be one, so it does not say there are none.
        next?.let { "${it.fullText}・${fromToday(it, today)}" } ?: stringResource(if (ahead.unsure) R.string.together_unsure else R.string.none),
        style = PochicalTextStyles.footnote,
        fontWeight = FontWeight.SemiBold,
        color = if (next == null) colors.textTertiary else colors.accentDefault,
      )
      if (next != null && onOpen != null) Icon(painterResource(R.drawable.ic_chevron_right), null, Modifier.size(16.dp), tint = colors.textQuaternary)
    }
  }
}

/** How far a day is from today, the way people say it: 今日, 明日, 3日後. */
@Composable
private fun fromToday(day: LocalDate, today: LocalDate): String =
  when (val count = ChronoUnit.DAYS.between(today, day)) {
    0L -> stringResource(R.string.today)
    1L -> stringResource(R.string.tomorrow)
    else -> stringResource(R.string.days_later, count.toInt())
  }
