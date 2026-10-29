package app.pochical

import androidx.activity.BackEventCompat
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.navigation3.scene.Scene

/**
 * How pages come and go, as Android's own apps move between them rather than iOS's push: Material's
 * shared axis X, a page coming in a short way from the end as it fades in while the one under it
 * goes a short way to the start fading out, on the Expressive motion scheme's springs; back the
 * other way. A predictive back is the system's shrink: the page following the finger shrinks and
 * moves toward the edge it is swiped from while the one under it comes back along the axis. One
 * piece for every NavDisplay, so a back gesture and the back button move alike.
 */
@Stable
class PageMotion(motion: MotionScheme, private val shift: Int) {
  private val spatial: FiniteAnimationSpec<IntOffset> = motion.defaultSpatialSpec()
  private val fadeInSpec: FiniteAnimationSpec<Float> = motion.defaultEffectsSpec()
  private val fadeOutSpec: FiniteAnimationSpec<Float> = motion.fastEffectsSpec()
  private val shrink: FiniteAnimationSpec<Float> = motion.defaultSpatialSpec()

  /** A page pushed: the shared axis forward. */
  fun <T : Any> push(): AnimatedContentTransitionScope<Scene<T>>.() -> ContentTransform = {
    (slideInHorizontally(spatial) { shift } + fadeIn(fadeInSpec)) togetherWith (slideOutHorizontally(spatial) { -shift } + fadeOut(fadeOutSpec))
  }

  /** A page popped by the back button: the shared axis backward. */
  fun <T : Any> pop(): AnimatedContentTransitionScope<Scene<T>>.() -> ContentTransform = {
    (slideInHorizontally(spatial) { -shift } + fadeIn(fadeInSpec)) togetherWith (slideOutHorizontally(spatial) { shift } + fadeOut(fadeOutSpec))
  }

  /** A page popped by a predictive back from [edge]: it shrinks toward that edge as the one under it comes back. */
  fun <T : Any> predictivePop(): AnimatedContentTransitionScope<Scene<T>>.(Int) -> ContentTransform = { edge ->
    val toward = if (edge == BackEventCompat.EDGE_RIGHT) -shift else shift
    (slideInHorizontally(spatial) { -shift } + fadeIn(fadeInSpec)) togetherWith
      (scaleOut(shrink, targetScale = SHRUNK) + slideOutHorizontally(spatial) { toward } + fadeOut(fadeOutSpec))
  }

  private companion object {
    /** How small a page shrinks as a predictive back takes it, as the system's own. */
    const val SHRUNK = 0.9f
  }
}

/** The pages' motion in the theme's motion scheme. */
@Composable
fun rememberPageMotion(): PageMotion {
  val motion = MaterialTheme.motionScheme
  val shift = with(LocalDensity.current) { SHARED_AXIS_SHIFT.roundToPx() }
  return remember(motion, shift) { PageMotion(motion, shift) }
}

/** How far a page moves along the shared axis, Material's 30dp. */
private val SHARED_AXIS_SHIFT = 30.dp
