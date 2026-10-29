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
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

// A photo opened large opens out of its place and closes back into the place of the photo then
// shown (spec/chat.md, Photos), as Photos does and iOS's zoom transition: one shared element between
// the photo's place in its line or in 写真's grid and the viewer, its place left empty meanwhile and
// filled again as the photo lands on it. With motion reduced it fades instead, without a shared
// element.

/** The photo shown large, by id, whose place stands empty while it is, and the transition it moves in. */
@OptIn(ExperimentalSharedTransitionApi::class)
@Stable
class PhotoZoom(val scope: SharedTransitionScope) {
  /** The photo shown large; null while none is. */
  var shown by mutableStateOf<String?>(null)
}

/** The page's photo zoom; null where photos only fade (motion reduced, or no page provides it). */
val LocalPhotoZoom = compositionLocalOf<PhotoZoom?> { null }

/**
 * The photos' places on the page, and [open] large over them: out of its place and back into it,
 * or fading with [reducedMotion]. [viewer] draws the photos large while they are open, and as they
 * go, told which it shows ([PhotoZoom.shown]) through [shown].
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun <T : Any> PhotoZoomLayout(
  open: T?,
  reducedMotion: Boolean,
  places: @Composable () -> Unit,
  viewer: @Composable AnimatedVisibilityScope.(open: T, shown: (photoId: String) -> Unit) -> Unit,
) {
  SharedTransitionLayout {
    val zoom = remember(this) { PhotoZoom(this) }
    // Kept as it goes, so it closes whole.
    var last by remember { mutableStateOf(open) }
    if (open != null) last = open
    // Its place is filled again as it closes, the photo landing on it.
    SideEffect { if (open == null) zoom.shown = null }
    CompositionLocalProvider(LocalPhotoZoom provides zoom.takeIf { !reducedMotion }) {
      places()
      AnimatedVisibility(open != null, enter = fadeIn(), exit = fadeOut()) {
        last?.let { viewer(it) { id -> if (open != null) zoom.shown = id } }
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
  return with(zoom.scope) { sharedElementWithCallerManagedVisibility(rememberSharedContentState(photoId), visible = zoom.shown != photoId) }
}

/** The photo [photoId] large, coming out of its place as the viewer [scope] opens and back into it as it closes. */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun Modifier.largePhoto(photoId: String, scope: AnimatedVisibilityScope?): Modifier {
  val zoom = LocalPhotoZoom.current ?: return this
  scope ?: return this
  return with(zoom.scope) { sharedElement(rememberSharedContentState(photoId), scope) }
}
