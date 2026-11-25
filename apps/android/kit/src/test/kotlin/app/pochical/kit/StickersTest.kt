package app.pochical.kit

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Paint
import app.pochical.design.Chat
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

/** Stickers as the keyboard gives them, written to send (spec/chat.md, Stickers). */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StickersTest {
  @Test
  fun aStillOneGoesAsWebpShrunkWithItsSeeThroughKept() {
    val drawn = Bitmap.createBitmap(1024, 768, Bitmap.Config.ARGB_8888)
    Canvas(drawn).drawCircle(512f, 384f, 300f, Paint().apply { color = Color.RED })
    val png = ByteArrayOutputStream().also { drawn.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()

    val sticker = checkNotNull(StickerEncoding.encode(png))
    assertEquals("image/webp", imageType(sticker.bytes))
    assertEquals(Chat.stickerMaxEdge to 384, sticker.width to sticker.height)
    assertTrue(sticker.bytes.size <= Chat.stickerMaxBytes)
    val read = decoded(sticker.bytes)
    assertEquals(sticker.width to sticker.height, read.width to read.height)
    // Its corner see-through still, its middle red.
    assertEquals(0, Color.alpha(read.getPixel(1, 1)))
    assertTrue(Color.red(read.getPixel(256, 192)) > 240 && Color.alpha(read.getPixel(256, 192)) == 255)
  }

  @Test
  fun aMovingOneWithinTheLimitsGoesAsItCame() {
    val moving = gif(64, 48, frames = 3)
    val sticker = checkNotNull(StickerEncoding.encode(moving))
    assertArrayEquals(moving, sticker.bytes)
    assertEquals(64 to 48, sticker.width to sticker.height)
  }

  @Test
  fun aMovingOnePastTheEdgeGoesAsItsFirstFrameStill() {
    val sticker = checkNotNull(StickerEncoding.encode(gif(600, 600, frames = 2)))
    assertEquals("image/webp", imageType(sticker.bytes))
    assertEquals(Chat.stickerMaxEdge to Chat.stickerMaxEdge, sticker.width to sticker.height)
    // Its first frame's color.
    val pixel = decoded(sticker.bytes).getPixel(10, 10)
    assertTrue(Color.red(pixel) > 240 && Color.green(pixel) < 16)
  }

  @Test
  fun aGifOfOneFrameIsStillAndWrittenAgain() {
    val sticker = checkNotNull(StickerEncoding.encode(gif(32, 32, frames = 1)))
    assertEquals("image/webp", imageType(sticker.bytes))
  }

  @Test
  fun whatIsNoImageIsNoSticker() {
    assertNull(StickerEncoding.encode(byteArrayOf(1, 2, 3)))
  }

  @Test
  fun anImageIsToldByItsBytes() {
    assertEquals("image/jpeg", imageType(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0)))
    assertEquals("image/gif", imageType(gif(1, 1, frames = 1)))
    assertEquals("image/webp", imageType("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ".toByteArray()))
    assertNull(imageType("RIFF\u0000\u0000\u0000\u0000WAVE".toByteArray()))
    assertNull(imageType(byteArrayOf()))
  }

  private fun decoded(bytes: ByteArray): Bitmap =
    ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(bytes))) { decoder, _, _ -> decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE }

  /**
   * A GIF of [frames] frames, each filled with one color (red, then green, then blue), looping:
   * moving with more than one. Its LZW codes stay 3 bits, a clear code before every two pixels.
   */
  private fun gif(width: Int, height: Int, frames: Int): ByteArray {
    val out = ByteArrayOutputStream()
    fun short(value: Int) = out.write(byteArrayOf(value.toByte(), (value shr 8).toByte()))
    out.write("GIF89a".toByteArray())
    short(width)
    short(height)
    // A global table of four colors: black, red, green, blue.
    out.write(byteArrayOf(0xF1.toByte(), 0, 0))
    out.write(byteArrayOf(0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1))
    if (frames > 1) {
      out.write(byteArrayOf(0x21, 0xFF.toByte(), 0x0B))
      out.write("NETSCAPE2.0".toByteArray())
      out.write(byteArrayOf(3, 1, 0, 0, 0))
    }
    repeat(frames) { frame ->
      // A tenth of a second each.
      out.write(byteArrayOf(0x21, 0xF9.toByte(), 4, 0x04, 10, 0, 0, 0))
      out.write(0x2C)
      short(0)
      short(0)
      short(width)
      short(height)
      out.write(0)
      out.write(2)
      val codes = mutableListOf<Int>()
      val color = 1 + frame % 3
      for (at in 0 until width * height step 2) {
        codes += 4
        codes += color
        if (at + 1 < width * height) codes += color
      }
      codes += 5
      val packed = ByteArrayOutputStream()
      var bits = 0L
      var count = 0
      for (code in codes) {
        bits = bits or (code.toLong() shl count)
        count += 3
        while (count >= 8) {
          packed.write((bits and 0xFF).toInt())
          bits = bits shr 8
          count -= 8
        }
      }
      if (count > 0) packed.write((bits and 0xFF).toInt())
      for (block in packed.toByteArray().toList().chunked(255)) {
        out.write(block.size)
        out.write(block.toByteArray())
      }
      out.write(0)
    }
    out.write(0x3B)
    return out.toByteArray()
  }
}
