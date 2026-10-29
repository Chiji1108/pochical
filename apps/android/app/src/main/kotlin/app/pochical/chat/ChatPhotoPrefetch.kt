package app.pochical.chat

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import app.pochical.design.Chat
import app.pochical.kit.LineContent
import coil3.SingletonImageLoader
import coil3.request.Disposable
import coil3.request.ImageRequest
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * Fetches ahead the photos of the lines within `chatRules.photoPrefetchScreens` screens above and
 * below those in sight, at the size they show, and lets go of those scrolled further away before
 * they come (spec/chat.md, Photos), as Signal and Telegram fetch what is about to show and iOS's
 * `PhotoPrefetch` does by Nuke's `ImagePrefetcher`. Those in sight load as they are drawn.
 */
@Composable
fun PrefetchPhotos(list: LazyListState, items: List<ChatItem>, groupId: String) {
  val context = LocalContext.current
  val density = LocalDensity.current
  val shown by rememberUpdatedState(items)
  // Each fetch ahead by its photo while it is near: one come is in memory, so letting go of it does nothing.
  val fetching = remember { mutableMapOf<String, Disposable>() }
  DisposableEffect(Unit) { onDispose { fetching.values.forEach(Disposable::dispose) } }
  LaunchedEffect(list, groupId) {
    snapshotFlow { list.aroundSight() }
      .distinctUntilChanged()
      .collect { around ->
        val wanted =
          around
            .flatMap { index -> ((shown.getOrNull(index) as? ChatItem.Line)?.line?.content as? LineContent.Photos)?.photos.orEmpty() }
            .associateBy { it.id }
        // Scrolled further away: let go of before it comes.
        (fetching.keys - wanted.keys).forEach { id -> fetching.remove(id)?.dispose() }
        val loader = SingletonImageLoader.get(context)
        for ((id, photo) in wanted) {
          if (id in fetching) continue
          val box = PhotoBox.size(photo)
          val request =
            ImageRequest.Builder(context)
              .data(ChatPhotoData(id, groupId, small = true))
              .size(with(density) { box.width.roundToPx() }, with(density) { box.height.roundToPx() })
              .build()
          fetching[id] = loader.enqueue(request)
        }
      }
  }
}

/**
 * The indices of the items within `chatRules.photoPrefetchScreens` screens above and below those on
 * the screen, those on it left out: counted in the sizes of the items on it, as the lines beyond are
 * not laid out.
 */
private fun LazyListState.aroundSight(): List<Int> {
  val info = layoutInfo
  val visible = info.visibleItemsInfo
  if (visible.isEmpty()) return emptyList()
  val screen = info.viewportEndOffset - info.viewportStartOffset
  val average = (visible.sumOf { it.size } / visible.size).coerceAtLeast(1)
  val beyond = Chat.photoPrefetchScreens * screen / average + 1
  val first = visible.first().index
  val last = visible.last().index
  return ((first - beyond).coerceAtLeast(0) until first) + (last + 1..(last + beyond).coerceAtMost(info.totalItemsCount - 1))
}
