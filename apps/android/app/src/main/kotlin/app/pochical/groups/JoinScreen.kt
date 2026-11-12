package app.pochical.groups

import android.content.res.Resources
import android.graphics.BitmapFactory
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pochical.Headline
import app.pochical.ListSheet
import app.pochical.MarkFrame
import app.pochical.MarkFrameSize
import app.pochical.R
import app.pochical.ReviewPrompt
import app.pochical.balanced
import app.pochical.design.GROUP_MAX_MEMBERS
import app.pochical.design.Metrics
import app.pochical.calendar.rememberToday
import app.pochical.kit.InviteDetails
import app.pochical.kit.InviteFailure
import app.pochical.kit.JoinAsk
import app.pochical.kit.PhotoShelf
import app.pochical.kit.fitsPersonName
import app.pochical.people.usualProfile
import app.pochical.rowColors
import app.pochical.segmentShapes
import java.time.ZoneId

/**
 * 参加の画面 (/design's JoinScreen), opened by an invitation's link or its QR code: the group, its
 * mark and name, and who is in it; then how the person will appear in it, and at the foot what
 * joining shares over 参加する. A screen of its own, as LINE's invitations are; only × turns it
 * down. Joined, the group opens ([onGroup]); an invitation to a group the person is in already opens
 * it at once, saying so, however it was opened.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JoinScreen(code: String, onClose: () -> Unit, onGroup: (String) -> Unit) {
  val calls = LocalGroupCalls.current
  val values = LocalValues.current
  val resources = LocalResources.current
  val context = LocalContext.current
  val usualName = usualProfile()?.name.orEmpty()
  var details by remember { mutableStateOf<InviteDetails?>(null) }
  var loadError by remember { mutableStateOf<InviteFailure.Reason?>(null) }
  var loads by remember { mutableStateOf(0) }
  // Opened again while this invitation's 参加する is under way: as it was asked.
  val profile = rememberJoinProfile(remember { calls.joining.underWay.value?.takeIf { it.asked.code == code }?.let { JoinProfile.asked(it.asked.displayName, it) } })
  var joinError by remember { mutableStateOf<InviteFailure.Reason?>(null) }
  var showingMembers by remember { mutableStateOf(false) }
  val myName = profile.name(usualName)

  LaunchedEffect(code, loads) {
    try {
      val read = calls.invite(code)
      if (read.alreadyMember) {
        Toast.makeText(context, resources.getString(R.string.join_already_in, read.name), Toast.LENGTH_LONG).show()
        onGroup(read.groupId)
      } else {
        details = read
      }
    } catch (e: InviteFailure) {
      loadError = e.reason
    }
  }

  BackHandler(onBack = onClose)

  // This invitation's, as one join is under way at a time: another's leaves the button busy alone.
  val joining =
    waitingOn(calls.joining, mine = { it.code == code }, onIn = onGroup) { failure ->
      ReviewPrompt.troubled = true
      joinError = (failure as? InviteFailure)?.reason ?: InviteFailure.Reason.Failed
    }

  fun join() {
    // The name as the screen holds it now: 参加する may be tapped before the screen is drawn again
    // with the last letter (#1185). As the button is off for, one the server would refuse is not sent.
    val name = profile.name(usualName)
    if (details?.full != false || name.isEmpty() || !fitsPersonName(name)) return
    // The kit's from here, the face once the person is in the group, whether this screen still
    // waits or not; tapped again before the screen is drawn busy, the same call.
    calls.joining.begin(JoinAsk(code, name), profile.face, profile.goingOn(usualName))
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = {},
        navigationIcon = { IconButton(onClick = onClose) { Icon(painterResource(R.drawable.ic_close), stringResource(R.string.close)) } },
      )
    }
  ) { padding ->
    val shown = details
    when {
      shown != null ->
        Column(Modifier.padding(padding).fillMaxSize()) {
          Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            Invitation(shown, code) { showingMembers = true }
            JoinProfileSection(profile, shown.name, stringResource(R.string.join_going))
          }
          Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
          ) {
            // The group's end, said where joining is decided, as this device's clock shows it.
            if (shown.endsAtMs != 0L) {
              Text(
                groupEndsWords(LocalResources.current, shown.endsAtMs, rememberToday(), ZoneId.systemDefault()),
                style = MaterialTheme.typography.bodyMedium.balanced(),
                textAlign = TextAlign.Center,
              )
            }
            Text(
              if (shown.full) stringResource(R.string.join_full_body, GROUP_MAX_MEMBERS) else stringResource(R.string.join_shares),
              style = MaterialTheme.typography.bodySmall.balanced(),
              color = MaterialTheme.colorScheme.onSurfaceVariant,
              textAlign = TextAlign.Center,
            )
            val canJoin = !shown.full && myName.isNotEmpty() && fitsPersonName(myName)
            Button(onClick = ::join, shapes = ButtonDefaults.shapes(), enabled = canJoin && !joining, modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.control)) {
              if (joining) CircularProgressIndicator(Modifier.size(20.dp)) else Text(stringResource(R.string.join))
            }
          }
        }
      loadError != null -> Unusable(loadError!!, Modifier.padding(padding)) {
        loadError = null
        loads += 1
      }
      else -> PageLoading(padding)
    }
  }

  if (showingMembers) details?.let { MembersSheet(it, code) { showingMembers = false } }
  joinError?.let { reason ->
    AlertDialog(
      onDismissRequest = { joinError = null },
      title = { Text(stringResource(if (reason == InviteFailure.Reason.Full) R.string.join_full else R.string.join_failed)) },
      text = { Text(inviteMessage(reason)) },
      confirmButton = { TextButton(onClick = { joinError = null }) { Text(stringResource(R.string.ok)) } },
    )
  }
}

/** The group's mark with room around it, its name, and who is in it, which opens them all. */
@Composable
private fun Invitation(details: InviteDetails, code: String, onMembers: () -> Unit) {
  Column(
    Modifier.fillMaxWidth().padding(top = 32.dp, bottom = 12.dp, start = 16.dp, end = 16.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    MarkFrame { GroupMarkView(details.mark, MarkFrameSize, shelf = PhotoShelf.Invitation(code)) }
    Headline(details.name, Modifier.padding(bottom = 12.dp), large = true, textAlign = TextAlign.Center, maxLines = 3)
    Column(Modifier.clickable(onClick = onMembers).padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      Row(horizontalArrangement = Arrangement.spacedBy((-8).dp)) {
        details.members.take(5).forEach { member ->
          MemberAvatar(
            member.name,
            member.photoId,
            PhotoShelf.Invitation(code),
            32.dp,
            Modifier.border(2.dp, MaterialTheme.colorScheme.surface, CircleShape),
          )
        }
      }
      // Its chevron says the line opens who they are.
      Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
          memberLine(LocalResources.current, details.members.map { it.name }),
          Modifier.weight(1f, fill = false),
          style = MaterialTheme.typography.bodySmall,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
        Icon(
          painterResource(R.drawable.ic_chevron_right),
          contentDescription = null,
          Modifier.size(16.dp),
          tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
    }
  }
}

/**
 * Who is in a group, by name while that stays short (/design's memberLine): with every name there
 * it gives the count too, so nobody wonders whether the list holds more (spec/vectors/groups.json,
 * memberLine).
 */
fun memberLine(resources: Resources, names: List<String>): String =
  when {
    names.size == 1 -> resources.getString(R.string.join_members_one, names[0])
    names.size <= NAMED_MEMBERS -> resources.getString(R.string.join_members_few, names.joinToString("、"), names.size)
    else -> resources.getString(R.string.join_members_many, names.take(NAMED_MEMBERS - 1).joinToString("、"), names.size - (NAMED_MEMBERS - 1))
  }

/** How many members the line names, all of them then counted too. */
private const val NAMED_MEMBERS = 3

/** The invitation could not be read: a link that no longer works, as the site says it, or no connection, to try again. */
@Composable
private fun Unusable(reason: InviteFailure.Reason, modifier: Modifier, onRetry: () -> Unit) {
  Column(
    modifier.fillMaxSize().padding(horizontal = 32.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text(
      stringResource(if (reason == InviteFailure.Reason.Unusable) R.string.join_unusable else R.string.join_unread),
      style = MaterialTheme.typography.titleLarge,
      textAlign = TextAlign.Center,
    )
    Text(inviteMessage(reason), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    if (reason != InviteFailure.Reason.Unusable) {
      TextButton(onClick = onRetry) {
        Icon(painterResource(R.drawable.ic_refresh), contentDescription = null)
        Text(stringResource(R.string.check_again), Modifier.padding(start = 8.dp))
      }
    }
  }
}

@Composable
private fun inviteMessage(reason: InviteFailure.Reason): String =
  when (reason) {
    InviteFailure.Reason.Unusable -> stringResource(R.string.join_unusable_body)
    InviteFailure.Reason.Full -> stringResource(R.string.join_full_body, GROUP_MAX_MEMBERS)
    InviteFailure.Reason.Failed -> stringResource(R.string.join_unread_body)
  }

/** Everyone in the group before joining: names and faces only, as shifts are seen once both are in it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MembersSheet(details: InviteDetails, code: String, onDismiss: () -> Unit) {
  ListSheet(onDismiss, stringResource(R.string.join_members_title, details.members.size)) {
    item { Text(details.name, Modifier.padding(horizontal = 24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
    itemsIndexed(details.members) { _, member ->
      ListItem(
        headlineContent = { Text(member.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingContent = { MemberAvatar(member.name, member.photoId, PhotoShelf.Invitation(code), 28.dp) },
      )
    }
  }
}
