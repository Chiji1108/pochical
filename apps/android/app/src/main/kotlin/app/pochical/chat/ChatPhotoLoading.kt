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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import okio.Buffer
import okio.FileSystem
import okio.Path.Companion.toOkioPath

// How the chat's photos come (spec/chat.md, Photos), by Coil 3, as Signal and Telegram load theirs
// and iOS's ChatPhotoLoading.swift does by Nuke: fetched once however many lines, quotes and the
// photo opened large ask at once, read straight at the size they show, kept drawn in memory and as
// fetched on the disk, each within its limit, the least lately seen let go first. Faces, groups'
// photo marks and links' page pictures come the same way (`Picture`), kept drawn in memory beside
// the photos, so a line drawn again shows them at once.

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
data class Picture(val photoId: String, val shelf: PhotoShelf?)

private fun photoKey(groupId: String, photoId: String, small: Boolean) = "chat/$groupId/$photoId" + if (small) "?small" else ""

/**
 * The app's one image loader: the chat's photos at most `chatRules.photoMemoryBytes` drawn in
 * memory and `chatRules.photoDiskBytes` on the disk among the caches, the member's own read from
 * where they are held as sent and not kept twice; faces and pictures in memory beside them. What
 * the device lets go of ([ChatPhotoFiles.forgotten]: a line taken back, every photo with the
 * user) goes from both at once.
 */
fun chatImageLoader(context: Context, calls: GroupCalls, files: ChatPhotoFiles, scope: CoroutineScope): ImageLoader {
  val loader =
    ImageLoader.Builder(context)
      .memoryCache { MemoryCache.Builder().maxSizeBytes(Chat.photoMemoryBytes.toLong()).build() }
      .diskCache { DiskCache.Builder().directory(context.cacheDir.resolve("chat-photo-cache").toOkioPath()).maxSizeBytes(Chat.photoDiskBytes.toLong()).build() }
      .components {
        add(Keyer<ChatPhotoData> { data, _ -> data.key })
        add(ChatPhotoFetcher.Factory(calls, files))
        add(Keyer<Picture> { data, _ -> "picture/${data.shelf?.path}${data.photoId}" })
        add(PictureFetcher.Factory(calls))
      }
      .build()
  scope.launch {
    files.forgotten.collect { gone ->
      val groupId = (gone.shelf as? PhotoShelf.Group)?.groupId
      val photoId = gone.photoId
      if (groupId == null || photoId == null) {
        loader.memoryCache?.clear()
        loader.diskCache?.clear()
        return@collect
      }
      for (small in listOf(true, false)) {
        val key = photoKey(groupId, photoId, small)
        loader.diskCache?.remove(key)
        loader.memoryCache?.keys?.filter { it.key == key }?.forEach { loader.memoryCache?.remove(it) }
      }
    }
  }
  return loader
}

/** Fetches a chat's photo: the member's own from the device, else from the disk cache, else from the group, kept there. */
private class ChatPhotoFetcher(private val data: ChatPhotoData, private val loader: ImageLoader, private val calls: GroupCalls, private val files: ChatPhotoFiles) : Fetcher {
  override suspend fun fetch(): FetchResult = photoSource(data, loader, calls, files)

  class Factory(private val calls: GroupCalls, private val files: ChatPhotoFiles) : Fetcher.Factory<ChatPhotoData> {
    override fun create(data: ChatPhotoData, options: Options, imageLoader: ImageLoader): Fetcher = ChatPhotoFetcher(data, imageLoader, calls, files)
  }
}

/** A chat's photo as kept: the member's own from the device, else from the disk cache, else from the group, kept there. */
private suspend fun photoSource(data: ChatPhotoData, loader: ImageLoader, calls: GroupCalls, files: ChatPhotoFiles): SourceFetchResult {
  val fileSystem = FileSystem.SYSTEM
  files.held(data.groupId, data.photoId)?.let { held ->
    return SourceFetchResult(ImageSource(held.toOkioPath(), fileSystem), JPEG, DataSource.DISK)
  }
  val disk = loader.diskCache
  disk?.openSnapshot(data.key)?.let { snapshot ->
    return SourceFetchResult(ImageSource(snapshot.data, fileSystem, data.key, snapshot), JPEG, DataSource.DISK)
  }
  val bytes = calls.chatPhoto(data.photoId, PhotoShelf.Group(data.groupId), data.small)
  val editor = disk?.openEditor(data.key)
  if (editor != null) {
    try {
      fileSystem.write(editor.data) { write(bytes) }
      val snapshot = editor.commitAndOpenSnapshot()
      if (snapshot != null) return SourceFetchResult(ImageSource(snapshot.data, fileSystem, data.key, snapshot), JPEG, DataSource.NETWORK)
    } catch (e: Exception) {
      editor.abort()
      throw e
    }
  }
  return SourceFetchResult(ImageSource(Buffer().write(bytes), fileSystem), JPEG, DataSource.NETWORK)
}

/** The photo itself as it came, its bytes, to save or share: kept as the photo opened large is, fetched once. */
suspend fun wholePhoto(context: Context, calls: GroupCalls, files: ChatPhotoFiles, groupId: String, photoId: String): ByteArray =
  photoSource(ChatPhotoData(photoId, groupId, small = false), SingletonImageLoader.get(context), calls, files).source.use { it.source().readByteArray() }

private const val JPEG = "image/jpeg"

/** Fetches a face, a mark or a page's picture as the kit holds it, in memory alone. */
private class PictureFetcher(private val data: Picture, private val calls: GroupCalls) : Fetcher {
  override suspend fun fetch(): FetchResult {
    val bytes = calls.photo(data.photoId, data.shelf ?: PhotoShelf.Mine)
    return SourceFetchResult(ImageSource(Buffer().write(bytes), FileSystem.SYSTEM), null, DataSource.MEMORY)
  }

  class Factory(private val calls: GroupCalls) : Fetcher.Factory<Picture> {
    override fun create(data: Picture, options: Options, imageLoader: ImageLoader): Fetcher = PictureFetcher(data, calls)
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
