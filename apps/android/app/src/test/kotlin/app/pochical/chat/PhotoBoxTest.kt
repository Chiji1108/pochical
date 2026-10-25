package app.pochical.chat

import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import app.pochical.v1.chatPhoto
import org.junit.Assert.assertEquals
import org.junit.Test

/** A photo keeps the shape it was sent at within 220×260, its ends cut past 2:1 and 1:2 (spec/chat.md, Photos). */
class PhotoBoxTest {
  private fun size(width: Int, height: Int) = PhotoBox.size(chatPhoto { this.width = width; this.height = height })

  @Test
  fun aPhotoKeepsItsShapeWithinTheBox() {
    assertEquals(DpSize(220.dp, 165.dp), size(2048, 1536))
    assertEquals(DpSize(195.dp, 260.dp), size(1536, 2048))
    assertEquals(DpSize(220.dp, 220.dp), size(900, 900))
  }

  @Test
  fun aPanoramaIsCutAtItsEnds() {
    assertEquals(DpSize(220.dp, 110.dp), size(4000, 1000))
    assertEquals(DpSize(130.dp, 260.dp), size(500, 3000))
  }

  @Test
  fun aPhotoSentWithoutItsSizeIsSquare() {
    assertEquals(DpSize(220.dp, 220.dp), size(0, 0))
  }
}
