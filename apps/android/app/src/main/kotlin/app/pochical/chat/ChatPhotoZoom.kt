package app.pochical.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier

// A photo opened large opens out of its place and closes back into the place of the photo then
// shown (spec/chat.md, Photos), as Photos does and iOS's zoom transition: one shared element between
// the photo's place in its line or in 写真's grid and the viewer, its place left empty meanwhile and
// filled again as the photo lands on it. With motion reduced it fades instead, without a shared
// element.

/** The photo shown large, by id, whose place stands empty while it is, and the transition it moves in. */
@OptIn(ExperimentalSharedTransitionApi::class)
@Stable
class PhotoZoom(val scope: SharedTransitionScope, val shown: () -> String?)

/** The page's photo zoom; null where photos only fade (motion reduced, or no page provides it). */
val LocalPhotoZoom = compositionLocalOf<PhotoZoom?> { null }

/**
 * The photos' places on the page, and [open] large over them: out of its place and back into it,
 * or fading with [reducedMotion]. [shownOf] tells the photo [open] shows, read as the page draws, so
 * its place stands empty from the first frame it opens in and is filled again the frame it closes.
 * [viewer] draws the photos large while they are open, and as they go ([closing]).
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun <T : Any> PhotoZoomLayout(
  open: T?,
  reducedMotion: Boolean,
  shownOf: (T) -> String?,
  places: @Composable () -> Unit,
  viewer: @Composable AnimatedVisibilityScope.(open: T, closing: Boolean) -> Unit,
) {
  SharedTransitionLayout {
    val current by rememberUpdatedState(open)
    val zoom = remember(this) { PhotoZoom(this) { current?.let(shownOf) } }
    // Kept as it goes, so it closes whole: not state, as nothing is drawn from it changing.
    val last = remember { arrayOfNulls<Any>(1) }
    if (open != null) last[0] = open
    CompositionLocalProvider(LocalPhotoZoom provides zoom.takeIf { !reducedMotion }) {
      places()
      AnimatedVisibility(open != null, enter = fadeIn(), exit = fadeOut()) {
        @Suppress("UNCHECKED_CAST")
        (last[0] as T?)?.let { viewer(it, open == null) }
      }
    }
  }
}

/**
 * The place of the photo [photoId] in a line or the grid: the photo opened large comes out of it and
 * goes back into it, and it stands empty while the photo is shown large.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun Modifier.photoPlace(photoId: String): Modifier {
  val zoom = LocalPhotoZoom.current ?: return this
  return with(zoom.scope) { sharedElementWithCallerManagedVisibility(rememberSharedContentState(photoId), visible = zoom.shown() != photoId) }
}

/** The photo [photoId] large, coming out of its place as the viewer [scope] opens and back into it as it closes. */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun Modifier.largePhoto(photoId: String, scope: AnimatedVisibilityScope?): Modifier {
  val zoom = LocalPhotoZoom.current ?: return this
  scope ?: return this
  return with(zoom.scope) { sharedElement(rememberSharedContentState(photoId), scope) }
}
