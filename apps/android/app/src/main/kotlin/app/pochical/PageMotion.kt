package app.pochical

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.material3.MotionScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.navigation3.scene.Scene
import androidx.navigationevent.NavigationEvent

/**
 * How pages come and go, as Android's own apps move between them rather than iOS's push: Material's
 * shared axis X, a page coming in a short way from the end as it fades in over the one under it,
 * which goes a short way to the start; back the other way, the page leaving fading out over the one
 * coming back. Its springs are the standard motion scheme's, which settle without a bounce, as a
 * page change is a utilitarian move rather than an expressive one. A predictive back is the
 * system's: the page under the finger stays opaque, shrinks and moves the way the finger goes from
 * the edge it was swiped from, over the page under it coming back along the axis, and lets go into
 * the same pop as the back button's. One piece for every NavDisplay.
 *
 * Between a page alone and the tabs with their pages beside them (a window widened or narrowed, a
 * tab gone to on a wide one) nothing is pushed or popped, only laid out anew: that comes at once,
 * and the panes beside the tabs come and go as Material's list-detail layout moves them.
 */
@Stable
class PageMotion(private val shift: Int) {
  private val motion = MotionScheme.standard()
  private val spatial: FiniteAnimationSpec<IntOffset> = motion.defaultSpatialSpec()
  private val shrink: FiniteAnimationSpec<Float> = motion.defaultSpatialSpec()
  private val fade: FiniteAnimationSpec<Float> = motion.defaultEffectsSpec()

  /** A page pushed: the shared axis forward, the new page over the old. */
  fun <T : Any> push(): AnimatedContentTransitionScope<Scene<T>>.() -> ContentTransform = {
    if (laidOutAnew) {
      STILL
    } else {
      (slideInHorizontally(spatial) { shift } + fadeIn(fade)) togetherWith slideOutHorizontally(spatial) { -shift }
    }
  }

  /** A page popped by the back button: the shared axis backward, the page leaving over the one coming back. */
  fun <T : Any> pop(): AnimatedContentTransitionScope<Scene<T>>.() -> ContentTransform = {
    if (laidOutAnew) {
      STILL
    } else {
      (slideInHorizontally(spatial) { -shift } togetherWith (slideOutHorizontally(spatial) { shift } + fadeOut(fade))).apply {
        targetContentZIndex = -1f
      }
    }
  }

  /** A page popped by a predictive back from [edge]: it shrinks and moves the finger's way, opaque, over the one coming back. */
  fun <T : Any> predictivePop(): AnimatedContentTransitionScope<Scene<T>>.(Int) -> ContentTransform = { edge ->
    if (laidOutAnew) {
      STILL
    } else {
      val away = if (edge == NavigationEvent.EDGE_RIGHT) -shift else shift
      (slideInHorizontally(spatial) { -shift } togetherWith (scaleOut(shrink, targetScale = SHRUNK) + slideOutHorizontally(spatial) { away })).apply {
        targetContentZIndex = -1f
      }
    }
  }

  /** Whether the scenes are of two kinds, a page alone and the tabs with their pages beside them. */
  private val AnimatedContentTransitionScope<out Scene<*>>.laidOutAnew: Boolean
    get() = initialState::class != targetState::class

  private companion object {
    /** How small a page shrinks as a predictive back takes it, as the system's own. */
    const val SHRUNK = 0.9f

    /** Nothing moving: the new scene in the old one's place at once. */
    val STILL = EnterTransition.None togetherWith ExitTransition.None
  }
}

/** The pages' motion, its shift in this screen's pixels. */
@Composable
fun rememberPageMotion(): PageMotion {
  val shift = with(LocalDensity.current) { SHARED_AXIS_SHIFT.roundToPx() }
  return remember(shift) { PageMotion(shift) }
}

/** How far a page moves along the shared axis, Material's 30dp. */
private val SHARED_AXIS_SHIFT = 30.dp
