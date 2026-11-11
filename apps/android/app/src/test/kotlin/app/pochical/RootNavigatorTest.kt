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
  fun aGroupGoneTakesEveryPageOfItsOwnBackToTheTabs() {
    navigator.showGroup("g1", RootPage.Chat("g1", "group"))
    navigator.open(RootPage.GroupSettings("g1"))
    navigator.open(RootPage.GroupEnd("g1"))
    navigator.hold(setOf("g1", "g2"))
    assertEquals(listOf(Tabs, RootPage.Chat("g1", "group"), RootPage.GroupSettings("g1"), RootPage.GroupEnd("g1")), navigator.routes)

    // Ended, left from elsewhere or taken out: the person lands on グループ, whatever was on top.
    navigator.hold(setOf("g2"))
    assertEquals(listOf(Tabs), navigator.routes)
    assertEquals(RootTab.Groups, navigator.tab)
  }

  @Test
  fun pagesOfNoGroupAndTheChatWithPochicalsPeopleStayAsGroupsGo() {
    navigator.showOver(RootTab.Settings, RootPage.Chat(Chat.supportPlace, "group"))
    navigator.open(RootPage.Appearance)
    navigator.hold(emptySet())
    assertEquals(listOf(Tabs, RootPage.Chat(Chat.supportPlace, "group"), RootPage.Appearance), navigator.routes)
  }

  @Test
  fun aGroupJustMadeShowsWithItsInvitationAsItsCallAnswers() {
    navigator.select(RootTab.Groups)
    navigator.show(RootPage.NewGroup)
    navigator.showMade("g1", RootPage.GroupInvite("g1"))
    assertEquals(listOf(Tabs, RootPage.GroupInvite("g1")), navigator.routes)
    assertEquals("g1", navigator.openGroup)

    // Its Membership is still on its way: the pages stay, whatever else the device holds meanwhile.
    navigator.hold(emptySet())
    navigator.open(RootPage.GroupSettings("g1"))
    navigator.hold(setOf("g2"))
    assertEquals(listOf(Tabs, RootPage.GroupInvite("g1"), RootPage.GroupSettings("g1")), navigator.routes)

    // Held from now on, it goes as any group does.
    navigator.hold(setOf("g1", "g2"))
    assertEquals(listOf(Tabs, RootPage.GroupInvite("g1"), RootPage.GroupSettings("g1")), navigator.routes)
    navigator.hold(setOf("g2"))
    assertEquals(listOf(Tabs), navigator.routes)
  }

  @Test
  fun aGroupMadeAndGoneBackFromChangesNothingAsItsMembershipComes() {
    navigator.select(RootTab.Groups)
    navigator.showMade("g1", RootPage.GroupInvite("g1"))
    navigator.back()
    navigator.select(RootTab.Settings)
    navigator.open(RootPage.Appearance)

    navigator.hold(setOf("g1"))
    assertEquals(listOf(Tabs, RootPage.Appearance), navigator.routes)
    assertEquals(RootTab.Settings, navigator.tab)
  }

  @Test
  fun aGroupJustMadeThatTheUserIsOutOfBeforeTheDeviceHeldItClosesItsPages() {
    navigator.showMade("g1", RootPage.GroupInvite("g1"))
    navigator.left("g1")
    assertEquals(listOf(Tabs), navigator.routes)

    // And is no longer waited for: a page of it kept from elsewhere goes by the groups held.
    navigator.open(RootPage.GroupInvite("g1"))
    navigator.hold(emptySet())
    assertEquals(listOf(Tabs), navigator.routes)
  }

  @Test
  fun aGroupLeftClosesItsPagesAndNoOthers() {
    navigator.showGroup("g1", RootPage.Chat("g1", "group"))
    navigator.left("g2")
    assertEquals(listOf(Tabs, RootPage.Chat("g1", "group")), navigator.routes)
    navigator.left("g1")
    assertEquals(listOf(Tabs), navigator.routes)
  }
}
