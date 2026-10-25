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
 * its small version (null for one no larger than `chatRules.photoSmallEdge`) and its ThumbHash.
 */
class ShrunkPhoto(val jpeg: ByteArray, val width: Int, val height: Int, val thumbHash: ByteArray, val small: ByteArray? = null) {
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
    // Made once, from the pixels at hand, however many times the photo goes up.
    val longer = max(image.width, image.height)
    val small =
      if (longer <= Chat.photoSmallEdge) null
      else {
        val scale = Chat.photoSmallEdge.toDouble() / longer
        jpeg(Bitmap.createScaledBitmap(image, max(1, (image.width * scale).roundToInt()), max(1, (image.height * scale).roundToInt()), true))
      }
    return ShrunkPhoto(jpeg, image.width, image.height, ThumbHash.of(image), small)
  }

  /**
   * The photo's small version to send beside it, its longer side at `chatRules.photoSmallEdge`, for
   * the chat's lines and quotes to fetch in its place; null when the photo is no larger than that.
   * Made again from the photo as kept to show, when the one made as it was shrunk is gone.
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

  /** Its small version, kept beside it until it is up. */
  private fun pendingSmall(groupId: String, photoId: String) = File(files, "pending-photos/$groupId/$photoId.small.jpg")

  /** Keeps the member's own photo to send: until it is up, with its small version, and to show. */
  internal suspend fun keep(groupId: String, photoId: String, photo: ShrunkPhoto) =
    withContext(Dispatchers.IO) {
      val kept = listOf(pending(groupId, photoId) to photo.jpeg, shown(groupId, photoId) to photo.jpeg) + listOfNotNull(photo.small?.let { pendingSmall(groupId, photoId) to it })
      for ((file, bytes) in kept) {
        file.parentFile?.mkdirs()
        file.writeBytes(bytes)
      }
    }

  /**
   * The photo's bytes to upload, and its small version's: the copies kept to send, else the one kept
   * to show and a small version made from it again; null once the photo is gone from the device.
   */
  internal suspend fun toUpload(groupId: String, photoId: String): Pair<ByteArray, ByteArray?>? =
    withContext(Dispatchers.IO) {
      val pending = pending(groupId, photoId)
      if (pending.exists()) return@withContext pending.readBytes() to pendingSmall(groupId, photoId).takeIf { it.exists() }?.readBytes()
      val shown = shown(groupId, photoId).takeIf { it.exists() }?.readBytes() ?: return@withContext null
      shown to PhotoShrinking.small(shown)
    }

  /** It is up: only the copy to show stays. */
  internal suspend fun up(groupId: String, photoId: String) {
    withContext(Dispatchers.IO) {
      pending(groupId, photoId).delete()
      pendingSmall(groupId, photoId).delete()
    }
  }

  /** Where the member's own photo is held on the device, sent or waiting to go, if it is. */
  suspend fun held(groupId: String, photoId: String): File? =
    withContext(Dispatchers.IO) { listOf(shown(groupId, photoId), pending(groupId, photoId)).firstOrNull { it.exists() } }

  /** Takes photos off the device, as their line is taken back or deleted before it went. */
  internal suspend fun forget(groupId: String, photoIds: List<String>) {
    if (photoIds.isEmpty()) return
    withContext(Dispatchers.IO) {
      for (id in photoIds) {
        shown(groupId, id).delete()
        pending(groupId, id).delete()
        pendingSmall(groupId, id).delete()
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
