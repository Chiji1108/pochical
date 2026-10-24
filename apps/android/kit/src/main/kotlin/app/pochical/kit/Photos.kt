package app.pochical.kit

import android.util.LruCache
import java.io.File
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

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

  /** The faces of a group a live invitation opens, read by its holder (/v1/invites/{code}/photos/{id}). */
  data class Invitation(val code: String) : PhotoShelf {
    override val path = "v1/invites/$code/photos/"
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
 * The photos the screens show and send (spec/sync-protocol.md, Profile; Groups): fetched as the
 * signed-in user and kept in memory alone, never in a URL cache, so nothing of a user outlives the
 * process on the device; a photo never changes once stored, so a kept one is never stale. A photo
 * picked for a group's mark is held in the app's cache until the group is saved with it.
 */
internal class Photos(private val http: OkHttpClient, private val server: HttpUrl, private val held: File) {
  private val fetched =
    object : LruCache<String, ByteArray>(FETCHED_BYTES) {
      override fun sizeOf(key: String, value: ByteArray) = value.size
    }

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
    val request =
      Request.Builder()
        .url(url(shelf, photoId))
        .header("Authorization", "Bearer ${credentials.token}")
        .put(jpeg.toRequestBody(JPEG))
        .build()
    answer(request) {}
    fetched.put(key(shelf, photoId, credentials), jpeg)
  }

  /** The photo [photoId] of [shelf]: one held on the device, one fetched already, else the server's. */
  suspend fun photo(photoId: String, shelf: PhotoShelf, credentials: Credentials): ByteArray {
    withContext(Dispatchers.IO) { heldFile(photoId).takeIf { it.exists() }?.readBytes() }?.let { return it }
    val key = key(shelf, photoId, credentials)
    fetched.get(key)?.let { return it }
    val request = Request.Builder().url(url(shelf, photoId)).header("Authorization", "Bearer ${credentials.token}").build()
    val bytes = answer(request) { it.body.bytes() }
    fetched.put(key, bytes)
    return bytes
  }

  /** Lets go of the held photo [photoId], the group now holding its copy. */
  suspend fun release(photoId: String) {
    withContext(Dispatchers.IO) { heldFile(photoId).delete() }
  }

  /** Drops what was fetched or held as any user, as the device goes on as another. */
  suspend fun forget() {
    fetched.evictAll()
    withContext(Dispatchers.IO) { held.deleteRecursively() }
  }

  private fun url(shelf: PhotoShelf, photoId: String): HttpUrl =
    server.newBuilder().addEncodedPathSegments(shelf.path.trimEnd('/')).addPathSegment(photoId).build()

  /** The user's own and an invitation's are read alike by every user, so the user is part of the key. */
  private fun key(shelf: PhotoShelf, photoId: String, credentials: Credentials) = "${credentials.userId}/${shelf.path}$photoId"

  private suspend fun <T> answer(request: Request, read: (Response) -> T): T =
    withContext(Dispatchers.IO) {
      try {
        http.newCall(request).execute().use {
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

  private companion object {
    val JPEG = "image/jpeg".toMediaType()

    /** Faces and marks are small (chatRules.pictureMaxEdge): a screen's worth many times over. */
    const val FETCHED_BYTES = 16_000_000
  }
}
