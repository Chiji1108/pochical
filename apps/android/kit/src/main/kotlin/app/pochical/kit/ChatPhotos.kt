package app.pochical.kit

import android.graphics.Bitmap
import android.graphics.ColorSpace
import android.graphics.ImageDecoder
import app.pochical.design.Chat
import app.pochical.v1.ChatPhoto
import app.pochical.v1.chatPhoto
import com.google.protobuf.ByteString
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.withContext

// The chats' photos on the device (spec/chat.md, Photos): shrinking one to send, keeping the
// sender's own until it is up and to show, and letting go of them, as iOS's ChatPhotos.swift does.

/**
 * A photo shrunk to send: a JPEG no larger than `chatRules.photoMaxEdge` on its longer side, drawn
 * again from its pixels so none of the original's metadata (its location among them) goes along,
 * and its ThumbHash.
 */
class ShrunkPhoto(val jpeg: ByteArray, val width: Int, val height: Int, val thumbHash: ByteArray) {
  /** The photo as its line sends it, under [id]. */
  fun line(id: String): ChatPhoto = chatPhoto {
    this.id = id
    width = this@ShrunkPhoto.width
    height = this@ShrunkPhoto.height
    thumbHash = ByteString.copyFrom(this@ShrunkPhoto.thumbHash)
  }
}

/** Shrinking photos to send, the same however they were picked. */
object PhotoShrinking {
  /**
   * Shrinks a picked photo to send, turned upright, its longer side at most [maxEdge], as JPEG at a
   * quality that keeps it within `chatRules.photoMaxBytes`; null for what the device cannot read as
   * a photo.
   */
  fun shrink(source: ImageDecoder.Source, maxEdge: Int = Chat.photoMaxEdge): ShrunkPhoto? {
    val image = upright(source, maxEdge) ?: return null
    val jpeg = jpeg(image) ?: return null
    return ShrunkPhoto(jpeg, image.width, image.height, ThumbHash.of(image))
  }

  /**
   * The photo's small version to send beside it, its longer side at `chatRules.photoSmallEdge`, for
   * the chat's lines and quotes to fetch in its place; null when the photo is no larger than that.
   */
  fun small(jpeg: ByteArray): ByteArray? {
    var larger = false
    val image =
      decode(ImageDecoder.createSource(ByteBuffer.wrap(jpeg)), Chat.photoSmallEdge) { width, height -> larger = max(width, height) > Chat.photoSmallEdge }
    return image?.takeIf { larger }?.let(::jpeg)
  }

  /**
   * A photo read turned upright (ImageDecoder turns it by its EXIF), its longer side at most
   * [maxEdge], straight at that size rather than decoded whole and shrunk, in sRGB as a JPEG is
   * shown; null for what is not a photo the device can read.
   */
  fun upright(source: ImageDecoder.Source, maxEdge: Int): Bitmap? = decode(source, maxEdge) { _, _ -> }

  private fun decode(source: ImageDecoder.Source, maxEdge: Int, sized: (Int, Int) -> Unit): Bitmap? =
    try {
      ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
        val width = info.size.width
        val height = info.size.height
        sized(width, height)
        val scale = min(maxEdge.toDouble() / max(width, height), 1.0)
        decoder.setTargetSize(max(1, (width * scale).roundToInt()), max(1, (height * scale).roundToInt()))
        // Its pixels read and written again, which a hardware bitmap does not allow.
        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB))
      }
    } catch (_: Exception) {
      null
    }

  /**
   * An image as JPEG at a quality that keeps it within `chatRules.photoMaxBytes`, with only its
   * pixels: Bitmap.compress writes no EXIF, GPS or other metadata.
   */
  private fun jpeg(image: Bitmap): ByteArray? {
    for (quality in listOf(80, 60, 40)) {
      val out = ByteArrayOutputStream()
      if (!image.compress(Bitmap.CompressFormat.JPEG, quality, out)) return null
      if (out.size() <= Chat.photoMaxBytes) return out.toByteArray()
    }
    return null
  }
}

/** A photo the device let go of, or every one ([photoId] null), for the app's image cache to let go of it too. */
data class ForgottenPhoto(val shelf: PhotoShelf?, val photoId: String?)

/**
 * Where the chats' photos are on the device: the member's own as sent, held among the caches to
 * show (the system may empty them, and they are fetched again), and, until it is up, a copy of each
 * kept out of the caches to upload. The group's photos the app's image cache keeps, within its limit.
 */
class ChatPhotoFiles internal constructor(private val caches: File, private val files: File) {
  private val mutableForgotten = MutableSharedFlow<ForgottenPhoto>(extraBufferCapacity = 64)

  /** The photos let go of, as they are. */
  val forgotten: SharedFlow<ForgottenPhoto> = mutableForgotten.asSharedFlow()

  private fun shown(groupId: String, photoId: String) = File(caches, "chat-photos/$groupId/$photoId.jpg")

  internal fun pending(groupId: String, photoId: String) = File(files, "pending-photos/$groupId/$photoId.jpg")

  /** Keeps the member's own photo to send: until it is up, and to show. */
  internal suspend fun keep(groupId: String, photoId: String, jpeg: ByteArray) =
    withContext(Dispatchers.IO) {
      for (file in listOf(pending(groupId, photoId), shown(groupId, photoId))) {
        file.parentFile?.mkdirs()
        file.writeBytes(jpeg)
      }
    }

  /** The photo's bytes to upload: the copy kept to send, else the one kept to show; null once both are gone. */
  internal suspend fun toUpload(groupId: String, photoId: String): ByteArray? =
    withContext(Dispatchers.IO) { listOf(pending(groupId, photoId), shown(groupId, photoId)).firstOrNull { it.exists() }?.readBytes() }

  /** It is up: only the copy to show stays. */
  internal suspend fun up(groupId: String, photoId: String) {
    withContext(Dispatchers.IO) { pending(groupId, photoId).delete() }
  }

  /** Where the member's own photo is held on the device, sent or waiting to go, if it is. */
  fun held(groupId: String, photoId: String): File? = listOf(shown(groupId, photoId), pending(groupId, photoId)).firstOrNull { it.exists() }

  /** Takes photos off the device, as their line is taken back or deleted before it went. */
  internal suspend fun forget(groupId: String, photoIds: List<String>) {
    if (photoIds.isEmpty()) return
    withContext(Dispatchers.IO) {
      for (id in photoIds) {
        shown(groupId, id).delete()
        pending(groupId, id).delete()
      }
    }
    for (id in photoIds) mutableForgotten.emit(ForgottenPhoto(PhotoShelf.Group(groupId), id))
  }

  /** Every photo kept, to send or to show, gone with the user. */
  internal suspend fun eraseAll() {
    withContext(Dispatchers.IO) {
      File(caches, "chat-photos").deleteRecursively()
      File(files, "pending-photos").deleteRecursively()
    }
    mutableForgotten.emit(ForgottenPhoto(null, null))
  }
}
