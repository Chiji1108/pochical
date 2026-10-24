package app.pochical.groups

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import app.pochical.LocalDeviceSettings
import app.pochical.Look
import app.pochical.MarkStyle
import app.pochical.ShiftMark
import app.pochical.calendar.Pattern
import app.pochical.calendar.TimeChange
import app.pochical.calendar.pattern
import app.pochical.calendar.timeChange
import app.pochical.kit.GroupMember
import app.pochical.kit.Together
import app.pochical.kit.groupMembers
import app.pochical.kit.together
import java.time.LocalDate

// What a group's screens draw of each member's days, as iOS's GroupMember and MemberCalendar are read
// there: a day's pattern and moved hours, in the member's own shape.

/** A member's day as the group's screens draw it: its pattern, and how its hours moved. */
data class MemberShift(val pattern: Pattern, val change: TimeChange?)

/** Each day from [from] through [through] that shows a shift for the member. */
fun GroupMember.shifts(from: LocalDate, through: LocalDate): Map<LocalDate, MemberShift> =
  calendar.shown(from, through).mapNotNull { (day, shown) ->
    val pattern = calendar.pattern(shown.shift)?.pattern ?: return@mapNotNull null
    day to MemberShift(pattern, timeChange(shown.start, shown.end, pattern.time))
  }.toMap()

/**
 * The days from [from] through [through] everyone is off, and whether another may yet be (みんな休み,
 * spec/shift-patterns.md): none with only one member, as one person's days off are not shared ones.
 */
fun List<GroupMember>.together(from: LocalDate, through: LocalDate): Together =
  if (size > 1) together(map { it.offDays(from, through) }, from, through) else Together(emptyList(), unsure = false)

/**
 * The look a member's marks are drawn in: their shape and fill, the rest the viewer's own
 * (spec/sync-protocol.md, Profile); the app's own default, filled icons, before theirs is known.
 */
fun Look.drawing(member: GroupMember): Look {
  val style = MarkStyle.entries.firstOrNull { it.wire == member.markStyle }
  return copy(style = style ?: MarkStyle.Icon, fill = if (style == null) true else member.markFill)
}

/** The style as the wire names it (proto MarkLook). */
private val MarkStyle.wire: String
  get() =
    when (this) {
      MarkStyle.Icon -> "icon"
      MarkStyle.Emoji -> "emoji"
      MarkStyle.Badge -> "badge"
    }

/** A member's pattern's mark, in their own shape and the viewer's colors. */
@Composable
fun MemberMark(member: GroupMember, shift: MemberShift, size: Dp, modifier: Modifier = Modifier) {
  val pattern = shift.pattern
  ShiftMark(
    pattern.icon,
    pattern.emoji,
    pattern.symbol,
    pattern.color,
    size,
    modifier,
    change = shift.change,
    look = LocalDeviceSettings.current.device.look.drawing(member),
  )
}

/**
 * Everyone in the group with their days from [from] through [through], as the group's socket last
 * said; null until first read.
 */
@Composable
fun rememberGroupMembers(groupId: String, from: LocalDate, through: LocalDate): List<GroupMember>? {
  val values = LocalValues.current
  return remember(values, groupId, from, through) { values.groupMembers(groupId, from, through) }
    .collectAsState(null)
    .value
}
