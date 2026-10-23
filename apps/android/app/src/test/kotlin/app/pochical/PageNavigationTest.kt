package app.pochical

import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.navigation3.runtime.NavBackStack
import org.junit.Assert.assertEquals
import org.junit.Test

class PageNavigationTest {
  private val navigator = RootNavigator(NavBackStack(), mutableStateOf(RootTab.Settings))
  private val owner =
    object : LifecycleOwner {
      override val lifecycle = LifecycleRegistry.createUnsafe(this)
    }
  private val navigation = PageNavigation(navigator, owner.lifecycle)

  @Test
  fun aPageStillComingAsksNothing() {
    owner.lifecycle.currentState = Lifecycle.State.STARTED
    navigation.open(RootPage.Appearance)
    navigation.select(RootTab.Groups)

    assertEquals(listOf(Tabs), navigator.routes)
    assertEquals(RootTab.Settings, navigator.tab)
  }

  @Test
  fun aSecondTapAsTheFirstPageComesOpensItOnce() {
    owner.lifecycle.currentState = Lifecycle.State.RESUMED
    navigation.open(RootPage.Appearance)
    // The tabs leave as the page comes in over them.
    owner.lifecycle.currentState = Lifecycle.State.STARTED
    navigation.open(RootPage.Appearance)

    assertEquals(listOf(Tabs, RootPage.Appearance), navigator.routes)
  }
}
