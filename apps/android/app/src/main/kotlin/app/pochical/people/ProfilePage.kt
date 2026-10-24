package app.pochical.people

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.Footnote
import app.pochical.LimitedTextField
import app.pochical.PageNavigation
import app.pochical.R
import app.pochical.RootPage
import app.pochical.SettingsPage
import app.pochical.characterCount
import app.pochical.design.TextLimits
import app.pochical.groups.LocalGroupCalls
import app.pochical.groups.LocalValues
import app.pochical.groups.MemberAvatar
import app.pochical.groups.PhotoCropShape
import app.pochical.groups.PhotoEditor
import app.pochical.kit.PhotoShelf
import app.pochical.kit.ProfileRow
import app.pochical.kit.UsualPhoto
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/** The user's usual name and photo as the account last said, empty before they set either; null until read. */
@Composable
private fun usualProfile(): ProfileRow? {
  val values = LocalValues.current
  return remember(values) { values.profile().map { it ?: ProfileRow(name = "", photoId = "") } }.collectAsStateWithLifecycle(null).value
}

/**
 * 設定 › プロフィール (/design's ProfilePage; spec/sync-protocol.md, Profile): the usual photo, kept as it
 * is picked, and the usual name, kept as the field, the page or the app is left, so no name half
 * typed or still being converted reaches the groups. Both go through the kit, which sends them in
 * turn whether the page is still here or not; offline, the page says it could not save them.
 */
@Composable
fun ProfilePage(navigation: PageNavigation) {
  val saved = usualProfile()
  SettingsPage(stringResource(R.string.profile), onBack = navigation::back) { padding ->
    if (saved == null) {
      CircularProgressIndicator(Modifier.padding(padding).padding(24.dp))
    } else {
      ProfileForm(saved, Modifier.padding(padding))
    }
  }
}

@Composable
private fun ProfileForm(saved: ProfileRow, modifier: Modifier) {
  val calls = LocalGroupCalls.current
  val scope = rememberCoroutineScope()
  var name by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue(saved.name)) }
  // The name this page started from or last kept: only a name typed here is written, so a change
  // from another device meanwhile is not undone by a field left as it was.
  var from by rememberSaveable { mutableStateOf(saved.name) }
  var failed by remember { mutableStateOf(false) }
  val typed = name.text.trim()
  LaunchedEffect(saved.name) {
    if (typed == from) {
      name = TextFieldValue(saved.name)
      from = saved.name
    }
  }

  // The kit's answer, told while the page is here.
  fun told(send: Deferred<Unit>, undo: () -> Unit = {}) {
    scope.launch {
      failed =
        try {
          send.await()
          false
        } catch (e: CancellationException) {
          throw e
        } catch (_: Exception) {
          undo()
          true
        }
    }
  }

  val keep by rememberUpdatedState {
    if (typed != from && characterCount(typed) <= TextLimits.personName) {
      val before = from
      from = typed
      told(calls.keepProfile(name = typed)) { from = before }
    }
  }
  DisposableEffect(Unit) { onDispose { keep() } }
  LifecycleEventEffect(Lifecycle.Event.ON_STOP) { keep() }

  suspend fun photo(change: UsualPhoto) {
    try {
      calls.keepProfile(photo = change).await()
      failed = false
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      failed = true
    }
  }

  Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
    PhotoEditor(
      label = stringResource(R.string.photo_edit),
      shape = PhotoCropShape.Round,
      onPhoto = { jpeg -> photo(UsualPhoto.New(jpeg)) },
      modifier = Modifier.padding(top = 16.dp),
      onRemove = if (saved.photoId.isNotEmpty()) ({ photo(UsualPhoto.None) }) else null,
    ) {
      MemberAvatar(typed.ifEmpty { saved.name }, saved.photoId, PhotoShelf.Mine, 88.dp, me = true)
    }
    LimitedTextField(
      name,
      { name = it },
      TextLimits.personName,
      stringResource(R.string.profile_name),
      Modifier.fillMaxWidth().padding(horizontal = 16.dp).onFocusChanged { if (!it.isFocused) keep() },
      placeholder = stringResource(R.string.person_name_example),
    )
    if (failed) {
      Text(
        stringResource(R.string.name_not_saved),
        Modifier.padding(horizontal = 16.dp),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium,
      )
    } else {
      Footnote(stringResource(R.string.profile_note))
    }
  }
}

/** 設定's プロフィール row: the usual face and name, or 未設定. */
@Composable
fun ProfileRow(open: (RootPage) -> Unit) {
  val saved = usualProfile()
  ListItem(
    headlineContent = { Text(stringResource(R.string.profile)) },
    trailingContent = {
      if (saved == null || saved.name.isEmpty()) {
        Text(stringResource(R.string.profile_unset))
      } else {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
          MemberAvatar(saved.name, saved.photoId, PhotoShelf.Mine, 22.dp, me = true)
          Text(saved.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
      }
    },
    modifier = Modifier.clickable { open(RootPage.Profile) },
  )
}
