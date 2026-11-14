package app.pochical

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.window.core.layout.WindowSizeClass

/**
 * A page opened over another to be filled in and closed (a group's アイコン, 終了日, あなたの名前と写真):
 * Material's full-screen dialog on a phone, and on a window medium wide and tall and up its basic
 * dialog, as Material 3 turns a full-screen dialog on a larger screen, so a few rows never stretch
 * across a tablet nor cover the page they belong to (spec/chat.md, The chat's page). A tap beside it
 * does not close it, so nothing half filled in is lost; its × and back do. [content] fills what it
 * is given, its top app bar and all, either way, in one place, so it keeps its state as the window
 * crosses between the two.
 */
@Composable
fun PageDialog(onDismissRequest: () -> Unit, content: @Composable () -> Unit) {
  val sizes = currentWindowAdaptiveInfoV2().windowSizeClass
  val wide =
    sizes.isWidthAtLeastBreakpoint(WindowSizeClass.WIDTH_DP_MEDIUM_LOWER_BOUND) &&
      sizes.isHeightAtLeastBreakpoint(WindowSizeClass.HEIGHT_DP_MEDIUM_LOWER_BOUND)
  Dialog(onDismissRequest, DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false)) {
    Surface(
      if (wide) Modifier.sizeIn(maxWidth = WIDE_WIDTH, maxHeight = WIDE_HEIGHT) else Modifier.fillMaxSize(),
      shape = if (wide) MaterialTheme.shapes.extraLarge else RectangleShape,
      content = content,
    )
  }
}

/** The basic dialog's size on a wide window: Material's widest dialog, and as tall as a phone's page. */
private val WIDE_WIDTH = 560.dp
private val WIDE_HEIGHT = 720.dp
