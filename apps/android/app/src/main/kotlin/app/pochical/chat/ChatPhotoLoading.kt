package app.pochical.chat

import android.content.Context
import android.graphics.Bitmap
import android.util.LruCache
import app.pochical.design.Chat
import app.pochical.kit.ChatPhotoFiles
import app.pochical.kit.GroupCalls
import app.pochical.kit.PhotoShelf
import app.pochical.kit.ThumbHash
import app.pochical.v1.ChatPhoto
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.decode.DataSource
import coil3.decode.ImageSource
import coil3.disk.DiskCache
import coil3.fetch.FetchResult
import coil3.fetch.Fetcher
import coil3.fetch.SourceFetchResult
import coil3.key.Keyer
import coil3.memory.MemoryCache
import coil3.request.Options
import okio.Buffer
import okio.FileSystem
import okio.Path.Companion.toOkioPath

// How the chat's photos come (spec/chat.md, Photos), by Coil 3, as Signal and Telegram load theirs
// and iOS's ChatPhotoLoading.swift does by Nuke: fetched once however many lines, quotes and the
// photo opened large ask at once, read straight at the size they show, kept drawn in memory and as
// fetched on the disk, each within its limit, the least lately seen let go first. Faces, groups'
// photo marks and links' page pictures come the same way (`Picture`), kept drawn in memory and on
// the disk beside the photos, so a line drawn again shows them at once and a notification shows its
// faces without the network.

/**
 * One of a chat's photos as an image request asks for it: its small version as the lines and
 * quotes show it ([small]), else the photo itself. [attempt] is how many times it was asked again
 * after failing, a new request each time, kept under the same key.
 */
data class ChatPhotoData(val photoId: String, val groupId: String, val small: Boolean, val attempt: Int = 0) {
  /** What it is kept under, in memory and on the disk. */
  val key: String
    get() = photoKey(groupId, photoId, small)
}

/** A face or a mark, or a link's page picture: [shelf] null for the device's own alone. */
data class Picture(val photoId: String, val shelf: PhotoShelf?) {
  /** What it is kept under, in memory and on the disk. */
  val key: String
    get() = pictureKey(shelf, photoId)
}

private fun photoKey(groupId: String, photoId: String, small: Boolean) = "chat/$groupId/$photoId" + if (small) "?small" else ""

private fun pictureKey(shelf: PhotoShelf?, photoId: String) = "picture/${shelf?.path}$photoId"

/**
 * The app's one image loader: the chat's photos at most `chatRules.photoMemoryBytes` drawn in
 * memory and `chatRules.photoDiskBytes` on the disk among the caches, the member's own read from
 * where they are held as sent and not kept twice; faces and pictures beside them, a photo never
 * changing once stored, so one kept is never stale.
 */
fun chatImageLoader(context: Context, calls: GroupCalls, files: ChatPhotoFiles): ImageLoader =
  ImageLoader.Builder(context)
    .memoryCache { MemoryCache.Builder().maxSizeBytes(Chat.photoMemoryBytes.toLong()).build() }
    .diskCache { DiskCache.Builder().directory(context.cacheDir.resolve("chat-photo-cache").toOkioPath()).maxSizeBytes(Chat.photoDiskBytes.toLong()).build() }
    .components {
      add(Keyer<ChatPhotoData> { data, _ -> data.key })
      add(ChatPhotoFetcher.Factory(calls, files))
      add(Keyer<Picture> { data, _ -> data.key })
      add(PictureFetcher.Factory(calls))
    }
    .build()

/**
 * Lets go from the app's image loader of what the device lets go of ([ChatPhotoFiles.forgotten]: a
 * line taken back; a group's photos and faces as it is left; every photo, face and picture with
 * the user, as the device erases them), from
 * memory and the disk at once. Called as the app starts, before anything syncs, so nothing let go
 * of is missed however long before the first picture is drawn.
 */
suspend fun followForgotten(files: ChatPhotoFiles, loader: () -> ImageLoader) {
  files.forgotten.collect { gone ->
    val disk = loader().diskCache
    val memory = loader().memoryCache
    val groupId = gone.shelf?.placeId
    val photoId = gone.photoId
    if (groupId == null || photoId == null) {
      memory?.clear()
      disk?.clear()
      return@collect
    }
    val keys = setOf(photoKey(groupId, photoId, small = true), photoKey(groupId, photoId, small = false), pictureKey(gone.shelf, photoId))
    keys.forEach { disk?.remove(it) }
    memory?.keys?.filter { it.key in keys }?.forEach { memory.remove(it) }
  }
}

/** Fetches a chat's photo: the member's own from the device, else from the disk cache, else from the group, kept there. */
private class ChatPhotoFetcher(private val data: ChatPhotoData, private val loader: ImageLoader, private val calls: GroupCalls, private val files: ChatPhotoFiles) : Fetcher {
  override suspend fun fetch(): FetchResult = photoSource(data, loader, calls, files)

  class Factory(private val calls: GroupCalls, private val files: ChatPhotoFiles) : Fetcher.Factory<ChatPhotoData> {
    override fun create(data: ChatPhotoData, options: Options, imageLoader: ImageLoader): Fetcher = ChatPhotoFetcher(data, imageLoader, calls, files)
  }
}

/** A chat's photo as kept: the member's own from the device, else as [diskCached] keeps it. */
private suspend fun photoSource(data: ChatPhotoData, loader: ImageLoader, calls: GroupCalls, files: ChatPhotoFiles): SourceFetchResult {
  files.held(data.groupId, data.photoId)?.let { held ->
    return SourceFetchResult(ImageSource(held.toOkioPath(), FileSystem.SYSTEM), JPEG, DataSource.DISK)
  }
  return diskCached(data.key, JPEG, loader) { calls.chatPhoto(data.photoId, PhotoShelf.place(data.groupId), data.small) }
}

/** What is kept under [key] in the loader's disk cache, else [fetch]ed and kept there. */
private suspend fun diskCached(key: String, mimeType: String?, loader: ImageLoader, fetch: suspend () -> ByteArray): SourceFetchResult {
  val fileSystem = FileSystem.SYSTEM
  val disk = loader.diskCache
  disk?.openSnapshot(key)?.let { snapshot ->
    return SourceFetchResult(ImageSource(snapshot.data, fileSystem, key, snapshot), mimeType, DataSource.DISK)
  }
  val bytes = fetch()
  val editor = disk?.openEditor(key)
  if (editor != null) {
    try {
      fileSystem.write(editor.data) { write(bytes) }
      val snapshot = editor.commitAndOpenSnapshot()
      if (snapshot != null) return SourceFetchResult(ImageSource(snapshot.data, fileSystem, key, snapshot), mimeType, DataSource.NETWORK)
    } catch (e: Exception) {
      editor.abort()
      throw e
    }
  }
  return SourceFetchResult(ImageSource(Buffer().write(bytes), fileSystem), mimeType, DataSource.NETWORK)
}

/** The photo itself as it came, its bytes, to save or share: kept as the photo opened large is, fetched once. */
suspend fun wholePhoto(context: Context, calls: GroupCalls, files: ChatPhotoFiles, groupId: String, photoId: String): ByteArray =
  photoSource(ChatPhotoData(photoId, groupId, small = false), SingletonImageLoader.get(context), calls, files).source.use { it.source().readByteArray() }

private const val JPEG = "image/jpeg"

/** Fetches a face, a mark or a page's picture as the kit holds it, kept on the disk as a chat's photo is. */
private class PictureFetcher(private val data: Picture, private val loader: ImageLoader, private val calls: GroupCalls) : Fetcher {
  override suspend fun fetch(): FetchResult = diskCached(data.key, null, loader) { calls.photo(data.photoId, data.shelf ?: PhotoShelf.Mine) }

  class Factory(private val calls: GroupCalls) : Fetcher.Factory<Picture> {
    override fun create(data: Picture, options: Options, imageLoader: ImageLoader): Fetcher = PictureFetcher(data, imageLoader, calls)
  }
}

/** The blurs photos' ThumbHashes draw, by photo, kept beside the photos so a line drawn again shows its at once. */
private val blurs = LruCache<String, Bitmap>(BLURS)

/** The blur [photo]'s ThumbHash draws, to stretch to its shape; null for one sent without one. */
fun blurOf(photo: ChatPhoto): Bitmap? {
  if (photo.thumbHash.isEmpty) return null
  blurs.get(photo.id)?.let { return it }
  val drawn = ThumbHash.decode(photo.thumbHash.toByteArray())?.bitmap() ?: return null
  blurs.put(photo.id, drawn)
  return drawn
}

/** How many blurs are kept: each is at most 32 by 32, so a few screens' worth costs little. */
private const val BLURS = 500
