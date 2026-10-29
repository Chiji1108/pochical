package app.pochical.groups

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.R
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.GroupRow

/** A page's bar over the tabs: [title], the way back and its [actions]. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PageBar(title: String, onBack: () -> Unit, actions: @Composable () -> Unit = {}) {
  TopAppBar(
    title = { Text(title) },
    navigationIcon = { IconButton(onClick = onBack) { Icon(painterResource(R.drawable.ic_back), stringResource(R.string.back)) } },
    actions = { actions() },
  )
}

/**
 * The group [groupId] for one of its pages over the tabs, holding its socket while the page shows:
 * as the device holds it now, renamed meanwhile or not; null until it reaches the device, as one
 * just made may not have yet. Once there, a group the person is no longer in, left from elsewhere
 * or taken out, takes its page away ([onGone]).
 */
@Composable
fun pageGroup(groupId: String, onGone: () -> Unit): GroupRow? {
  HoldSocket(groupId)
  val values = LocalValues.current
  val groups by remember(values) { values.groups() }.collectAsStateWithLifecycle(null)
  val group = groups?.firstOrNull { it.id == groupId }
  var seen by remember { mutableStateOf(false) }
  val gone by rememberUpdatedState(onGone)
  LaunchedEffect(group != null) {
    if (group != null) seen = true else if (seen) gone()
  }
  return group
}

/**
 * One of a group's pages: [content] once the group is read, until then [loading], the page's own
 * bar titled [title] over a spinner, so the bar stays as the group comes.
 */
@Composable
fun GroupPage(
  groupId: String,
  title: String,
  onBack: () -> Unit,
  loading: @Composable (String) -> Unit = { Scaffold(topBar = { PageBar(it, onBack) }) { padding -> PageLoading(padding) } },
  content: @Composable (GroupRow) -> Unit,
) {
  val group = pageGroup(groupId, onBack)
  if (group != null) content(group) else loading(title)
}

/** A page's spinner while what it shows is read, in the middle of the room under its bar. */
@Composable
fun PageLoading(padding: PaddingValues) {
  Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

/** Everyone in the group, those who left too, as the group's socket last said. */
@Composable
fun members(groupId: String): List<GroupMemberRow> {
  val values = LocalValues.current
  val members by remember(values, groupId) { values.members(groupId) }.collectAsStateWithLifecycle(emptyList())
  return members
}

/** Something the person asked for did not go through: [title], and to try again online. */
@Composable
fun FailedDialog(title: String, onDismiss: () -> Unit) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(title) },
    text = { Text(stringResource(R.string.try_again_online)) },
    confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.ok)) } },
  )
}
