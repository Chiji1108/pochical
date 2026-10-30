package app.pochical

import androidx.compose.ui.test.junit4.ComposeContentTestRule

/** Waits for [navigator] to hold [routes], as a page that saves goes back only once its write returns. */
fun ComposeContentTestRule.awaitRoutes(navigator: RootNavigator, vararg routes: RootRoute) =
  waitUntil { navigator.routes == routes.toList() }
