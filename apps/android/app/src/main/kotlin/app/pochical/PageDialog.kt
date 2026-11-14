package app.pochical

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.window.core.layout.WindowSizeClass

/**
 * A page that opens over the one under it to be filled in and closed (グループを作る's アイコン, 終了日 and
 * あなたの名前と写真): Material's full-screen dialog on a phone's width, and on a wider window (medium
 * and up) its basic dialog, as Material 3 turns a full-screen dialog on a larger screen, so a few
 * rows never stretch across a tablet nor cover the page they belong to (spec/chat.md, The chat's page).
 * [content] fills what it is given, its top app bar and all, either way.
 */
@Composable
fun PageDialog(onDismissRequest: () -> Unit, content: @Composable () -> Unit) {
  val wide = currentWindowAdaptiveInfoV2().windowSizeClass.isWidthAtLeastBreakpoint(WindowSizeClass.WIDTH_DP_MEDIUM_LOWER_BOUND)
  Dialog(onDismissRequest, DialogProperties(usePlatformDefaultWidth = false)) {
    if (!wide) {
      Box(Modifier.fillMaxSize()) { content() }
    } else {
      Surface(Modifier.sizeIn(maxWidth = WIDE_WIDTH, maxHeight = WIDE_HEIGHT), shape = MaterialTheme.shapes.extraLarge) { content() }
    }
  }
}

/** The basic dialog's size on a wide window: Material's widest dialog, and as tall as a phone's page. */
private val WIDE_WIDTH = 560.dp
private val WIDE_HEIGHT = 720.dp
