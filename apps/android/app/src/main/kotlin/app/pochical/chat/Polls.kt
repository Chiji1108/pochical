package app.pochical.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pochical.ListSheet
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.calendar.fullText
import app.pochical.calendar.holidayCountry
import app.pochical.calendar.holidayName
import app.pochical.calendar.slashText
import app.pochical.calendar.weekday
import app.pochical.calendar.weekdayColor
import app.pochical.calendar.weekdayName
import app.pochical.design.Radius
import app.pochical.groups.MemberAvatar
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.PhotoShelf
import app.pochical.kit.voters
import app.pochical.v1.ChatPoll
import java.time.LocalDate

// Days put to the vote in a group chat (spec/chat.md, Polls; /design's PollCard), as iOS's Polls.swift:
// the card everyone votes on, and the sheet it is settled with.

/** Whose poll it is, and what the reader can do with it. */
data class PollLook(
  val poll: ChatPoll,
  /** 日にちを決める at its foot until settled, 決め直す in its menu: its writer, or anyone once they left. */
  val canDecide: Boolean,
  /** Still on its way: nothing to vote on yet. */
  val waiting: Boolean,
)

/**
 * The poll as a line's part: 日にちを決める for whoever may settle it. Its days, who can come on each
 * and 行ける are gone through one by one in the card after its line (spec/chat.md, Screen readers),
 * a poll holding more days than an element holds actions.
 */
data class PollPart(val look: PollLook) : LinePart {
  @Composable
  override fun actions(line: PartLine): List<CustomAccessibilityAction> {
    val seq = line.seq ?: return emptyList()
    val decide = stringResource(R.string.chat_poll_decide)
    val open = look.poll.decided.isEmpty()
    return listOfNotNull(CustomAccessibilityAction(decide) { line.handlers.decide(seq); true }.takeIf { open && look.canDecide && !look.waiting })
  }
}

/**
 * Days put to the vote, as LINE's 日程調整, in a card: its head (日にちの投票, and N人が投票), then a
 * row a day: the date in the week's colors, みんな休み under it when everyone's shifts are off, the
 * faces of who can come, and 行ける, which toggles the reader's vote. Its writer settles it with
 * 日にちを決める; the chosen day is marked 決定 on the accent's container, the rest fade.
 */
@Composable
fun PollCard(look: PollLook, handlers: MessageHandlers, seq: Long?, live: Boolean = true) {
  val colors = LocalThemeColors.current
  val poll = look.poll
  val days = remember(poll.daysList) { poll.daysList.map(LocalDate::parse) }
  val decided = poll.decided.takeIf { it.isNotEmpty() }?.let(LocalDate::parse)
  val voterCount = poll.votesList.flatMap { it.userIdsList }.toSet().size
  // みんな休み by everyone's shifts on the poll's days.
  val together = handlers.together(days.first(), days.last())
  val shape = RoundedCornerShape(Radius.lg)
  Column(
    Modifier.widthIn(max = CARD_WIDTH)
      .alpha(if (look.waiting) WAITING else 1f)
      .background(MaterialTheme.colorScheme.surfaceContainerLow, shape)
      .border(1.dp, colors.borderDefault, shape)
      .litWhenGoneTo(handlers.lit?.takeIf { it.seq == seq && seq != null }, shape, handlers.reducedMotion)
  ) {
    Row(Modifier.padding(12.dp).clearAndSetSemantics {}, verticalAlignment = Alignment.CenterVertically) {
      Icon(painterResource(R.drawable.ic_event_available), contentDescription = null, Modifier.size(20.dp), tint = colors.accentDefault)
      Column(Modifier.padding(start = 8.dp)) {
        Text(stringResource(R.string.chat_poll_title), style = MaterialTheme.typography.titleSmall)
        Text(
          decided?.let { stringResource(R.string.chat_poll_decided_on, it.fullText) } ?: stringResource(R.string.chat_poll_voters, voterCount),
          style = MaterialTheme.typography.labelSmall,
          color = colors.textTertiary,
        )
      }
    }
    HorizontalDivider(color = colors.separator)
    Column(Modifier.padding(vertical = 4.dp)) {
      for (day in days) PollRow(day, poll, decided, day in together, look.waiting, handlers, seq, live)
    }
    if (look.canDecide && decided == null && !look.waiting && seq != null) {
      HorizontalDivider(color = colors.separator)
      TextButton(onClick = { handlers.decide(seq) }, Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.chat_poll_decide), fontWeight = FontWeight.SemiBold)
      }
    }
  }
}

@Composable
private fun PollRow(day: LocalDate, poll: ChatPoll, decided: LocalDate?, together: Boolean, waiting: Boolean, handlers: MessageHandlers, seq: Long?, live: Boolean) {
  val colors = LocalThemeColors.current
  val week = LocalDeviceSettings.current.device.week
  val country = remember { holidayCountry() }
  val people = voters(poll, day.toString())
  val mine = handlers.me in people
  val isDecided = day == decided
  val whoCome = stringResource(R.string.chat_poll_who, day.fullText)
  val names = people.joinToString("、") { handlers.nameOf(it) }
  Row(
    Modifier.fillMaxWidth()
      .semantics(mergeDescendants = true) {}
      .background(if (isDecided) colors.accentContainer else androidx.compose.ui.graphics.Color.Transparent)
      .alpha(if (decided != null && !isDecided) FADED else 1f)
      .heightIn(min = 48.dp)
      .padding(horizontal = 12.dp, vertical = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    Column(Modifier.width(64.dp).semantics(mergeDescendants = true) { contentDescription = day.fullText }) {
      Row(verticalAlignment = Alignment.Bottom) {
        val tone = weekdayColor(day.weekday, holiday = day.holidayName(country) != null, week, plain = colors.textPrimary)
        Text(day.slashText, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = tone)
        Text(weekdayName(day.weekday, english = false), style = MaterialTheme.typography.labelSmall, color = tone, modifier = Modifier.padding(start = 2.dp))
      }
      if (together) Text(stringResource(R.string.chat_poll_together), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = colors.accentDefault)
    }
    // Who can come: three faces, or two and +N; a tap lists them all by name.
    Row(
      Modifier.weight(1f)
        .heightIn(min = 32.dp)
        .clickable(enabled = live && people.isNotEmpty(), onClickLabel = whoCome) { handlers.voters(day, people) }
        .clearAndSetSemantics { if (people.isNotEmpty()) contentDescription = "$whoCome：$names" },
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy((-4).dp),
    ) {
      val shown = if (people.size > MOST_FACES) people.take(MOST_FACES - 1) else people
      for (id in shown) {
        val writer = handlers.writers[id]
        MemberAvatar(handlers.nameOf(id), writer?.photoId.orEmpty(), writer?.let { PhotoShelf.Group(it.groupId) }, FACE_SIZE)
      }
      if (people.isNotEmpty()) {
        Text(
          if (people.size > shown.size) "+${people.size - shown.size}" else stringResource(R.string.chat_poll_people, people.size),
          Modifier.padding(start = 8.dp),
          style = MaterialTheme.typography.labelSmall,
          color = colors.textTertiary,
        )
      }
    }
    when {
      isDecided ->
        Row(verticalAlignment = Alignment.CenterVertically) {
          Icon(painterResource(R.drawable.ic_check), contentDescription = null, Modifier.size(16.dp), tint = colors.accentDefault)
          Text(stringResource(R.string.chat_poll_chosen), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = colors.accentDefault)
        }
      decided == null && seq != null ->
        FilterChip(
          selected = mine,
          onClick = { handlers.vote(seq, day.toString(), !mine) },
          label = { Text(stringResource(R.string.chat_poll_can_come)) },
          enabled = !waiting,
          leadingIcon = if (mine) ({ Icon(painterResource(R.drawable.ic_check), contentDescription = null, Modifier.size(FilterChipDefaults.IconSize)) }) else null,
        )
    }
  }
}

/**
 * 日にちを決める, or 決め直す on a settled poll: its days with how many can come; ✓ settles it on the
 * day picked, waiting while that is the day already chosen, as it would change nothing.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DecideSheet(poll: ChatPoll, onDismiss: () -> Unit, onDecide: (LocalDate) -> Unit) {
  val decided = poll.decided.takeIf { it.isNotEmpty() }
  var picked by rememberSaveable { mutableStateOf(decided) }
  // Through the sheets' one piece, so a poll's every day is in reach.
  ListSheet(onDismiss) {
    item {
      Row(Modifier.fillMaxWidth().padding(start = 24.dp, end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
          stringResource(if (decided == null) R.string.chat_poll_decide else R.string.chat_poll_redecide),
          Modifier.weight(1f).semantics { heading() },
          style = MaterialTheme.typography.titleLarge,
        )
        TextButton(onClick = { picked?.let { onDecide(LocalDate.parse(it)) } }, enabled = picked != null && picked != decided) {
          Text(stringResource(R.string.chat_poll_settle))
        }
      }
    }
    items(poll.daysList, key = { it }) { day ->
      val date = LocalDate.parse(day)
      val count = voters(poll, day).size
      // One choice to a screen reader: its day, how many can come, and whether it is picked.
      Row(
        Modifier.fillMaxWidth()
          .selectable(selected = picked == day, role = Role.RadioButton) { picked = day }
          .padding(horizontal = 16.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        RadioButton(selected = picked == day, onClick = null)
        Text(date.fullText, Modifier.padding(start = 12.dp).weight(1f), style = MaterialTheme.typography.bodyLarge)
        Text(stringResource(R.string.chat_poll_people, count), style = MaterialTheme.typography.bodyMedium, color = LocalThemeColors.current.textSecondary)
      }
    }
  }
}

/** Who can come on a day, by name, in the order they said so: a tap on its faces. */
@Composable
fun VotersSheet(day: LocalDate, people: List<String>, writers: Map<String, GroupMemberRow>, nameOf: (String) -> String, onDismiss: () -> Unit) {
  MemberSheet(
    stringResource(R.string.chat_poll_who, day.fullText),
    people.map { id ->
      val writer = writers[id]
      SheetMember(id, nameOf(id), writer?.photoId.orEmpty(), writer?.let { PhotoShelf.Group(it.groupId) })
    },
    onDismiss,
  )
}

/** As wide as a card can be where the row has room. */
private val CARD_WIDTH = 264.dp
private val FACE_SIZE = 22.dp
private const val MOST_FACES = 3
private const val FADED = 0.45f
private const val WAITING = 0.6f
