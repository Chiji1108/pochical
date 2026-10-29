package app.pochical.groups

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pochical.LocalAccount
import app.pochical.LocalNotifyingUnread
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.RootPage
import app.pochical.SectionHeader
import app.pochical.UnreadBadge
import app.pochical.calendar.holidayCountry
import app.pochical.calendar.holidayName
import app.pochical.calendar.rememberToday
import app.pochical.calendar.weekday
import app.pochical.chat.ChatList
import app.pochical.design.Metrics
import app.pochical.design.Radius
import app.pochical.kit.AccountState
import app.pochical.kit.GroupMember
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.GroupRow
import app.pochical.kit.OwnCalendar
import app.pochical.kit.OwnDay
import app.pochical.kit.PatternRow
import app.pochical.kit.PhotoShelf
import app.pochical.kit.readyCopies
import java.time.LocalDate

/** What the グループ tab's buttons open. */
class GroupsActions(
  /** グループを作る. */
  val onNew: () -> Unit,
  /** QRコードで参加. */
  val onScan: () -> Unit,
  /** みんなのシフト of a group, on a day when one is given. */
  val onShifts: (String, LocalDate?) -> Unit,
  /** One of a group's chats, by its thread. */
  val onChat: (String, String) -> Unit = { _, _ -> },
  /** The group's own buttons in the bar, over its page; none for a group not shown. */
  val groupActions: @Composable (GroupRow) -> Unit = {},
)

/**
 * The グループ tab (/design's DesignGroup): with no group yet, what groups are for and a way to
 * start one; else the groups down the side, as /design's rail, and the one open beside them, its
 * socket held while it shows (spec/sync-protocol.md, Sockets).
 */
@Composable
fun GroupsScreen(openId: String?, onOpen: (String) -> Unit, actions: GroupsActions) {
  val values = LocalValues.current
  val groups by remember(values) { values.groups() }.collectAsState(null)
  val list = groups ?: return
  val open = openGroup(openId, list)
  if (open == null) {
    NoGroups(actions)
    return
  }
  HoldSocket(open.id)
  Row(Modifier.fillMaxSize()) {
    GroupRail(list, open.id, onOpen, actions)
    GroupHub(open, actions)
  }
}

/** The group open in グループ: the one picked, the first until one is or once the one picked is gone. */
fun openGroup(openId: String?, groups: List<GroupRow>): GroupRow? = groups.firstOrNull { it.id == openId } ?: groups.firstOrNull()

/** Holds the group's socket while this shows, so what the group sends reaches it at once. */
@Composable
fun HoldSocket(groupId: String) {
  val account = LocalAccount.current
  DisposableEffect(account, groupId) {
    val hold = account.hold(groupId)
    onDispose { hold.release() }
  }
}

/**
 * No group yet (/design's NoGroups): a sample of 一覧, the table a group is mostly read in, filling the
 * screen and fading out under what sharing shifts is for and the buttons, グループを作る and QRコードで
 * 参加, at the foot. Text too large to leave the sample room scrolls the words alone.
 */
@Composable
private fun NoGroups(actions: GroupsActions) {
  Column(Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal = 20.dp)) {
    SampleDays(Modifier.weight(1f).fillMaxWidth())
    Column(
      Modifier.verticalScroll(rememberScrollState()).padding(top = 12.dp, bottom = 16.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Text(
        stringResource(R.string.groups_none_title),
        Modifier.semantics { heading() },
        style = MaterialTheme.typography.headlineSmall,
        textAlign = TextAlign.Center,
      )
      Text(
        stringResource(R.string.groups_none_body),
        Modifier.padding(bottom = 12.dp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.bodyMedium,
        textAlign = TextAlign.Center,
      )
      Button(onClick = actions.onNew, Modifier.fillMaxWidth().heightIn(min = Metrics.control)) {
        Icon(painterResource(R.drawable.ic_add), contentDescription = null)
        Text(stringResource(R.string.new_group), Modifier.padding(start = 8.dp))
      }
      OutlinedButton(onClick = actions.onScan, Modifier.fillMaxWidth().heightIn(min = Metrics.control)) {
        Icon(painterResource(R.drawable.ic_qr_code_scanner), contentDescription = null)
        Text(stringResource(R.string.scan), Modifier.padding(start = 8.dp))
      }
    }
  }
}

/**
 * The sample's 一覧 from today, as much of it as there is room for, its lower part fading into the
 * ground; a picture only, nothing in it to press or read out.
 */
@Composable
private fun SampleDays(modifier: Modifier) {
  val today = rememberToday()
  val country = holidayCountry()
  val days = remember(today) { (0L until SAMPLE_DAYS).map { today.plusDays(it) } }
  val members = remember(days, country) { sampleMembers(days, country) }
  val group = remember(members, days) { groupDays(members, days.first(), days.last()) }
  Box(
    modifier
      .clipToBounds()
      .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
      .drawWithContent {
        drawContent()
        drawRect(Brush.verticalGradient(0.35f to Color.Black, 0.92f to Color.Transparent), blendMode = BlendMode.DstIn)
      }
      .clearAndSetSemantics {}
  ) {
    Column(Modifier.wrapContentHeight(Alignment.Top, unbounded = true)) {
      GroupDayHeader(members, SAMPLE_GROUP, meId = null, sideways = null, onFace = null)
      for (day in days) {
        GroupDayRow(
          day,
          members,
          group.shifts.map { it[day] },
          together = day in group.together.days,
          picked = false,
          today = today,
          country = country,
          sideways = null,
          onPick = {},
        )
      }
    }
  }
}

/**
 * The sample's people, as /design's and iOS's: a partner at the office, home on Wednesdays; a mother
 * part-time on Mondays, Wednesdays and Fridays, both off on weekends and holidays; a nurse whose
 * week, the same every week, has Saturday off too, so everyone is off one day.
 */
private fun sampleMembers(days: List<LocalDate>, country: String): List<GroupMember> {
  val off = samplePattern("off", "休み", "🌿", "leaf", 0, off = true)
  val office = samplePattern("office", "出勤", "💼", "briefcase", 9)
  val home = samplePattern("home", "在宅", "🏠", "house", 10)
  val part = samplePattern("part", "パート", "🛒", "shoppingBag", 2)
  // Sunday on: 明け, 休み, 日勤, 日勤, 夜勤, 明け, 休み.
  val nurseWeek = listOf("after", "off", "day", "day", "night", "after", "off")
  val rests = { day: LocalDate -> day.weekday == 0 || day.weekday == 6 || day.holidayName(country) != null }
  fun member(id: String, name: String, face: Int, patterns: List<PatternRow>, shift: (LocalDate) -> String) =
    GroupMember(
      userId = id,
      name = name,
      photoId = "$SAMPLE_PHOTO$face",
      markStyle = "",
      markFill = true,
      calendar = OwnCalendar(patterns, days.associateWith { OwnDay(shift = shift(it)) }, emptyList()),
    )
  return listOf(
    member("yuki", "ゆうき", 1005, listOf(office, home, off)) {
      if (rests(it)) off.id else if (it.weekday == 3) home.id else office.id
    },
    member("mother", "お母さん", 429, listOf(part, off)) {
      if (it.weekday in listOf(1, 3, 5) && it.holidayName(country) == null) part.id else off.id
    },
    member("misaki", "みさき", 823, readyCopies(listOf("day", "night", "after", "off"))) { nurseWeek[it.weekday] },
  )
}

private fun samplePattern(id: String, name: String, emoji: String, icon: String, color: Int, off: Boolean = false) =
  PatternRow(id, name, emoji, name.take(1), icon, color, start = null, end = null, countsAsOff = off, nextDay = null, archived = false)

/** The sample's days, from today: a month, more than even a tall screen shows, so it always runs on into its fade. */
private const val SAMPLE_DAYS = 31L

/** The sample's made-up group, whose photos are none of the device's. */
private const val SAMPLE_GROUP = "sample"

/**
 * The groups down the start edge, as the messaging apps' server rails (/design's GroupRail): a mark
 * each, the open one ringed and flagged at the edge, then the ways to start or join one. Its panel
 * starts beside the bar's heading and runs down to the navigation bar, which, docked rather than
 * floating as /design's tab bar is, it ends at rather than fading out under.
 */
@Composable
private fun GroupRail(groups: List<GroupRow>, openId: String, onOpen: (String) -> Unit, actions: GroupsActions) {
  val colors = LocalThemeColors.current
  Column(
    Modifier.width(RAIL_WIDTH)
      .fillMaxHeight()
      .statusBarsPadding()
      .background(colors.fillQuaternary, RoundedCornerShape(topEnd = Radius.xl))
      .safeDrawingPadding()
      .verticalScroll(rememberScrollState())
      .padding(vertical = 12.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    // Each group's chats' unread lines that notify, as the グループ tab adds them up.
    val unread = LocalNotifyingUnread.current
    groups.forEach { group ->
      val isOpen = group.id == openId
      val count = unread[group.id] ?: 0
      val label = if (count > 0) stringResource(R.string.group_unread_label, group.name, count) else group.name
      Box(
        Modifier.fillMaxWidth().height(48.dp).clickable { onOpen(group.id) }.semantics {
          contentDescription = label
          selected = isOpen
        },
        contentAlignment = Alignment.Center,
      ) {
        // The flag at the edge grows by the open group.
        val flag by animateDpAsState(if (isOpen) 32.dp else 0.dp, label = "flag")
        Box(
          Modifier.align(Alignment.CenterStart)
            .size(4.dp, flag)
            .background(colors.accentDefault, RoundedCornerShape(topEnd = Radius.xs, bottomEnd = Radius.xs))
        )
        RailMark(group, isOpen)
        if (count > 0) {
          // Ringed in the rail's ground, so it stands clear of the mark.
          UnreadBadge(
            count,
            Modifier.align(Alignment.BottomEnd).padding(end = 3.dp).background(colors.fillQuaternary, CircleShape).padding(2.dp),
          )
        }
      }
    }
    Box(Modifier.size(28.dp, 2.dp).background(colors.borderDefault, CircleShape))
    RailAction(R.drawable.ic_add, stringResource(R.string.new_group), actions.onNew)
    RailAction(R.drawable.ic_qr_code_scanner, stringResource(R.string.scan), actions.onScan)
  }
}

/**
 * A group's mark on the rail, on the card's ground; the open one on the accent's tint, its corners
 * drawn in and ringed in the accent inside its edge, a thin gap of the card's ground keeping the
 * ring clear of a photo's own colors.
 */
@Composable
private fun RailMark(group: GroupRow, isOpen: Boolean) {
  val colors = LocalThemeColors.current
  val shape = RoundedCornerShape(if (isOpen) Radius.md else Radius.lg)
  // The outer border is drawn last, so the accent's ring lies over the gap's outer half.
  val ring = if (isOpen) Modifier.border(2.dp, colors.accentDefault, shape).border(4.dp, colors.backgroundCard, shape) else Modifier
  GroupMarkView(
    group.mark,
    44.dp,
    Modifier.clip(shape).background(if (isOpen) colors.accentContainer else colors.backgroundCard, shape).then(ring),
    shelf = PhotoShelf.Group(group.id),
  )
}

/** One of the rail's ways to start or join a group: its symbol in the accent on the card's ground. */
@Composable
private fun RailAction(icon: Int, label: String, onClick: () -> Unit) {
  val colors = LocalThemeColors.current
  FilledIconButton(
    onClick = onClick,
    colors = IconButtonDefaults.filledIconButtonColors(containerColor = colors.backgroundCard, contentColor = colors.accentDefault),
  ) {
    Icon(painterResource(icon), label)
  }
}

/** The open group: its mark and name over its page, its buttons in the bar, and everyone's next days. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GroupHub(group: GroupRow, actions: GroupsActions) {
  val today = rememberToday()
  val members = rememberGroupMembers(group.id, today, today.plusDays(NEXT_TOGETHER_DAYS - 1))
  val me = rememberMeId()
  Scaffold(
    topBar = {
      TopAppBar(
        title = {
          Row(verticalAlignment = Alignment.CenterVertically) {
            GroupMarkBadge(
              group.mark,
              Modifier.padding(end = 8.dp),
              size = 26.dp,
              shelf = PhotoShelf.Group(group.id),
              ground = LocalThemeColors.current.fillQuaternary,
            )
            Text(group.name, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
          }
        },
        actions = { actions.groupActions(group) },
      )
    }
  ) { padding ->
    LazyColumn(contentPadding = padding) {
      item {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Box(Modifier.weight(1f)) { SectionHeader(stringResource(R.string.group_shifts_heading)) }
          TextButton(onClick = { actions.onShifts(group.id, null) }, Modifier.padding(end = 8.dp)) {
            Text(stringResource(R.string.group_shifts_month))
            Icon(painterResource(R.drawable.ic_chevron_right), contentDescription = null, Modifier.size(18.dp))
          }
        }
      }
      if (members != null) {
        item { MemberWeek(members, group.id, today, onOpen = { actions.onShifts(group.id, it) }, Modifier.padding(horizontal = 16.dp)) }
      }
      val me = me
      if (me != null) {
        item { SectionHeader(stringResource(R.string.chat_heading)) }
        item { ChatList(group.id, group.name, me, onOpen = { actions.onChat(group.id, it) }) }
      }
      item { Spacer(Modifier.height(24.dp)) }
    }
  }
}

/** The id of the user the device is signed in as, null while it is not. */
@Composable
fun rememberMeId(): String? {
  val state by LocalAccount.current.state.collectAsState()
  return (state as? AccountState.SignedIn)?.userId ?: (state as? AccountState.Changing)?.before?.userId
}

/** Someone in the group, by their face and their name in it. */
@Composable
fun MemberRow(member: GroupMemberRow, groupId: String, modifier: Modifier = Modifier, me: Boolean = false) {
  ListItem(
    headlineContent = {
      Text(
        if (me) stringResource(R.string.member_me, member.displayName) else member.displayName,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    },
    leadingContent = { MemberAvatar(member.displayName, member.photoId, PhotoShelf.Group(groupId), 28.dp, me = me) },
    modifier = modifier,
  )
}

/** The open group's buttons in the bar over its page: メンバーを招待 and グループの設定. */
@Composable
fun GroupButtons(groupId: String, open: (RootPage) -> Unit) {
  IconButton(onClick = { open(RootPage.GroupInvite(groupId)) }) {
    Icon(painterResource(R.drawable.ic_person_add), stringResource(R.string.invite))
  }
  IconButton(onClick = { open(RootPage.GroupSettings(groupId)) }) {
    Icon(painterResource(R.drawable.ic_tune), stringResource(R.string.group_settings))
  }
}

/** The rail's width, which the page beside it starts after. */
private val RAIL_WIDTH = 60.dp
