package app.pochical.groups

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import org.junit.Assert.assertEquals
import org.junit.Test

class CropPlaceTest {
  /** A landscape photo, its shorter side filling a frame 937 pixels across, a side that rounds. */
  private val photo = Size(1600f, 1200f)
  private val side = 937f

  @Test
  fun anUnmovedPhotoIsCutFromItsMiddle() {
    assertEquals(Triple(200, 0, 1200), CropPlace().cut(photo, side))
  }

  @Test
  fun aDragStopsWhereTheFrameMeetsThePhotosEdge() {
    val far = CropPlace().moved(Offset(5_000f, 5_000f), zoomBy = 1f, photo, side)
    assertEquals("left edge in the frame", Triple(0, 0, 1200), far.cut(photo, side))
    val back = far.moved(Offset(-10_000f, -10_000f), zoomBy = 1f, photo, side)
    assertEquals("right edge in the frame", Triple(400, 0, 1200), back.cut(photo, side))
  }

  @Test
  fun zoomStaysBetweenFillingTheFrameAndFourTimes() {
    assertEquals(1f, CropPlace().moved(Offset.Zero, zoomBy = 0.2f, photo, side).zoom)
    assertEquals(CropPlace.MAX_ZOOM, CropPlace().moved(Offset.Zero, zoomBy = 10f, photo, side).zoom)
  }

  @Test
  fun zoomingInKeepsWhatIsInTheMiddleOfTheFrame() {
    val zoomed = CropPlace().moved(Offset.Zero, zoomBy = 2f, photo, side)
    assertEquals(Triple(500, 300, 600), zoomed.cut(photo, side))
  }
}
