package app.pochical.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WidgetChoiceTest {
  @Test
  fun keepsWhoAWidgetIsSetToAsIOSDoes() {
    for (choice in listOf(WidgetChoice.Group("g1"), WidgetChoice.Member("g1", "u1"))) {
      assertEquals(choice, WidgetChoice.of(choice.id))
    }
    assertEquals("g:g1", WidgetChoice.Group("g1").id)
    assertEquals("m:g1:u1", WidgetChoice.Member("g1", "u1").id)
  }

  @Test
  fun readsNobodyFromWhatItCannotRead() {
    for (id in listOf(null, "", "g", "x:g1", "m:g1", "g:g1:u1")) assertNull(id, WidgetChoice.of(id))
  }
}
