package app.pochical

import app.pochical.kit.DeviceSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

/**
 * What the first frame is drawn with, as the device keeps it, each null until it is first read:
 * the person's settings, and whether はじめの設定 is done. The splash stays until they are there.
 *
 * Held for the app, not by each activity: an activity made anew (the screen turned) has them at
 * once, so its first frame draws the screens the one before it showed. What those screens hold
 * over a window made anew (retain: what a page read, a group being made) is kept only for
 * screens drawn again in that first frame, and an activity that read these again first drew
 * nothing in it (#1178). Read while a screen is there to draw them, and kept as last read between.
 */
class FirstFrame(settings: Flow<DeviceSettings>, firstRunDone: Flow<Boolean>, scope: CoroutineScope) {
  val settings: StateFlow<DeviceSettings?> = settings.stateIn(scope, SharingStarted.WhileSubscribed(), null)
  val firstRunDone: StateFlow<Boolean?> = firstRunDone.stateIn(scope, SharingStarted.WhileSubscribed(), null)
}
