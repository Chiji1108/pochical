package app.pochical.kit

import app.pochical.design.Chat
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext

/**
 * The member's photo lines on their way up (spec/chat.md, Photos), as iOS's PhotoUploads.swift
 * keeps them: how far each photo going up has gone, for its line to show, and a way to stop a line,
 * as Signal and Telegram ring a photo going up with × to stop it. A line uploads its photos not yet
 * up one after another (which are up is kept with it in the outbox, `PhotosUp`), is sent once all
 * are, and is then taken, or else not sent. Once its photos are all up and it is being sent it
 * cannot be stopped any more: [stop] and [send] decide under one lock, one before the other, so a
 * × tapped as the last upload ends either stops the line or does nothing.
 */
class PhotoUploads internal constructor() {
  private val lock = Any()

  private val mutableSent = MutableStateFlow<Map<String, Float>>(emptyMap())

  /** How much of each photo going up now has gone, from 0 to 1, by its id; none for one not going up (up already, or waiting its turn or for the network). */
  val sent: StateFlow<Map<String, Float>> = mutableSent.asStateFlow()

  private val mutableSending = MutableStateFlow<Set<String>>(emptySet())

  /** The lines whose photos are all up, being sent, by op_id: past stopping. */
  val sending: StateFlow<Set<String>> = mutableSending.asStateFlow()

  /** Stops the photo going up now of each line, by the line's op_id. */
  private val stops = mutableMapOf<String, () -> Unit>()

  /** The lines stopped with ×, which [send] then lets go nowhere until sent again. */
  private val stopped = mutableSetOf<String>()

  /** Each photo's try going up now, so a step of an earlier one, coming late, is not drawn. */
  private val tries = mutableMapOf<String, Any>()

  /**
   * Stops the line [opId]'s photos going up, if they are; false, stopping nothing, once they are up
   * and it is being sent. The caller marks the line not sent only on true.
   */
  fun stop(opId: String): Boolean =
    synchronized(lock) {
      if (opId in mutableSending.value) return false
      stopped += opId
      stops.remove(opId)?.invoke()
      true
    }

  /** The line [opId]'s photos are all up: it goes now unless stopped, and can then no longer be stopped; true for it to be sent. */
  internal fun send(opId: String): Boolean =
    synchronized(lock) {
      if (opId in stopped) return false
      mutableSending.update { it + opId }
      true
    }

  /** The line [opId] has gone, is sent again or is taken back: nothing of it is drawn any more, and a photo of it going up stops. */
  internal fun forget(opId: String, photoIds: List<String>) {
    synchronized(lock) {
      stopped -= opId
      stops.remove(opId)?.invoke()
      mutableSending.update { it - opId }
      for (id in photoIds) tries -= id
      mutableSent.update { it - photoIds.toSet() }
    }
  }

  /** The photo [photoId] of the line [opId] began going up as the try [attempt], which [stop] ends. */
  internal fun began(photoId: String, opId: String, attempt: Any, stop: () -> Unit) {
    synchronized(lock) {
      mutableSending.update { it - opId }
      stops[opId] = stop
      tries[photoId] = attempt
      mutableSent.update { it + (photoId to 0f) }
    }
  }

  /** A step drawn only past a hundredth, not at every packet, and never back. */
  internal fun moved(photoId: String, attempt: Any, fraction: Float) {
    synchronized(lock) {
      val was = mutableSent.value[photoId] ?: return
      if (tries[photoId] !== attempt || (fraction - was < 0.01f && !(fraction >= 1f && was < 1f))) return
      mutableSent.update { it + (photoId to minOf(fraction, 1f)) }
    }
  }

  /** Its bytes are all up: the ring stays full until the line goes. */
  internal fun finished(photoId: String, opId: String) {
    synchronized(lock) {
      stops -= opId
      tries -= photoId
      if (photoId in mutableSent.value) mutableSent.update { it + (photoId to 1f) }
    }
  }

  /** Its upload failed or was stopped. */
  internal fun ended(photoId: String, opId: String) {
    synchronized(lock) {
      stops -= opId
      tries -= photoId
      mutableSent.update { it - photoId }
    }
  }
}

/**
 * Which of a waiting line's photos are up, and when the upload of the latest began, by the server's
 * time. The group lets go of an uploader's photos no line carries once they have uploaded nothing
 * for `chatRules.unsentAfterMs`, timed from when each upload reached it; those up are trusted for
 * half that, from before the upload began, so a line sent on them reaches the group well before it
 * lets go of them, whatever the corrected clock is off by.
 */
internal data class PhotosUp(val ids: Set<String> = emptySet(), val atMs: Long = 0) {
  /** Those up may have gone from the group by the server's time [now]. */
  fun lapsed(now: Long): Boolean = now - atMs >= TRUSTED_FOR_MS

  /** Of the line's [photos], those to upload at the server's time [now]: those not up, or all of them once those up have lapsed. */
  fun toUpload(photos: List<String>, now: Long): List<String> = if (lapsed(now)) photos else photos.filter { it !in ids }

  /** [photoId] went up, its upload begun at the server's time [began]. */
  fun adding(photoId: String, began: Long): PhotosUp = PhotosUp((if (lapsed(began)) emptySet() else ids) + photoId, began)

  companion object {
    const val TRUSTED_FOR_MS = Chat.unsentAfterMs.toLong() / 2
  }
}

/** A photo that cannot go up: gone from the device, or refused by the server; its line is not sent. */
internal class PhotoCannotGo : Exception()

/** A photo's upload stopped with ×: its line is not sent, as the member marked it. */
internal class PhotoStopped : Exception()

/**
 * What uploads a waiting line's photos before the group's socket sends it (spec/chat.md, Photos):
 * the copies kept to send, the server's photos, and how far each has gone.
 */
internal class LinePhotos(val photos: Photos, val files: ChatPhotoFiles, val uploads: PhotoUploads) {
  /**
   * Uploads the member's photo [photoId] of the line [opId] to the group's photos, its small version
   * first, so the lines find it as soon as they are sent, telling [uploads] how far the two have
   * gone as one; × ([PhotoUploads.stop]) cuts it short, throwing as cancelled. [PhotoCannotGo] for
   * one the device no longer holds or the server refuses; [PhotoFailure] for one to try again.
   */
  suspend fun upload(groupId: String, photoId: String, opId: String, credentials: Credentials) {
    val jpeg = files.toUpload(groupId, photoId) ?: throw PhotoCannotGo()
    val small = withContext(Dispatchers.Default) { PhotoShrinking.small(jpeg) }
    val total = ((small?.size ?: 0) + jpeg.size).toFloat()
    val attempt = Any()
    val shelf = PhotoShelf.Group(groupId)
    supervisorScope {
      val going =
        async {
          if (small != null) photos.put(small, photoId, shelf, credentials, small = true) { sent -> uploads.moved(photoId, attempt, sent / total) }
          val before = small?.size ?: 0
          photos.put(jpeg, photoId, shelf, credentials) { sent -> uploads.moved(photoId, attempt, (before + sent) / total) }
        }
      uploads.began(photoId, opId, attempt) { going.cancel() }
      try {
        going.await()
        uploads.finished(photoId, opId)
      } catch (e: Exception) {
        uploads.ended(photoId, opId)
        // Cut short by ×, not by the socket's end, which goes on as cancelled.
        if (e is CancellationException) {
          currentCoroutineContext().ensureActive()
          throw PhotoStopped()
        }
        // Refused: sending the same again cannot help.
        if (e is PhotoFailure && e.status in 400..499) throw PhotoCannotGo()
        throw e
      }
    }
    files.up(groupId, photoId)
  }
}
