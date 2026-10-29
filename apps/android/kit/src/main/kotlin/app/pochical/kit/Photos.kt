package app.pochical.kit

import app.pochical.design.Chat
import java.io.File
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import okio.BufferedSink

/** Where a photo is kept on the server, and read and sent there. */
sealed interface PhotoShelf {
  /** The path its photos are under, ending in "/". */
  val path: String

  /** The user's own photos, their usual one or a group mark they picked (/v1/me/photos/{id}). */
  data object Mine : PhotoShelf {
    override val path = "v1/me/photos/"
  }

  /** A group's photos, read by its members (/v1/groups/{groupId}/photos/{id}). */
  data class Group(val groupId: String) : PhotoShelf {
    override val path = "v1/groups/$groupId/photos/"
  }

  /** The photos of the user's chat with Pochical's people (/v1/support/photos/{id}). */
  data object Support : PhotoShelf {
    override val path = "v1/support/photos/"
  }

  /** Links' pages' pictures, kept by the server with the preview, read by signed-in users (/v1/previews/{id}). */
  data object Previews : PhotoShelf {
    override val path = "v1/previews/"
  }

  /** The faces of a group a live invitation opens, read by its holder (/v1/invites/{code}/photos/{id}). */
  data class Invitation(val code: String) : PhotoShelf {
    override val path = "v1/invites/$code/photos/"
  }

  /** The chats' place the shelf keeps the photos of, by the id the device keeps its chats by; null for none. */
  val placeId: String?
    get() =
      when (this) {
        is Group -> groupId
        Support -> Chat.supportPlace
        else -> null
      }

  companion object {
    /** Where the chats of the place the device keeps by [placeId] keep their photos: a group's, or the chat with Pochical's people's. */
    fun place(placeId: String): PhotoShelf = if (placeId == Chat.supportPlace) Support else Group(placeId)
  }
}

/** The usual photo as the person changes it: a new one, or none. */
sealed interface UsualPhoto {
  /** A JPEG cut and shrunk as a face is. */
  class New(val jpeg: ByteArray) : UsualPhoto

  data object None : UsualPhoto
}

/** The server does not know the session a call went as (a 401). */
class SessionRefused : Exception()

/**
 * A photo picked for a group's mark that the device has let go of, as the system clears its caches:
 * sending again cannot help, picking again does.
 */
class MarkPhotoGone : Exception()

/** A photo could not be sent or fetched; [status] is the server's answer, null with none. */
class PhotoFailure(val status: Int?, cause: Throwable? = null) : IOException("Photo failed: $status", cause)

/**
 * The photos the screens show and send (spec/sync-protocol.md, Profile; Groups; spec/chat.md,
 * Photos): fetched as the signed-in user for the app's image loader, which keeps them (a photo never
 * changes once stored, so a kept one is never stale). A photo picked for a group's mark is held in
 * the app's cache until the group is saved with it.
 */
internal class Photos(http: Lazy<OkHttpClient>, private val server: HttpUrl, held: Lazy<File>) {
  private val http by http
  private val held by held

  private fun heldFile(photoId: String) = File(held, "$photoId.jpg")

  /** Keeps [jpeg] on the device under a new id, to send only as the group is saved with it. */
  suspend fun hold(jpeg: ByteArray): String =
    withContext(Dispatchers.IO) {
      val photoId = UUID.randomUUID().toString()
      held.mkdirs()
      heldFile(photoId).writeBytes(jpeg)
      photoId
    }

  /** Sends the held photo [photoId] to [shelf]; [MarkPhotoGone] once the device has let it go. */
  suspend fun sendHeld(photoId: String, shelf: PhotoShelf, credentials: Credentials) {
    val jpeg = withContext(Dispatchers.IO) { heldFile(photoId).takeIf { it.exists() }?.readBytes() } ?: throw MarkPhotoGone()
    send(jpeg, photoId, shelf, credentials)
  }

  /** Sends [jpeg] to [shelf] as [photoId]: sending the same again stores nothing new. */
  suspend fun send(jpeg: ByteArray, photoId: String, shelf: PhotoShelf, credentials: Credentials) {
    put(jpeg, photoId, shelf, credentials)
  }

  /**
   * Puts [jpeg] on [shelf] as [photoId], or as its small version ([small]), telling [onSent] how many
   * of its bytes have gone as they go: a chat's photo, which the app's image cache keeps once shown.
   */
  suspend fun put(jpeg: ByteArray, photoId: String, shelf: PhotoShelf, credentials: Credentials, small: Boolean = false, onSent: (Long) -> Unit = {}) {
    val request =
      Request.Builder()
        .url(url(shelf, photoId, small))
        .header("Authorization", "Bearer ${credentials.token}")
        .put(CountedBody(jpeg, onSent))
        .build()
    answer(request) {}
  }

  /**
   * A photo from the server, or a chat photo's small version ([small]), which is the photo itself
   * while it has none: the app's image cache keeps it, so it is not kept here too.
   */
  suspend fun fetch(photoId: String, shelf: PhotoShelf, credentials: Credentials, small: Boolean): ByteArray {
    val request = Request.Builder().url(url(shelf, photoId, small)).header("Authorization", "Bearer ${credentials.token}").build()
    return answer(request) { it.body.bytes() }
  }

  /** The photo [photoId] of [shelf]: one held on the device, else the server's. */
  suspend fun photo(photoId: String, shelf: PhotoShelf, credentials: Credentials): ByteArray {
    withContext(Dispatchers.IO) { heldFile(photoId).takeIf { it.exists() }?.readBytes() }?.let { return it }
    return fetch(photoId, shelf, credentials, small = false)
  }

  /** Lets go of the held photo [photoId], the group now holding its copy. */
  suspend fun release(photoId: String) {
    withContext(Dispatchers.IO) { heldFile(photoId).delete() }
  }

  /** Drops what was held as any user, as the device goes on as another. */
  suspend fun forget() {
    withContext(Dispatchers.IO) { held.deleteRecursively() }
  }

  private fun url(shelf: PhotoShelf, photoId: String, small: Boolean = false): HttpUrl =
    server.newBuilder().addEncodedPathSegments(shelf.path.trimEnd('/')).addPathSegment(photoId).apply { if (small) addQueryParameter("size", "small") }.build()

  /** The server's answer to [request], read by [read]; cancelling the caller cancels the call, its upload with it (×). */
  private suspend fun <T> answer(request: Request, read: (Response) -> T): T =
    withContext(Dispatchers.IO) {
      try {
        http.answer(request).use {
          when {
            it.code == 401 -> throw SessionRefused()
            !it.isSuccessful -> throw PhotoFailure(it.code)
            else -> read(it)
          }
        }
      } catch (e: IOException) {
        if (e is PhotoFailure) throw e
        throw PhotoFailure(null, e)
      }
    }
}

/** A JPEG to put, telling [onSent] how many of its bytes have gone, a chunk at a time, each time it is written. */
private class CountedBody(private val jpeg: ByteArray, private val onSent: (Long) -> Unit) : RequestBody() {
  override fun contentType() = JPEG

  override fun contentLength() = jpeg.size.toLong()

  override fun writeTo(sink: BufferedSink) {
    var sent = 0
    while (sent < jpeg.size) {
      val chunk = minOf(CHUNK, jpeg.size - sent)
      sink.write(jpeg, sent, chunk)
      sink.flush()
      sent += chunk
      onSent(sent.toLong())
    }
  }

  private companion object {
    val JPEG = "image/jpeg".toMediaType()
    const val CHUNK = 16 * 1024
  }
}
