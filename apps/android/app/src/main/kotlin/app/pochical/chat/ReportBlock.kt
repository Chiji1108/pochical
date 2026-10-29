package app.pochical.chat

import android.content.res.Resources
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pochical.ListSheet
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.ReviewPrompt
import app.pochical.RowEnd
import app.pochical.SectionHeader
import app.pochical.SettingsRow
import app.pochical.SettingsSection
import app.pochical.design.Chat
import app.pochical.design.Radius
import app.pochical.groups.GroupMarkView
import app.pochical.groups.LocalGroupCalls
import app.pochical.groups.LocalValues
import app.pochical.groups.MemberAvatar
import app.pochical.groups.SAMPLE_PHOTO
import app.pochical.kit.GroupCalls
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.PhotoShelf
import app.pochical.kit.Reported
import app.pochical.v1.ReportReason
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

// Reporting and blocking (spec/chat.md, Reporting and blocking), as the stores ask of an app where
// people post to each other: a reason, sent, then blocking offered; and a member's profile, where
// blocking lives. Neither is shown to the member concerned.

/** What is being reported: someone else's line, or a member; [userId] and [name] whose. */
sealed interface ReportTarget {
  val userId: String
  val name: String

  data class Line(val threadId: String, val seq: Long, override val userId: String, override val name: String) : ReportTarget

  data class Member(override val userId: String, override val name: String) : ReportTarget
}

/** Someone else whose profile is open: their id, and their name and photo as the group shows them. */
data class ProfileOf(val id: String, val name: String, val photoId: String) {
  companion object {
    /** A member's profile as the group shows them. */
    fun of(member: GroupMemberRow) = ProfileOf(member.userId, member.displayName, member.photoId)
  }
}

/** Someone being blocked or unblocked, asked first; [afterReport] right after reporting them, as Instagram and X ask. */
data class BlockQuestion(val userId: String, val name: String, val block: Boolean, val afterReport: Boolean = false)

/** What is open of a member's profile, a report and blocking, over the page that shows them. */
@Stable
class ReportAndBlockState {
  var profileOf by mutableStateOf<ProfileOf?>(null)
  var reporting by mutableStateOf<ReportTarget?>(null)
  var question by mutableStateOf<BlockQuestion?>(null)
}

/**
 * A member's profile, reporting them or a line, and blocking them asked first, over the page that
 * opens them through [state] (a chat, グループの設定), each said in its [snackbar]. [messaging] is the
 * way to the one-to-one chat with someone, null in that chat itself; [onRemove] takes them out of the
 * group, where the profile offers it.
 */
@Composable
fun ReportAndBlock(
  state: ReportAndBlockState,
  /** Whom the user has blocked. */
  blocked: Set<String>,
  groupId: String,
  groupName: String,
  groupMark: GroupMarkValue,
  snackbar: SnackbarHostState,
  messaging: (ProfileOf) -> (() -> Unit)?,
  onRemove: ((ProfileOf) -> Unit)? = null,
) {
  val calls = LocalGroupCalls.current
  val scope = rememberCoroutineScope()
  val resources = LocalResources.current

  state.profileOf?.let { person ->
    val isBlocked = person.id in blocked
    MemberProfileSheet(
      person,
      groupName,
      groupMark,
      PhotoShelf.Group(groupId),
      isBlocked,
      onDismiss = { state.profileOf = null },
      onMessage = messaging(person)?.takeIf { !isBlocked }?.let { open -> { state.profileOf = null; open() } },
      onBlock = { block ->
        state.profileOf = null
        state.question = BlockQuestion(person.id, person.name, block)
      },
      onReport = {
        state.profileOf = null
        state.reporting = ReportTarget.Member(person.id, person.name)
      },
      onRemove = onRemove?.let { remove -> { state.profileOf = null; remove(person) } },
    )
  }
  state.reporting?.let { target ->
    ReportSheet(target, groupId, onDismiss = { state.reporting = null }) {
      state.reporting = null
      // Blocking them is offered, unless they are already.
      if (target.userId in blocked) scope.launch { snackbar.showSnackbar(resources.getString(R.string.reported)) }
      else state.question = BlockQuestion(target.userId, target.name, block = true, afterReport = true)
    }
  }
  state.question?.let { question ->
    BlockDialog(question, onDismiss = { state.question = null }) {
      state.question = null
      scope.launch { snackbar.showSnackbar(answer(question, calls, resources)) }
    }
  }
}

/** Blocks or unblocks someone as [question] asked: what the app says of it, done or not. */
private suspend fun answer(question: BlockQuestion, calls: GroupCalls, resources: Resources): String =
  try {
    calls.setBlocked(question.userId, question.block)
    resources.getString(if (question.block) R.string.blocked_done else R.string.unblocked_done, question.name)
  } catch (e: CancellationException) {
    throw e
  } catch (_: Exception) {
    resources.getString(R.string.block_failed)
  }

/** The reasons a report gives, in the spec's order, each with its words. */
private val reasons =
  listOf(
    ReportReason.REPORT_REASON_SPAM to R.string.report_spam,
    ReportReason.REPORT_REASON_HARASSMENT to R.string.report_harassment,
    ReportReason.REPORT_REASON_EXPLICIT to R.string.report_explicit,
    ReportReason.REPORT_REASON_IMPERSONATION to R.string.report_impersonation,
    ReportReason.REPORT_REASON_OTHER to R.string.report_other,
  )

/**
 * 通報 (/design's ReportSheet): a reason picked as Material's radio buttons pick one, what is sent
 * said under them, and 送信 at the sheet's foot, as a Material sheet confirms, where iOS's ✓ is in
 * its bar. [onSent] once the server has it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportSheet(target: ReportTarget, groupId: String, onDismiss: () -> Unit, onSent: () -> Unit) {
  val calls = LocalGroupCalls.current
  val colors = LocalThemeColors.current
  val scope = rememberCoroutineScope()
  var reason by remember { mutableStateOf<ReportReason?>(null) }
  var sending by remember { mutableStateOf(false) }
  var failed by remember { mutableStateOf(false) }
  val what = if (target is ReportTarget.Line) stringResource(R.string.report_line_of, target.name) else target.name
  val sends = if (target is ReportTarget.Line) stringResource(R.string.report_sends_line) else stringResource(R.string.report_sends_member, target.name)
  // Open whole, so 送信 at its foot is in sight with the reasons.
  ListSheet(onDismiss, stringResource(R.string.report), sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    item { SectionHeader(stringResource(R.string.report_why, what)) }
    items(reasons, key = { it.first.number }) { (choice, words) ->
      ListItem(
        headlineContent = { Text(stringResource(words)) },
        leadingContent = { RadioButton(selected = reason == choice, onClick = null) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.selectable(selected = reason == choice, role = Role.RadioButton) { reason = choice },
      )
    }
    item {
      Text(
        stringResource(R.string.report_note, sends),
        Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
        style = MaterialTheme.typography.bodySmall,
        color = colors.textSecondary,
      )
    }
    item {
      Button(
        onClick = {
          val picked = reason ?: return@Button
          sending = true
          scope.launch {
            try {
              val what =
                when (target) {
                  is ReportTarget.Line -> Reported.Line(target.threadId, target.seq)
                  is ReportTarget.Member -> Reported.Member(target.userId)
                }
              calls.report(groupId, picked, what)
              onSent()
            } catch (e: CancellationException) {
              throw e
            } catch (_: Exception) {
              ReviewPrompt.troubled = true
              failed = true
            }
            sending = false
          }
        },
        enabled = reason != null && !sending,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
      ) {
        Text(stringResource(R.string.report_send))
      }
    }
  }
  if (failed) {
    AlertDialog(
      onDismissRequest = { failed = false },
      title = { Text(stringResource(R.string.report_failed)) },
      text = { Text(stringResource(R.string.report_failed_body)) },
      confirmButton = { TextButton(onClick = { failed = false }) { Text(stringResource(R.string.ok)) } },
    )
  }
}

/**
 * Someone else in the group (/design's member sheet): their face, their name, ブロック中 while
 * blocked, 〇〇でのプロフィール with the group's mark, and メッセージを送る ([onMessage], none from the
 * chat with them or while blocked); ブロック or ブロックを解除 and 通報 in ⋯, out of sight, as they are
 * rarely used and a family member's profile should not show ブロック in red; このグループから外す at its
 * foot where [onRemove] offers it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemberProfileSheet(
  person: ProfileOf,
  groupName: String,
  groupMark: GroupMarkValue,
  shelf: PhotoShelf,
  blocked: Boolean,
  onDismiss: () -> Unit,
  onMessage: (() -> Unit)?,
  onBlock: (block: Boolean) -> Unit,
  onReport: () -> Unit,
  onRemove: (() -> Unit)?,
) {
  val colors = LocalThemeColors.current
  ListSheet(onDismiss) {
    item(key = "head") {
      Box(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        var menu by remember { mutableStateOf(false) }
        Box(Modifier.align(Alignment.TopEnd)) {
          IconButton(onClick = { menu = true }) {
            Icon(painterResource(R.drawable.ic_more_vert), stringResource(R.string.profile_menu, person.name))
          }
          DropdownMenu(menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(
              text = { Text(stringResource(if (blocked) R.string.unblock else R.string.block)) },
              leadingIcon = { Icon(painterResource(R.drawable.ic_block), contentDescription = null) },
              onClick = {
                menu = false
                onBlock(!blocked)
              },
            )
            HorizontalDivider()
            DropdownMenuItem(
              text = { Text(stringResource(R.string.report), color = colors.dangerDefault) },
              leadingIcon = { Icon(painterResource(R.drawable.ic_flag), contentDescription = null, tint = colors.dangerDefault) },
              onClick = {
                menu = false
                onReport()
              },
            )
          }
        }
      }
    }
    item(key = "person") {
      Column(
        Modifier.fillMaxWidth().padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        // Their face opens large when it is a photo.
        var faceOpen by remember { mutableStateOf(false) }
        val opensLarge = stringResource(R.string.profile_photo_open)
        val photo = stringResource(R.string.profile_photo_of, person.name)
        // /design's sample faces are drawn on the device, not fetched: they open nothing.
        val opens = person.photoId.isNotEmpty() && !person.photoId.startsWith(SAMPLE_PHOTO)
        MemberAvatar(
          person.name,
          person.photoId,
          shelf,
          PROFILE_FACE,
          if (opens) Modifier.clip(CircleShape).clickable(onClickLabel = opensLarge) { faceOpen = true }.semantics { contentDescription = photo } else Modifier,
        )
        if (faceOpen) FaceViewer(person.photoId, shelf, person.name) { faceOpen = false }
        Text(person.name, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (blocked) {
          Text(
            stringResource(R.string.blocked_badge),
            Modifier.background(colors.fillTertiary, CircleShape).padding(horizontal = 8.dp, vertical = 3.dp),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = colors.textSecondary,
          )
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          GroupMarkView(groupMark, 14.dp, Modifier.clearAndSetSemantics {}, shelf)
          Text(stringResource(R.string.profile_in_group, groupName), style = MaterialTheme.typography.bodySmall, color = colors.textTertiary)
        }
        if (onMessage != null) {
          Button(onClick = onMessage, Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Icon(painterResource(R.drawable.ic_chat), contentDescription = null, Modifier.padding(end = 8.dp).size(18.dp))
            Text(stringResource(R.string.profile_message))
          }
        }
      }
    }
    // At the foot, apart from the face: rarely wanted, and asked first.
    if (onRemove != null) {
      item(key = "remove") {
        Box(Modifier.fillMaxWidth().padding(top = 16.dp), contentAlignment = Alignment.Center) {
          TextButton(onClick = onRemove) { Text(stringResource(R.string.member_remove), color = MaterialTheme.colorScheme.error) }
        }
      }
    }
  }
}

/** Blocking or unblocking someone, asked first in a centered alert; right after a report, 通報しました over it. */
@Composable
fun BlockDialog(question: BlockQuestion, onDismiss: () -> Unit, onConfirm: () -> Unit) {
  val colors = LocalThemeColors.current
  AlertDialog(
    onDismissRequest = onDismiss,
    title = {
      Text(
        when {
          question.afterReport -> stringResource(R.string.reported)
          question.block -> stringResource(R.string.block_ask, question.name)
          else -> stringResource(R.string.unblock_ask, question.name)
        }
      )
    },
    text = {
      Text(
        when {
          question.afterReport -> stringResource(R.string.block_after_report_body, question.name)
          question.block -> stringResource(R.string.block_body)
          else -> stringResource(R.string.unblock_body)
        }
      )
    },
    confirmButton = {
      TextButton(onClick = onConfirm) {
        if (question.block) Text(stringResource(R.string.block), color = colors.dangerDefault) else Text(stringResource(R.string.unblock_confirm))
      }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(if (question.afterReport) R.string.block_dont else R.string.cancel)) } },
  )
}

/**
 * A blocked member's line in the place's own chat, folded to one line: not a bubble but a dashed
 * outline where one would be, with 表示 to show it this once (/design's), past the room of a face.
 */
@Composable
fun FoldedLine(onShow: () -> Unit, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val outline = colors.borderStrong
  val hint = stringResource(R.string.blocked_line_hint)
  val words = stringResource(R.string.chat_blocked_line)
  Box(modifier.fillMaxWidth().padding(start = FACE + TAIL, top = Chat.runGap.dp)) {
    Row(
      Modifier.clip(RoundedCornerShape(Radius.lg))
        .drawBehind {
          val stroke = 1.dp.toPx()
          drawRoundRect(
            outline,
            topLeft = Offset(stroke / 2, stroke / 2),
            size = Size(size.width - stroke, size.height - stroke),
            cornerRadius = CornerRadius(Radius.lg.toPx()),
            style = Stroke(stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))),
          )
        }
        .clickable(onClick = onShow)
        .clearAndSetSemantics {
          contentDescription = words
          role = Role.Button
          onClick(hint) {
            onShow()
            true
          }
        }
        .padding(horizontal = 12.dp, vertical = 8.dp),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text(words, style = MaterialTheme.typography.bodySmall, color = colors.textTertiary)
      Text(stringResource(R.string.blocked_line_show), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = colors.accentDefault)
    }
  }
}

/**
 * ブロック中のメンバー (spec/chat.md, Reporting and blocking), for 設定 › 通知 › チャット, shown while
 * there is one: each blocked person by the name and face a group they were in with them knows,
 * 解除 asked first ([onUnblock]).
 */
@Composable
fun BlockedMembers(people: List<BlockedPerson>, onUnblock: (BlockedPerson) -> Unit) {
  if (people.isEmpty()) return
  SettingsSection(stringResource(R.string.blocked_members)) {
    for (person in people) {
      row {
        SettingsRow(
          person.name,
          icon = null,
          onClick = { onUnblock(person) },
          supporting = person.group.takeIf { it.isNotEmpty() },
          leading = { MemberAvatar(person.name, person.photoId, person.shelf, 40.dp) },
          valueContent = { Text(stringResource(R.string.unblock_confirm), color = MaterialTheme.colorScheme.primary) },
          end = RowEnd.None,
          oneLine = true,
        )
      }
    }
  }
}

/** Someone the user has blocked, as one of their groups knows them: none of it when no group does now. */
data class BlockedPerson(val id: String, val name: String, val group: String, val photoId: String, val shelf: PhotoShelf?)

/** Whom the user has blocked, by id, as [blockedMembers] lists them, read again as either changes. */
@Composable
fun rememberBlockedPeople(): List<BlockedPerson> {
  val values = LocalValues.current
  val blocks by remember(values) { values.blocks() }.collectAsStateWithLifecycle(emptyList())
  val members by remember(values) { values.blockedMembers() }.collectAsStateWithLifecycle(emptyList())
  val groups by remember(values) { values.groups() }.collectAsStateWithLifecycle(emptyList())
  val someone = stringResource(R.string.blocked_someone)
  return blocks.map { it.userId }.sorted().map { id ->
    val member = members.firstOrNull { it.userId == id && !it.deleted }
    BlockedPerson(
      id,
      member?.displayName ?: someone,
      member?.let { m -> groups.firstOrNull { it.id == m.groupId }?.name }.orEmpty(),
      member?.photoId.orEmpty(),
      member?.let { PhotoShelf.Group(it.groupId) },
    )
  }
}

/**
 * ブロック中のメンバー's 解除, asked first in a centered alert and said once done, for the page
 * [blockedMembers] lists them on: the person being unblocked while asked, and the way to ask.
 */
@Composable
fun rememberUnblocking(snackbar: SnackbarHostState): (BlockedPerson) -> Unit {
  var asked by remember { mutableStateOf<BlockedPerson?>(null) }
  val calls = LocalGroupCalls.current
  val scope = rememberCoroutineScope()
  val resources = LocalResources.current
  asked?.let { person ->
    val question = BlockQuestion(person.id, person.name, block = false)
    BlockDialog(question, onDismiss = { asked = null }) {
      asked = null
      scope.launch { snackbar.showSnackbar(answer(question, calls, resources)) }
    }
  }
  return { asked = it }
}

/** How large a face is on its profile. */
private val PROFILE_FACE = 72.dp
