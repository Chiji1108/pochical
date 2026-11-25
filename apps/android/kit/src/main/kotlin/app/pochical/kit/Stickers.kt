package app.pochical.kit

import android.graphics.Bitmap
import android.graphics.ColorSpace
import android.graphics.ImageDecoder
import android.os.Build
import app.pochical.design.Chat
import app.pochical.v1.ChatSticker
import app.pochical.v1.chatSticker
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// A sticker the keyboard gives, as it is sent (spec/chat.md, Stickers): WebP or GIF, still or
// moving, its see-through parts kept, as iOS's ChatStickers.swift writes its own.

/** A sticker as it goes up: WebP or GIF within `chatRules.stickerMaxBytes`, its longer side within `chatRules.stickerMaxEdge`. */
class StickerFile(val bytes: ByteArray, val width: Int, val height: Int) {
  /** The sticker as its line sends it, under [id]. */
  fun line(id: String): ChatSticker = chatSticker {
    this.id = id
    width = this@StickerFile.width
    height = this@StickerFile.height
  }
}

/** Writing what the keyboard gave as a sticker to send. */
object StickerEncoding {
  /**
   * The keyboard's image as a sticker to send; null for what the device cannot read as one. A
   * moving one (an animated GIF or WebP), which Android cannot write again, goes as it came while
   * within both limits; any other, and a moving one past either, goes as its first frame, written
   * again from its pixels as WebP, so nothing else of the file leaves the phone.
   */
  fun encode(bytes: ByteArray): StickerFile? {
    var animated = false
    var longer = 0
    val image =
      try {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(bytes))) { decoder, info, _ ->
          animated = info.isAnimated
          val width = info.size.width
          val height = info.size.height
          longer = max(width, height)
          val scale = min(Chat.stickerMaxEdge.toDouble() / max(width, height), 1.0)
          decoder.setTargetSize(max(1, (width * scale).roundToInt()), max(1, (height * scale).roundToInt()))
          // Its pixels written again, which a hardware bitmap does not allow.
          decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
          decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB))
        }
      } catch (_: Exception) {
        return null
      }
    if (animated && longer <= Chat.stickerMaxEdge && bytes.size <= Chat.stickerMaxBytes && imageType(bytes) in MOVING) return StickerFile(bytes, image.width, image.height)
    return webp(image)?.let { StickerFile(it, image.width, image.height) }
  }

  /** A still image as WebP, its see-through parts kept, at a quality that keeps it within `chatRules.stickerMaxBytes`; only its pixels go. */
  private fun webp(image: Bitmap): ByteArray? {
    val format =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY
      // Lossy at a quality below 100 before API 30, as WEBP_LOSSY is from then on.
      else @Suppress("DEPRECATION") Bitmap.CompressFormat.WEBP
    for (quality in listOf(90, 75, 50)) {
      val out = ByteArrayOutputStream()
      if (!image.compress(format, quality, out)) return null
      if (out.size() <= Chat.stickerMaxBytes) return out.toByteArray()
    }
    return null
  }

  /** The kinds a moving sticker goes as, both phones drawing them moving. */
  private val MOVING = setOf(WEBP, GIF)
}

/**
 * What an image the device sends to a group is, by its first bytes, as the server tells it: a
 * photo's JPEG, or a sticker's WebP (RIFF....WEBP) or GIF; null for anything else.
 */
internal fun imageType(bytes: ByteArray): String? {
  fun at(offset: Int, start: String) = start.indices.all { bytes.getOrNull(offset + it) == start[it].code.toByte() }
  return when {
    bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte() -> JPEG
    at(0, "RIFF") && at(8, "WEBP") -> WEBP
    at(0, "GIF87a") || at(0, "GIF89a") -> GIF
    else -> null
  }
}

internal const val JPEG = "image/jpeg"
private const val WEBP = "image/webp"
private const val GIF = "image/gif"
