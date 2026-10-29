package app.pochical

import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.ComposeContentTestRule

/**
 * Waits for [navigator] to hold [routes], as a page that saves goes back only once its write returns.
 * The routes are read in a snapshot of their own: the v1 compose rule lets a page's coroutine resume
 * on the database's thread, so the page going back can change the stack while the test reads it, and
 * a snapshot reads it as it stood, whole.
 */
fun ComposeContentTestRule.awaitRoutes(navigator: RootNavigator, vararg routes: RootRoute) =
  waitUntil {
    val snapshot = Snapshot.takeSnapshot()
    try {
      snapshot.enter { navigator.routes } == routes.toList()
    } finally {
      snapshot.dispose()
    }
  }
