package app.pochical

import androidx.compose.ui.test.junit4.ComposeContentTestRule

/**
 * Waits for [navigator] to hold [routes], as a page that saves goes back only once its write returns.
 * The routes are read on the UI thread, where the pages change: read from the test's own thread, a
 * page going back meanwhile would change the list under the read.
 */
fun ComposeContentTestRule.awaitRoutes(navigator: RootNavigator, vararg routes: RootRoute) =
  waitUntil { runOnUiThread { navigator.routes } == routes.toList() }
