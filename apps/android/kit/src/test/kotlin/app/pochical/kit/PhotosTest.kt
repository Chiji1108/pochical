package app.pochical.kit

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Paint
import app.pochical.design.Chat
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.Base64
import kotlin.math.abs
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

@Serializable
private data class ThumbHashVectors(val encode: List<Encode>, val decode: List<Decode>) {
  @Serializable data class Encode(override val name: String, val width: Int, val height: Int, val rgba: String, val thumbHash: String) : VectorCase

  @Serializable data class Decode(override val name: String, val thumbHash: String, val width: Int, val height: Int, val rgba: String) : VectorCase
}

private fun base64(text: String): ByteArray = Base64.getDecoder().decode(text)

/** A photo's ThumbHash as spec/vectors/thumbhash.json pins it, and photos shrunk to send. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PhotosTest {
  private val vectors = vectors<ThumbHashVectors>("thumbhash")

  @Test
  fun aPhotosThumbHashIsMade() {
    vectors.encode.checkEach({ it.thumbHash }) { Base64.getEncoder().encodeToString(ThumbHash.encode(it.width, it.height, base64(it.rgba))) }
    for (case in vectors.encode) assertTrue(case.name, base64(case.thumbHash).size <= Chat.photoThumbHashMaxBytes)
  }

  @Test
  fun aThumbHashDrawsItsBlur() {
    // Cosines may round differently from the reference's: each byte within 1.
    vectors.decode.checkEach({ "${it.width}x${it.height} within 1" }) { case ->
      val blur = ThumbHash.decode(base64(case.thumbHash)) ?: return@checkEach "none"
      val expected = base64(case.rgba)
      val near = blur.rgba.size == expected.size && blur.rgba.indices.all { abs((blur.rgba[it].toInt() and 255) - (expected[it].toInt() and 255)) <= 1 }
      "${blur.width}x${blur.height}" + if (near) " within 1" else " off"
    }
  }

  @Test
  fun bytesThatAreNoThumbHashDrawNothing() {
    assertNull(ThumbHash.decode(byteArrayOf(1, 2)))
  }

  @Test
  fun aPhotoIsShrunkUprightWithItsBlurTheRightWayUp() {
    // Red over blue, as wide as a photo past the longest side sent.
    val photo = Bitmap.createBitmap(3000, 4000, Bitmap.Config.ARGB_8888)
    Canvas(photo).apply {
      drawColor(Color.BLUE)
      drawRect(0f, 0f, 3000f, 2000f, Paint().apply { color = Color.RED })
    }
    val jpeg = ByteArrayOutputStream().also { photo.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()

    val shrunk = checkNotNull(PhotoShrinking.shrink(ImageDecoder.createSource(ByteBuffer.wrap(jpeg))))
    assertEquals(1536 to Chat.photoMaxEdge, shrunk.width to shrunk.height)
    assertTrue(shrunk.jpeg.size <= Chat.photoMaxBytes)
    val blur = checkNotNull(ThumbHash.decode(shrunk.thumbHash))
    val top = 0
    val bottom = (blur.height - 1) * blur.width * 4
    fun at(i: Int) = blur.rgba[i].toInt() and 255
    assertTrue(at(top) > at(top + 2))
    assertTrue(at(bottom + 2) > at(bottom))

    // Its small version for the lines, none for one no larger than that.
    val small = checkNotNull(PhotoShrinking.small(shrunk.jpeg))
    val read = checkNotNull(PhotoShrinking.upright(ImageDecoder.createSource(ByteBuffer.wrap(small)), Int.MAX_VALUE))
    assertEquals(720 to Chat.photoSmallEdge, read.width to read.height)
    assertNull(PhotoShrinking.small(small))
  }

  @Test
  fun whatIsNoPhotoIsNotShrunk() {
    assertNull(PhotoShrinking.shrink(ImageDecoder.createSource(ByteBuffer.wrap(byteArrayOf(1, 2, 3)))))
  }

  @Test
  fun photosUpAreTrustedForHalfTheGroupsWait() {
    val photos = listOf("p1", "p2", "p3")
    var up = PhotosUp()
    assertEquals(photos, up.toUpload(photos, now = 1_000))
    up = up.adding("p1", began = 2_000).adding("p2", began = 3_000)
    assertEquals(listOf("p3"), up.toUpload(photos, now = 4_000))
    // Timed from the latest's start: past half the wait, all of them go up again.
    val lapsed = 3_000 + PhotosUp.TRUSTED_FOR_MS
    assertEquals(listOf("p3"), up.toUpload(photos, now = lapsed - 1))
    assertEquals(photos, up.toUpload(photos, now = lapsed))
    assertEquals(listOf("p2", "p3"), up.adding("p1", began = lapsed).toUpload(photos, now = lapsed))
  }
}
