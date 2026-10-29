package app.pochical.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.calendar.rememberReducedMotion
import app.pochical.groups.LocalValues
import app.pochical.kit.PhotoRun
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.flow.distinctUntilChanged

// 写真 in a chat's ⋯ (spec/chat.md, Photos), as iOS's ChatPhotosScreen.swift lists them and LINE's
// 写真・動画 does: the chat's photos alone, four across from edge to edge, the latest first.

/**
 * The chat's photos, pushed over it: square thumbnails four across, a hairline apart, the latest at
 * the top left, as the group gives them a page at a time (`PhotoRun`, from the latest), a page
 * before the oldest asked as they near it; the system's spinner until the first page comes, and
 * 写真はまだありません in a chat without any. A tap opens one large among them, the grid scrolling
 * under it to keep the square of the photo shown in sight.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatPhotosPage(groupId: String, threadId: String, onBack: () -> Unit) {
  val colors = LocalThemeColors.current
  val values = LocalValues.current
  val members by remember(values, groupId) { values.members(groupId) }.collectAsState(emptyList())
  val deleted = stringResource(R.string.deleted_account)
  val names = remember(members, deleted) { members.associate { it.userId to it.shownName(deleted) } }
  val listed = remember { OpenPhotos(PhotoRun.latest()) }
  FollowPhotos(groupId, threadId, listed)
  val photos = remember(listed.version) { listed.run.photos.asReversed() }
  val total = remember(listed.version) { listed.run.total }
  var viewing by remember { mutableStateOf<OpenPhotos?>(null) }
  val grid = rememberLazyGridState()
  // The square to bring into sight, as the photo opened large goes to one scrolled away.
  var pending by remember { mutableStateOf<Int?>(null) }
  // The square last come into sight, either way it scrolls: the pages past it asked as it nears an
  // end of those held, as iOS marks each square as it appears. Not while one is open large, which
  // shows its own.
  LaunchedEffect(grid, photos) {
    var seen = emptySet<Int>()
    snapshotFlow { grid.layoutInfo.visibleItemsInfo.map { it.index }.toSet() }.distinctUntilChanged().collect { visible ->
      val came = (visible - seen).let { new -> if (new.isEmpty()) null else if (new.max() > (seen.maxOrNull() ?: -1)) new.max() else new.min() }
      seen = visible
      val key = came?.let { photos.getOrNull(it) }?.key ?: return@collect
      if (viewing == null) listed.change { show(key) }
    }
  }
  PhotoZoomLayout(viewing, rememberReducedMotion(), shownOf = OpenPhotos::shownPhoto, places = {
    Scaffold(
      topBar = {
        TopAppBar(
          title = { Text(stringResource(R.string.chat_photos_title)) },
          navigationIcon = { IconButton(onClick = onBack) { Icon(painterResource(R.drawable.ic_back), stringResource(R.string.back)) } },
        )
      }
    ) { padding ->
      when {
        photos.isNotEmpty() ->
          LazyVerticalGrid(
            GridCells.Fixed(ACROSS),
            // Under the top bar, scrolling on under the navigation bar.
            Modifier.fillMaxSize().padding(top = padding.calculateTopPadding()),
            state = grid,
            contentPadding = PaddingValues(bottom = padding.calculateBottomPadding()),
            horizontalArrangement = Arrangement.spacedBy(GAP),
            verticalArrangement = Arrangement.spacedBy(GAP),
          ) {
            items(photos, key = { it.layoutKey }) { item ->
              val said = stringResource(R.string.chat_photo_by, names[item.authorId] ?: deleted, monthDay(item.sentAtMs))
              // Large among the photos listed, the one run they both follow.
              val open = {
                listed.change { show(item.key) }
                viewing = listed
              }
              ChatPhotoImage(
                item.photo,
                groupId,
                retries = true,
                onOpen = open,
                modifier =
                  Modifier.aspectRatio(1f).photoPlace(item.photo.id).clearAndSetSemantics {
                    contentDescription = said
                    role = Role.Image
                    onClick { open(); true }
                  },
              )
            }
          }
        total == null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else ->
          Column(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(painterResource(R.drawable.ic_image), contentDescription = null, Modifier.size(48.dp), tint = colors.textTertiary)
            Text(stringResource(R.string.chat_photos_none), Modifier.padding(top = 12.dp), style = MaterialTheme.typography.titleMedium, color = colors.textSecondary)
          }
      }
    }
  }) { open, closing ->
    PhotoViewer(
      groupId,
      threadId,
      open,
      nameOf = { names[it] ?: deleted },
      onClose = { viewing = null },
      // Its square kept in sight as the photo opened large is swiped, as Photos' grid follows, so it closes into it.
      onShown = { item ->
        val index = photos.indexOfFirst { it.key == item.key }
        if (index >= 0 && grid.layoutInfo.visibleItemsInfo.none { it.index == index }) {
          pending = index
        }
      },
      zoom = this,
      closing = closing,
    )
  }
  LaunchedEffect(pending) { pending?.let { grid.scrollToItem(it); pending = null } }
}

/** A day as the photos' list reads it (10月5日). */
internal fun monthDay(ms: Long): String = DateTimeFormatter.ofPattern("M月d日").format(Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()))

/** Four across, a hairline apart. */
private const val ACROSS = 4
private val GAP = 1.dp
