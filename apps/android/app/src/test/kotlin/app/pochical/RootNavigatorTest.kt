package app.pochical

import androidx.compose.runtime.mutableStateOf
import androidx.navigation3.runtime.NavBackStack
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RootNavigatorTest {
  private val navigator = RootNavigator(NavBackStack(), mutableStateOf(RootTab.Calendar))

  @Test
  fun opensOnTheCalendarWithNothingOverIt() {
    assertEquals(listOf(Tabs), navigator.routes)
    assertEquals(RootTab.Calendar, navigator.tab)
    assertFalse(navigator.backGoesToFirstTab)
  }

  @Test
  fun aPageGoesOverTheTabsAndBackTakesItAway() {
    navigator.select(RootTab.Settings)
    navigator.open(RootPage.Appearance)
    assertEquals(listOf(Tabs, RootPage.Appearance), navigator.routes)
    assertFalse(navigator.backGoesToFirstTab)

    navigator.back()
    assertEquals(listOf(Tabs), navigator.routes)
    assertEquals(RootTab.Settings, navigator.tab)
  }

  @Test
  fun backOnAnotherTabGoesToTheCalendarBeforeLeaving() {
    navigator.select(RootTab.Groups)
    assertTrue(navigator.backGoesToFirstTab)

    navigator.back()
    assertEquals(RootTab.Calendar, navigator.tab)
    assertFalse(navigator.backGoesToFirstTab)
  }

  @Test
  fun aChatOpenedFromANotificationShowsOverItsTabAlone() {
    navigator.open(RootPage.Appearance)
    navigator.showOver(RootTab.Settings, RootPage.Chat("support", "group"))
    assertEquals(listOf(Tabs, RootPage.Chat("support", "group")), navigator.routes)
    assertEquals(RootTab.Settings, navigator.tab)

    navigator.showGroup("g1", RootPage.Chat("g1", "group"))
    assertEquals(listOf(Tabs, RootPage.Chat("g1", "group")), navigator.routes)
    assertEquals(RootTab.Groups, navigator.tab)
    assertEquals("g1", navigator.openGroup)
  }
}
