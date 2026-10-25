package app.pochical.kit

import app.pochical.v1.change
import app.pochical.v1.chatAlbum
import app.pochical.v1.chatContent
import app.pochical.v1.chatLine
import app.pochical.v1.chatPhoto
import app.pochical.v1.chatPhotoEntry
import app.pochical.v1.chatPhotos
import app.pochical.v1.chatTakenBack
import app.pochical.v1.chatWords
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@Serializable
private data class PhotoVectors(val seen: List<Seen>, val run: List<Run>) {
  @Serializable data class SeenLine(val kind: String, val hidden: Boolean, val ownChat: Boolean, val writerBlocked: Boolean)

  @Serializable data class Seen(override val name: String, val line: SeenLine, val expected: Boolean) : VectorCase

  @Serializable data class Open(val held: List<String>, val tapped: String)

  @Serializable data class Lines(val cursor: Long, val photos: List<String>, val gone: List<Long>? = null, val blocked: List<String>? = null)

  @Serializable data class Page(val seq: Long, val after: Boolean, val photos: List<String>, val offset: Int, val total: Int, val cursor: Long)

  @Serializable
  data class Step(val open: Open? = null, val latest: Boolean? = null, val lines: Lines? = null, val page: Page? = null, val show: String? = null, val reconnected: Boolean? = null)

  @Serializable data class Ask(val seq: Long, val after: Boolean)

  @Serializable data class Expected(val photos: List<String>, val shown: String?, val place: List<Int>?, val asks: List<Ask>)

  @Serializable data class Case(val step: Step, val expected: Expected)

  @Serializable data class Run(override val name: String, val ahead: Int, val steps: List<Case>) : VectorCase
}

private val photoVectors = vectors<PhotoVectors>("chat-photos")

/** A photo as the vectors name it: its line's seq and a letter for its place in the line, `a` its first. */
private fun key(name: String) = PhotoKey(name.dropLast(1).toLong(), name.last() - 'a')

private fun name(key: PhotoKey) = "${key.seq}${'a' + key.index}"

/** The photo the vectors name, its writer `w` and its line's seq. */
private fun item(name: String): ChatPhotoItem {
  val key = key(name)
  return ChatPhotoItem(key, chatPhoto { id = "p$name"; width = 1; height = 1 }, "w${key.seq}", 0)
}

/** A chat's photos alone, as spec/vectors/chat-photos.json pins them. */
class PhotoRunVectorsTest {
  @Test
  fun seen() =
    photoVectors.seen.checkEach({ it.expected }) { case ->
      // A line hidden from the reader comes as hidden, whatever it was.
      val kind = if (case.line.hidden) LineKind.Hidden else LineKind.entries.first { it.key == case.line.kind }
      PhotoRun.seen(kind, case.line.ownChat, case.line.writerBlocked)
    }

  @Test
  fun run() =
    photoVectors.run.checkEach({ case -> case.steps.map { it.expected } }) { case ->
      var run: PhotoRun? = null
      case.steps.map { (step, _) ->
        step.open?.let { run = PhotoRun.opened(it.held.map(::item), key(it.tapped), case.ahead) }
        if (step.latest == true) run = PhotoRun.latest(case.ahead)
        val now = run ?: error("a step before opening")
        step.lines?.let { now.follow(PhotoLines(it.cursor, it.photos.map(::key), it.gone.orEmpty().toSet(), it.blocked.orEmpty().toSet())) }
        step.page?.let { now.take(ChatPhotosPage("group", it.seq, it.after, it.photos.map(::item), it.offset, it.total, it.cursor)) }
        step.show?.let { now.show(key(it)) }
        if (step.reconnected == true) now.reconnected()
        val asks = now.asks().map { PhotoVectors.Ask(it.seq, it.after) }
        PhotoVectors.Expected(now.photos.map { name(it.key) }, now.shown?.let(::name), now.place?.toList(), asks)
      }
    }

  @Test
  fun aPageFromTheWireNumbersEachLinesPhotosInItsOrder() {
    val wire = chatPhotos { for ((i, seq) in listOf(4L, 4L, 4L, 6L).withIndex()) photos += chatPhotoEntry { this.seq = seq; photo = chatPhoto { id = "p$i" } } }
    assertEquals(listOf("4a", "4b", "4c", "6a"), ChatPhotosPage.of(wire).photos.map { name(it.key) })
  }
}

/** A line of the place's own chat as the group sends it: photos when [photos] names some, else words. */
private fun photoLine(seq: Long, cursor: Long = seq, photos: List<String> = emptyList(), author: String = "u1", unsent: Boolean = false) =
  change {
    this.cursor = cursor
    chatLine = chatLine {
      threadId = GROUP_THREAD
      this.seq = seq
      authorId = author
      opId = "op$seq"
      content =
        chatContent {
          when {
            unsent -> this.unsent = chatTakenBack {}
            photos.isEmpty() -> words = chatWords { text = "words" }
            else -> this.photos = chatAlbum { this.photos += photos.map { chatPhoto { id = it; width = 1; height = 1 } } }
          }
        }
    }
  }

/** The photos opened large follow the chat's photos on the device. */
@RunWith(RobolectricTestRunner::class)
class PhotoRunTest {
  private val database = AppDatabase.open(RuntimeEnvironment.getApplication(), inMemory = true)

  @After fun close() = database.close()

  private fun page(seq: Long, after: Boolean, photos: List<ChatPhotoItem>, offset: Int, total: Int, cursor: Long) =
    ChatPhotosPage(GROUP_THREAD, seq, after, photos, offset, total, cursor)

  @Test
  fun thePhotoOpenedLargeFollowsThePhotosOnTheDevice() = runTest {
    // Words at 2 and 5, at 3 a photo of someone the reader blocked, and at 4 a line of two.
    database.write {
      take(listOf(photoLine(1, photos = listOf("p1")), photoLine(2), photoLine(3, photos = listOf("p3"), author = "blocked"), photoLine(4, photos = listOf("p4a", "p4b")), photoLine(5)), "g1")
      upsert(BlockRow("blocked"))
    }
    val first = database.read { photoLines("g1", GROUP_THREAD) }
    assertEquals(5L, first.cursor)
    assertEquals(listOf("1a", "4a", "4b"), first.photos.map(::name))
    assertEquals(setOf("blocked"), first.blocked)

    val held =
      database.read { lines("g1", GROUP_THREAD, 1, 5) }.flatMap { ChatPhotoItem.of(ChatLine.of(app.pochical.v1.ChatLine.parseFrom(it.line)), first.blocked) }
    assertEquals(listOf("p1", "p4a", "p4b"), held.map { it.photo.id })
    val run = PhotoRun.opened(held, PhotoKey(4, 1))
    run.follow(first)
    run.take(page(4, after = false, listOf(held[0]), offset = 0, total = 3, cursor = 5))
    assertEquals(3 to 3, run.place)

    // 4 taken back, and a photo sent at 6.
    database.write { take(listOf(photoLine(4, cursor = 6, unsent = true), photoLine(6, cursor = 7, photos = listOf("p6"))), "g1") }
    val now = database.read { photoLines("g1", GROUP_THREAD) }
    assertEquals(7L, now.cursor)
    assertFalse(now.samePhotos(first))
    run.follow(now)
    assertEquals(listOf("p1"), run.photos.map { it.photo.id })
    assertEquals(PhotoKey(1), run.shown)
    assertNull(run.place)

    // A page the group counted before the change is dropped; one after it says where the photo is now.
    run.take(page(1, after = true, held.drop(1), offset = 1, total = 3, cursor = 5))
    assertNull(run.place)
    val sixth = item("6a").copy(photo = chatPhoto { id = "p6"; width = 1; height = 1 })
    run.take(page(1, after = true, listOf(sixth), offset = 1, total = 2, cursor = 7))
    run.take(page(1, after = false, emptyList(), offset = 0, total = 2, cursor = 7))
    assertEquals(listOf("p1", "p6"), run.photos.map { it.photo.id })
    assertEquals(1 to 2, run.place)
  }
}
