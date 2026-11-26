package app.pochical

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity

/**
 * Where the window is folded across, in the window's pixels, while the device stands half folded on
 * a table (Material's tabletop posture): a hinge that runs side to side and parts the screen.
 */
@Composable
fun tabletopHinge(): Rect? =
  currentWindowAdaptiveInfoV2().windowPosture.let { posture ->
    if (!posture.isTabletop) null else posture.hingeList.firstOrNull { it.isSeparating && !it.isVertical }?.bounds
  }

/**
 * A screen parted at a table's [hinge] (spec/calendar.md, On a table): [top] what is looked at, above
 * the fold, standing up; [bottom] what is touched, below it, lying on the table.
 */
@Composable
fun TabletopSplit(hinge: Rect, modifier: Modifier = Modifier, top: @Composable () -> Unit, bottom: @Composable () -> Unit) {
  val density = LocalDensity.current
  // How far down the window this screen starts, as the hinge is told in the window's pixels.
  var start by remember { mutableFloatStateOf(0f) }
  Column(modifier.fillMaxSize().onPlaced { start = it.positionInWindow().y }) {
    Box(Modifier.fillMaxWidth().height(with(density) { (hinge.top - start).coerceAtLeast(0f).toDp() })) { top() }
    Spacer(Modifier.height(with(density) { hinge.height.toDp() }))
    Box(Modifier.fillMaxWidth().weight(1f)) { bottom() }
  }
}
