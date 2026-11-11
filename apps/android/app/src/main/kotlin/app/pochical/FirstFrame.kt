package app.pochical

import app.pochical.calendar.OwnDays
import app.pochical.kit.DeviceSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn

/**
 * What the first frame is drawn with, as the device keeps it, which the splash stays for: the
 * person's settings and whether はじめの設定 is done, each null until first read, and whether their
 * days are read.
 *
 * Held for the app, not by each activity: an activity made anew (the screen turned) has them at
 * once, so its first frame draws the screens the one before it showed. What those screens hold
 * over a window made anew (retain: what a page read) is kept only for screens drawn again in that
 * first frame, and an activity that read these again first drew nothing in it (#1178). Read from
 * the app's start and followed as they change, so none is ever one an activity made anew draws
 * for a frame before the one the device keeps now.
 */
class FirstFrame(settings: Flow<DeviceSettings>, firstRunDone: Flow<Boolean>, days: OwnDays, scope: CoroutineScope) {
  val settings: StateFlow<DeviceSettings?> = settings.stateIn(scope, SharingStarted.Eagerly, null)
  val firstRunDone: StateFlow<Boolean?> = firstRunDone.stateIn(scope, SharingStarted.Eagerly, null)

  /** Whether the calendar holds what the device keeps, not the nothing it starts from. */
  val daysRead: StateFlow<Boolean> =
    flow {
        days.awaitRead()
        emit(true)
      }
      .stateIn(scope, SharingStarted.Eagerly, false)
}
