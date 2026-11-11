package app.pochical

import androidx.compose.runtime.mutableStateOf
import androidx.navigation3.runtime.NavBackStack
import app.pochical.design.Chat
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

  @Test
  fun anotherTabComesWithoutThePagesOfTheOneLeft() {
    navigator.select(RootTab.Settings)
    navigator.open(RootPage.Patterns)
    navigator.select(RootTab.Settings)
    assertEquals(listOf(Tabs, RootPage.Patterns), navigator.routes)

    navigator.select(RootTab.Groups)
    assertEquals(listOf(Tabs), navigator.routes)
    assertEquals(RootTab.Groups, navigator.tab)
  }

  @Test
  fun anotherGroupComesWithoutThePagesOfTheOneLeft() {
    navigator.showGroup("g1", RootPage.Chat("g1", "group"))
    navigator.pickGroup("g2")
    assertEquals(listOf(Tabs), navigator.routes)
    assertEquals("g2", navigator.openGroup)
  }

  @Test
  fun aPageOpenedFromTheTabsTakesThePlaceOfThoseOpen() {
    navigator.select(RootTab.Groups)
    navigator.show(RootPage.Chat("g1", "group"))
    navigator.open(RootPage.ChatPhotos("g1", "group"))
    navigator.show(RootPage.GroupShifts("g1"))
    assertEquals(listOf(Tabs, RootPage.GroupShifts("g1")), navigator.routes)

    // The same page picked again stays the one open, not a second copy of it.
    navigator.show(RootPage.GroupShifts("g1"))
    assertEquals(listOf(Tabs, RootPage.GroupShifts("g1")), navigator.routes)
  }

  @Test
  fun aGroupLeftTakesEveryPageOfItsOwnBackToTheTabsAndNoOthers() {
    navigator.showGroup("g1", RootPage.Chat("g1", "group"))
    navigator.open(RootPage.GroupSettings("g1"))
    navigator.open(RootPage.GroupEnd("g1"))
    navigator.left("g2")
    assertEquals(listOf(Tabs, RootPage.Chat("g1", "group"), RootPage.GroupSettings("g1"), RootPage.GroupEnd("g1")), navigator.routes)

    // Ended, left from elsewhere or taken out: the person lands on グループ, whatever was on top.
    navigator.left("g1")
    assertEquals(listOf(Tabs), navigator.routes)
    assertEquals(RootTab.Groups, navigator.tab)
  }

  @Test
  fun aGroupJustMadeShowsWithItsInvitationAsItsCallAnswersAndStays() {
    navigator.select(RootTab.Groups)
    navigator.show(RootPage.NewGroup)
    // Its Membership is still on its way: nothing closes its pages but its leaving.
    navigator.showGroup("g1", RootPage.GroupInvite("g1"))
    navigator.left("g2")
    assertEquals(listOf(Tabs, RootPage.GroupInvite("g1")), navigator.routes)
    assertEquals("g1", navigator.openGroup)
  }

  @Test
  fun pagesRestoredGoByTheGroupsHeldThen() {
    navigator.showGroup("g1", RootPage.Chat("g1", "group"))
    navigator.open(RootPage.GroupSettings("g1"))
    navigator.restored(setOf("g1", "g2"))
    assertEquals(listOf(Tabs, RootPage.Chat("g1", "group"), RootPage.GroupSettings("g1")), navigator.routes)

    // Left while the app was not there to hear of it.
    navigator.restored(setOf("g2"))
    assertEquals(listOf(Tabs), navigator.routes)
  }

  @Test
  fun pagesOfNoGroupAndTheChatWithPochicalsPeopleStayAsPagesAreRestored() {
    navigator.showOver(RootTab.Settings, RootPage.Chat(Chat.supportPlace, "group"))
    navigator.open(RootPage.Appearance)
    navigator.restored(emptySet())
    navigator.left(Chat.supportPlace + "x")
    assertEquals(listOf(Tabs, RootPage.Chat(Chat.supportPlace, "group"), RootPage.Appearance), navigator.routes)
  }
}
