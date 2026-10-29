package app.pochical.chat

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.DpSize
import app.pochical.design.Chat
import app.pochical.kit.ChatLine
import app.pochical.kit.LineContent
import coil3.SingletonImageLoader
import coil3.request.Disposable
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull

/**
 * Fetches ahead the photos of the lines within `chatRules.photoPrefetchScreens` screens above and
 * below those in sight, as their lines ask for them (`linePhotoRequest`, at the size each shows),
 * and lets go of those scrolled further away before they come (spec/chat.md, Photos), as Signal and
 * Telegram fetch what is about to show and iOS's `PhotoPrefetch` does by Nuke's `ImagePrefetcher`.
 * Those in sight load as they are drawn; one fetched ahead that comes into sight goes on.
 */
@Composable
fun PrefetchPhotos(
  list: LazyListState,
  items: List<ChatItem>,
  groupId: String,
  /** Whether a line shows folded, its writer blocked: its photos are not fetched. */
  folded: (ChatLine) -> Boolean,
  /** Once the chat is placed where it opens: not on the way there. */
  enabled: Boolean,
) {
  val context = LocalContext.current
  val density = LocalDensity.current
  val shown by rememberUpdatedState(items)
  val hidden by rememberUpdatedState(folded)
  LaunchedEffect(list, groupId, density, enabled) {
    if (!enabled) return@LaunchedEffect
    // Each fetch ahead by its photo while it is near: one come is in memory, so letting go of it does nothing.
    val fetching = mutableMapOf<String, Disposable>()
    try {
      // From where the lines are and what they are, both read here, so a line taken back or a page
      // come in counts as much as a scroll.
      snapshotFlow { list.near()?.let { (ahead, inSight) -> Near(photosAt(shown, ahead, hidden), photosAt(shown, inSight, hidden).keys) } }
        .filterNotNull()
        .distinctUntilChanged()
        .collect { near ->
          // Scrolled further away, or gone from the lines: let go of before it comes.
          (fetching.keys - near.ahead.keys - near.inSight).forEach { id -> fetching.remove(id)?.dispose() }
          val loader = SingletonImageLoader.get(context)
          for ((id, size) in near.ahead) {
            if (id in fetching) continue
            val request = linePhotoRequest(context, id, groupId).size(with(density) { size.width.roundToPx() }, with(density) { size.height.roundToPx() }).build()
            fetching[id] = loader.enqueue(request)
          }
        }
    } finally {
      fetching.values.forEach(Disposable::dispose)
    }
  }
}

/** The photos near the screen: those to fetch ahead, by id with the size each shows at, and the ids of those in sight. */
private data class Near(val ahead: Map<String, DpSize>, val inSight: Set<String>)

/** The photos of the unfolded lines at [indices], by id with the size each shows at. */
internal fun photosAt(items: List<ChatItem>, indices: List<Int>, folded: (ChatLine) -> Boolean): Map<String, DpSize> =
  indices
    .mapNotNull { index -> (items.getOrNull(index) as? ChatItem.Line)?.line?.takeIf { !folded(it) } }
    .flatMap { line -> (line.content as? LineContent.Photos)?.photos.orEmpty().let { photos -> photos.map { it.id }.zip(photoCells(photos)) } }
    .toMap()

/**
 * The indices of the items within `chatRules.photoPrefetchScreens` screens above and below those on
 * the screen, and of those on it: counted in the sizes of the items on it, as the lines beyond are
 * not laid out. Null before anything is laid out.
 */
private fun LazyListState.near(): Pair<List<Int>, List<Int>>? {
  val info = layoutInfo
  val visible = info.visibleItemsInfo
  if (visible.isEmpty()) return null
  val screen = info.viewportEndOffset - info.viewportStartOffset
  val average = (visible.sumOf { it.size } / visible.size).coerceAtLeast(1)
  val beyond = Chat.photoPrefetchScreens * screen / average + 1
  val first = visible.first().index
  val last = visible.last().index
  val ahead = ((first - beyond).coerceAtLeast(0) until first) + (last + 1..(last + beyond).coerceAtMost(info.totalItemsCount - 1))
  return ahead to (first..last).toList()
}
