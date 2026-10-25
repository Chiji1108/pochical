package app.pochical.kit

import app.pochical.v1.ChatPhoto
import app.pochical.v1.ChatPhotos
import app.pochical.v1.ChatLine as WireLine
import kotlinx.coroutines.flow.Flow

// A chat's photos alone (spec/chat.md, Photos; spec/sync-protocol.md, Chat), as the photo opened
// large swipes through them and 写真 lists them, pinned by spec/vectors/chat-photos.json, as iOS's
// PhotoRun.swift keeps them.

/** Where one of a chat's photos is: its line's seq and its place in the line, from 0, which orders the chat's photos. */
data class PhotoKey(val seq: Long, val index: Int = 0) : Comparable<PhotoKey> {
  override fun compareTo(other: PhotoKey): Int = compareValuesBy(this, other, PhotoKey::seq, PhotoKey::index)
}

/** One of a chat's photos, as its photos alone come, and the line that sent it. */
data class ChatPhotoItem(val key: PhotoKey, val photo: ChatPhoto, val authorId: String, val sentAtMs: Long) {
  val seq: Long
    get() = key.seq

  companion object {
    /** The line's photos, when the reader sees them among the chat's: not those of someone in [blocked] in the place's own chat, where their lines fold away. */
    fun of(line: ChatLine, blocked: Set<String>): List<ChatPhotoItem> {
      if (!PhotoRun.seen(line.content.kind, ownChat = line.threadId == GROUP_THREAD, writerBlocked = line.authorId in blocked)) return emptyList()
      val photos = (line.content as? LineContent.Photos)?.photos ?: return emptyList()
      return photos.mapIndexed { index, photo -> ChatPhotoItem(PhotoKey(line.seq, index), photo, line.authorId, line.sentAtMs) }
    }
  }
}

/**
 * A page of a chat's photos, answering a ChatPhotosRequest: those nearest [seq] on the asked side,
 * whole lines' oldest first, how many come before them and how many the chat holds for the reader,
 * as the group's change log stood at [cursor].
 */
data class ChatPhotosPage(
  val threadId: String,
  val seq: Long,
  val after: Boolean,
  val photos: List<ChatPhotoItem>,
  val offset: Int,
  val total: Int,
  val cursor: Long,
) {
  /**
   * The lines the page speaks for, every photo the group has among them in it: before [seq] (all of
   * them for the latest) back to its first line, or to the chat's first; after it on to its last,
   * or to the chat's latest. Null for none.
   */
  val covers: LongRange?
    get() {
      val low: Long
      val high: Long
      if (after) {
        low = seq + 1
        high = if (offset + photos.size >= total) Long.MAX_VALUE else photos.lastOrNull()?.seq ?: seq
      } else {
        high = if (seq == 0L) Long.MAX_VALUE else seq - 1
        low = if (offset == 0) Long.MIN_VALUE else photos.firstOrNull()?.seq ?: seq
      }
      return if (low <= high) low..high else null
    }

  companion object {
    /** The page as the wire carries it: one entry a photo, a line's one after another in its order. */
    fun of(wire: ChatPhotos): ChatPhotosPage {
      val photos = mutableListOf<ChatPhotoItem>()
      for (entry in wire.photosList) {
        val last = photos.lastOrNull()
        val index = if (last?.seq == entry.seq) last.key.index + 1 else 0
        photos += ChatPhotoItem(PhotoKey(entry.seq, index), entry.photo, entry.authorId, entry.sentAtMs)
      }
      return ChatPhotosPage(wire.threadId, wire.seq, wire.after, photos, wire.offset, wire.total, wire.cursor)
    }
  }
}

/**
 * A chat's photos on the device as those open large, or listed, follow them ([PhotoRun.follow]),
 * read with the group's [cursor] they stand at: the [photos] the reader sees, in order; the lines
 * taken back or hidden from the reader ([gone]); and whose photos fold away for the reader
 * ([blocked]: those they blocked, in the place's own chat; none in a one-to-one chat).
 */
data class PhotoLines(val cursor: Long, val photos: List<PhotoKey>, val gone: Set<Long>, val blocked: Set<String>) {
  /** The same photos as [other], whatever else the group changed since. */
  fun samePhotos(other: PhotoLines): Boolean = photos == other.photos && gone == other.gone && blocked == other.blocked
}

/**
 * The photos a chat's photo opened large swipes through one by one, and its list (写真) scrolls
 * through (spec/chat.md, Photos), as spec/vectors/chat-photos.json pins them down. Those held start
 * as the lines laid out have them (listed, as none), and each page from the group takes the place
 * of those held over the lines it covers. Where the photo shown is among all of them, and how many
 * there are, is only what the group says: a change to the chat's photos on the device forgets it
 * until the group says it again, and drops any page counted before it.
 */
class PhotoRun private constructor(held: List<ChatPhotoItem>, shown: PhotoKey?, private val ahead: Int) {
  /** A page to ask the group for: the photos before the line [seq], or after it. */
  data class Ask(val seq: Long, val after: Boolean)

  /** The photos held, in order, whole lines' with no gap between. */
  var photos: List<ChatPhotoItem> = held
    private set

  /** How many photos the chat holds for the reader; null until a page says. */
  var total: Int? = null
    private set

  /** The photo shown; null once none is left, which closes it. */
  var shown: PhotoKey? = shown
    private set

  /** How many of the chat's photos come before each line held, as the group has said since the chat's photos last changed on the device. */
  private var before = mutableMapOf<Long, Int>()

  /** The chat's photos on the device as last followed; null until first followed, before which nothing is asked. */
  private var followed: PhotoLines? = null

  /** The pages asked for since the chat's photos last changed, each once. */
  private val asked = mutableSetOf<Ask>()

  /** Where the photo shown is among those held. */
  val index: Int?
    get() = photos.indexOfFirst { it.key == shown }.takeIf { it >= 0 }

  /** The photo shown's place among all the chat's, from 1, and how many there are: null until the group has said. */
  val place: Pair<Int, Int>?
    get() {
      val shown = shown ?: return null
      val before = before(shown) ?: return null
      val total = total ?: return null
      return before + 1 to maxOf(total, before + 1)
    }

  private fun before(key: PhotoKey): Int? = before[key.seq]?.plus(key.index)

  /**
   * The pages to ask for now, each once until the chat's photos change: the latest with none held;
   * both sides of the photo shown's line while where it is is unknown; else an end's next once the
   * photo shown is fewer than [ahead] from it.
   */
  fun asks(): List<Ask> {
    if (followed == null) return emptyList()
    val wanted = mutableListOf<Ask>()
    val first = photos.firstOrNull()
    val last = photos.lastOrNull()
    if (first != null && last != null) {
      val shown = shown
      val index = index
      if (shown != null && index != null) {
        if (before[shown.seq] == null) {
          wanted += Ask(shown.seq, after = false)
          wanted += Ask(shown.seq, after = true)
        } else {
          if (index < ahead && (before[first.seq] ?: 1) > 0) wanted += Ask(first.seq, after = false)
          if (photos.size - 1 - index < ahead && !atEnd(last.key)) wanted += Ask(last.seq, after = true)
        }
      }
    } else {
      wanted += Ask(0, after = false)
    }
    val new = wanted.filter { it !in asked }
    asked += new
    return new
  }

  /** The group has said no photo comes after [key]. */
  private fun atEnd(key: PhotoKey): Boolean {
    val before = before(key) ?: return false
    val total = total ?: return false
    return before + 1 >= total
  }

  /** An ask that could not be sent, to be asked again. */
  fun unasked(ask: Ask) {
    asked -= ask
  }

  /** The socket opened again: the asks not yet answered, their answers perhaps lost with it, are asked again. */
  fun reconnected() {
    asked.clear()
  }

  /**
   * A page answering one of the asks: its photos in place of those held over the lines it covers.
   * Dropped when counted before the chat's photos last changed on the device, or when it no longer
   * meets those held.
   */
  fun take(page: ChatPhotosPage) {
    val changedAt = followed?.cursor ?: return
    if (page.cursor < changedAt) return
    if (page.seq != 0L) {
      val first = photos.firstOrNull() ?: return
      val last = photos.lastOrNull() ?: return
      if (page.seq < first.seq || page.seq > last.seq) return
    }
    page.covers?.let { covers ->
      before = before.filterKeys { it !in covers }.toMutableMap()
      photos = (photos.filter { it.seq !in covers } + page.photos).sortedBy { it.key }
    }
    for ((index, photo) in page.photos.withIndex()) {
      if (photo.key.index == 0) before[photo.seq] = page.offset + index
    }
    if (!page.after && page.seq != 0L) before[page.seq] = page.offset + page.photos.size
    total = page.total
    val shown = shown
    if (shown != null) moveOff(shown) else this.shown = photos.lastOrNull()?.key
  }

  /** Swiped to the photo [key]. */
  fun show(key: PhotoKey) {
    if (photos.any { it.key == key }) shown = key
  }

  /**
   * The chat's photos on the device now. Changed since last followed (or never followed): those the
   * reader no longer sees out, the next shown in place of one gone (the one before at the end), and
   * where they are among all of them forgotten until the group says it again. The same photos, at
   * a later cursor, change nothing.
   */
  fun follow(lines: PhotoLines) {
    val was = followed
    if (was != null && lines.samePhotos(was)) return
    followed = lines
    before.clear()
    asked.clear()
    photos = photos.filter { it.seq !in lines.gone && it.authorId !in lines.blocked }
    shown?.let(::moveOff)
  }

  /** The photo shown no longer held: the next shown in its place, the one before at the end, none once none is left. */
  private fun moveOff(key: PhotoKey) {
    if (photos.any { it.key == key }) return
    shown = (photos.firstOrNull { it.key > key } ?: photos.lastOrNull())?.key
  }

  companion object {
    /** Whether the reader sees a line's photos among the chat's, by its kind: photos, not folded away as a blocked writer's are in the place's own chat (`folds`). */
    fun seen(kind: LineKind, ownChat: Boolean, writerBlocked: Boolean): Boolean = kind == LineKind.Photos && !folds(kind, ownChat, writerBlocked)

    /** Opened on [tapped], among the photos [held] of the lines laid out. */
    fun opened(held: List<ChatPhotoItem>, tapped: PhotoKey, ahead: Int = app.pochical.design.Chat.photoPageAhead): PhotoRun {
      val photos = if (held.any { it.key == tapped }) held else emptyList()
      return PhotoRun(photos, tapped.takeIf { photos.isNotEmpty() }, ahead)
    }

    /** Opened with none held, as the list of the chat's photos is: the latest page asked for, and its latest photo shown once it comes. */
    fun latest(ahead: Int = app.pochical.design.Chat.photoPageAhead): PhotoRun = PhotoRun(emptyList(), null, ahead)
  }
}

/** A chat's photos on the device, each the reader sees, read in one with the group's cursor. */
internal suspend fun SyncDao.photoLines(groupId: String, threadId: String): PhotoLines {
  val blocked = if (threadId == GROUP_THREAD) blockedIds().toSet() else emptySet()
  val lines = linesOfKinds(groupId, threadId, listOf(LineKind.Photos.key, LineKind.Unsent.key, LineKind.Hidden.key)).map { ChatLine.of(WireLine.parseFrom(it.line)) }
  return PhotoLines(
    cursor = cursorOf(groupId),
    photos = lines.flatMap { line -> ChatPhotoItem.of(line, blocked).map { it.key } },
    gone = lines.filter { it.content == LineContent.Unsent || it.content == LineContent.Hidden }.map { it.seq }.toSet(),
    blocked = blocked,
  )
}
