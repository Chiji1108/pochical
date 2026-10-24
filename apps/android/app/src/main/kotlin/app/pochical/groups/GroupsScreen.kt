package app.pochical.groups

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pochical.LocalAccount
import app.pochical.R
import app.pochical.RootPage
import app.pochical.SectionHeader
import app.pochical.calendar.rememberToday
import app.pochical.design.Metrics
import app.pochical.design.Radius
import app.pochical.kit.AccountState
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.GroupRow
import app.pochical.kit.PhotoShelf
import java.time.LocalDate

/** What the グループ tab's buttons open. */
class GroupsActions(
  /** グループを作る. */
  val onNew: () -> Unit,
  /** QRコードで参加. */
  val onScan: () -> Unit,
  /** みんなのシフト of a group, on a day when one is given. */
  val onShifts: (String, LocalDate?) -> Unit,
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

/** No group yet: what sharing shifts is for, and the way to start (/design's NoGroups). */
@Composable
private fun NoGroups(actions: GroupsActions) {
  Column(
    Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
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

/**
 * The groups down the start edge, as the messaging apps' server rails: a mark each, the open one
 * ringed and flagged at the edge, then the way to start one (/design's GroupRail).
 */
@Composable
private fun GroupRail(groups: List<GroupRow>, openId: String, onOpen: (String) -> Unit, actions: GroupsActions) {
  val colors = MaterialTheme.colorScheme
  Column(
    Modifier.width(RAIL_WIDTH)
      .fillMaxHeight()
      .background(colors.surfaceContainer, RoundedCornerShape(topEnd = Radius.xl))
      .safeDrawingPadding()
      .verticalScroll(rememberScrollState())
      .padding(vertical = 12.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    groups.forEach { group ->
      val isOpen = group.id == openId
      val shape = RoundedCornerShape(if (isOpen) Radius.md else Radius.lg)
      Box(
        Modifier.fillMaxWidth().height(48.dp).clickable { onOpen(group.id) }.semantics {
          contentDescription = group.name
          selected = isOpen
        },
        contentAlignment = Alignment.Center,
      ) {
        if (isOpen) {
          Box(
            Modifier.align(Alignment.CenterStart)
              .size(4.dp, 32.dp)
              .background(colors.secondary, RoundedCornerShape(topEnd = Radius.xs, bottomEnd = Radius.xs))
          )
        }
        GroupMarkView(
          group.mark,
          44.dp,
          Modifier.clip(shape)
            .background(if (isOpen) colors.primaryContainer else colors.surfaceContainerHigh, shape)
            .then(if (isOpen) Modifier.border(2.dp, colors.secondary, shape) else Modifier),
          shelf = PhotoShelf.Group(group.id),
        )
      }
    }
    Box(Modifier.size(28.dp, 2.dp).background(colors.outlineVariant, CircleShape))
    IconButton(onClick = actions.onNew, Modifier.background(colors.surfaceContainerHigh, CircleShape)) {
      Icon(painterResource(R.drawable.ic_add), stringResource(R.string.new_group), tint = colors.secondary)
    }
    IconButton(onClick = actions.onScan, Modifier.background(colors.surfaceContainerHigh, CircleShape)) {
      Icon(painterResource(R.drawable.ic_qr_code_scanner), stringResource(R.string.scan), tint = colors.secondary)
    }
  }
}

/** The open group: its mark and name over its page, its buttons in the bar, and everyone's next days. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GroupHub(group: GroupRow, actions: GroupsActions) {
  val today = rememberToday()
  val members = rememberGroupMembers(group.id, today, today.plusDays(NEXT_TOGETHER_DAYS - 1))
  Scaffold(
    topBar = {
      TopAppBar(
        title = {
          Row(verticalAlignment = Alignment.CenterVertically) {
            GroupMarkBadge(group.mark, Modifier.padding(end = 8.dp), size = 26.dp, shelf = PhotoShelf.Group(group.id))
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
